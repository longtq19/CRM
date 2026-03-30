import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import { getUiAvatarFallbackUrl } from '../../utils/uiAvatar';
import { resolveUploadUrl } from '../../utils/assetsUrl';

export interface CallEndInfo {
  /** seconds the call lasted (0 if never connected) */
  duration: number;
  /** 'completed' = connected & ended normally; 'missed' = caller hung up before answer; 'rejected' = receiver rejected */
  result: 'completed' | 'missed' | 'rejected';
  callType: 'video' | 'audio';
}

interface VideoCallModalProps {
  socket: Socket;
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  remoteName: string;
  remoteAvatar?: string;
  callType: 'video' | 'audio';
  isCaller: boolean;
  onClose: (info: CallEndInfo) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

type CallStatus = 'calling' | 'connecting' | 'connected' | 'ended';

const VideoCallModal: React.FC<VideoCallModalProps> = ({
  socket,
  groupId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  remoteName,
  remoteAvatar,
  callType,
  isCaller,
  onClose,
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const closedRef = useRef(false);

  const [status, setStatus] = useState<CallStatus>(isCaller ? 'calling' : 'connecting');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(callType === 'audio');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callDurationRef = useRef(0);
  const connectedRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // ─── Cleanup / close helpers ───
  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current = null;
    screenStreamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const closeWithResult = useCallback((result: CallEndInfo['result']) => {
    if (closedRef.current) return;
    closedRef.current = true;
    cleanup();
    onClose({ duration: callDurationRef.current, result, callType });
  }, [cleanup, onClose, callType]);

  // ─── Create PeerConnection (shared) ───
  const createPC = useCallback((stream: MediaStream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call:ice-candidate', {
          groupId,
          candidate: event.candidate.toJSON(),
          fromUserId: currentUserId,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[VideoCall] ICE state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setStatus('connected');
        connectedRef.current = true;
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        closeWithResult(connectedRef.current ? 'completed' : 'missed');
      }
    };

    return pc;
  }, [socket, groupId, currentUserId, closeWithResult]);

  // ─── Send offer (caller only, after accepted) ───
  const sendOffer = useCallback(async (pc: RTCPeerConnection) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('call:offer', {
        groupId,
        offer: pc.localDescription,
        fromUserId: currentUserId,
      });
      setStatus('connecting');
      console.log('[VideoCall] Offer sent');
    } catch (err) {
      console.error('[VideoCall] Failed to create offer:', err);
    }
  }, [socket, groupId, currentUserId]);

  // ─── Process queued ICE candidates ───
  const drainIceQueue = useCallback(async (pc: RTCPeerConnection) => {
    while (iceCandidateQueue.current.length > 0) {
      const c = iceCandidateQueue.current.shift();
      if (c) {
        try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) { /* ignore */ }
      }
    }
  }, []);

  // ─── Main effect: init media + socket listeners ───
  useEffect(() => {
    let mounted = true;

    // IMPORTANT: ensure this socket is in the group room so it receives
    // WebRTC signaling events (offer/answer/ice-candidate) that are
    // broadcast to the groupId room by the backend.
    socket.emit('join_group', groupId);

    const init = async () => {
      // 1. Get media
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true,
        });
      } catch (err) {
        console.error('[VideoCall] getUserMedia failed:', err);
        alert('Không thể truy cập camera/microphone. Vui lòng kiểm tra quyền truy cập.');
        closeWithResult('missed');
        return;
      }
      if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      // 2. Create PeerConnection
      const pc = createPC(stream);

      // 3. If CALLER → wait for call:accepted, THEN send offer
      //    If RECEIVER → we already accepted, wait for offer to arrive
      if (isCaller) {
        // Caller: we opened modal immediately, now wait for accepted
        const onAccepted = () => {
          console.log('[VideoCall] Call accepted, sending offer...');
          sendOffer(pc);
        };
        socket.on('call:accepted', onAccepted);
        // store for cleanup
        (pc as any)._onAccepted = onAccepted;
      }
      // (receiver just waits for call:offer, handled below)
    };

    init();

    // ─── Socket handlers ───
    const handleOffer = async (data: { groupId: string; offer: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (data.fromUserId === currentUserId) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        console.log('[VideoCall] Received offer, creating answer...');
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', {
          groupId,
          answer: pc.localDescription,
          fromUserId: currentUserId,
        });
        await drainIceQueue(pc);
      } catch (err) {
        console.error('[VideoCall] Error handling offer:', err);
      }
    };

    const handleAnswer = async (data: { groupId: string; answer: RTCSessionDescriptionInit; fromUserId: string }) => {
      if (data.fromUserId === currentUserId) return;
      const pc = pcRef.current;
      if (!pc) return;
      try {
        console.log('[VideoCall] Received answer');
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await drainIceQueue(pc);
      } catch (err) {
        console.error('[VideoCall] Error handling answer:', err);
      }
    };

    const handleIceCandidate = async (data: { groupId: string; candidate: RTCIceCandidateInit; fromUserId: string }) => {
      if (data.fromUserId === currentUserId) return;
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) {
        iceCandidateQueue.current.push(data.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('[VideoCall] ICE candidate error:', err);
      }
    };

    const handleCallEnded = () => {
      closeWithResult(connectedRef.current ? 'completed' : 'missed');
    };

    const handleCallRejected = () => {
      closeWithResult('rejected');
    };

    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:rejected', handleCallRejected);

    return () => {
      mounted = false;
      socket.off('call:offer', handleOffer);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:rejected', handleCallRejected);
      // cleanup caller-specific listener
      const pc = pcRef.current;
      if (pc && (pc as any)._onAccepted) {
        socket.off('call:accepted', (pc as any)._onAccepted);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Call duration timer ───
  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => {
        callDurationRef.current += 1;
        setCallDuration(callDurationRef.current);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [status]);

  const handleEndCall = useCallback(() => {
    socket.emit('call:end', { groupId, userId: currentUserId });
    closeWithResult(connectedRef.current ? 'completed' : 'missed');
  }, [socket, groupId, currentUserId, closeWithResult]);

  // ─── Toggle controls ───
  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      setIsMuted((prev) => !prev);
    }
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      setIsCameraOff((prev) => !prev);
    }
  };

  const screenSenderRef = useRef<RTCRtpSender | null>(null);

  const toggleScreenShare = async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      const existingVideoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
      const stream = localStreamRef.current;

      if (stream && stream.getVideoTracks().length > 0) {
        // Video call: restore original camera track
        const videoTrack = stream.getVideoTracks()[0];
        if (existingVideoSender) await existingVideoSender.replaceTrack(videoTrack);
      } else if (screenSenderRef.current) {
        // Audio call: remove the screen sender we added
        try { pc.removeTrack(screenSenderRef.current); } catch (_) { /* ignore */ }
        screenSenderRef.current = null;
        // Renegotiate
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:offer', { groupId, offer: pc.localDescription, fromUserId: currentUserId });
        } catch (_) { /* ignore */ }
      }

      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];

        const existingVideoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (existingVideoSender) {
          // Video call: just replace track
          await existingVideoSender.replaceTrack(screenTrack);
        } else {
          // Audio call: add new video track to peer connection
          const sender = pc.addTrack(screenTrack, screenStream);
          screenSenderRef.current = sender;
          // Renegotiate so remote peer gets the new video track
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call:offer', { groupId, offer: pc.localDescription, fromUserId: currentUserId });
        }

        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => { toggleScreenShare(); };
        setIsScreenSharing(true);
      } catch (err) {
        console.error('[VideoCall] Screen share error:', err);
      }
    }
  };

  const toggleFullscreen = () => {
    if (modalRef.current) {
      if (!document.fullscreenElement) {
        modalRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const resolveAvatar = (url?: string, name?: string) => {
    if (url) return resolveUploadUrl(url);
    return getUiAvatarFallbackUrl(name || '?');
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[9999] bg-gray-900 flex flex-col"
      style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img
            src={resolveAvatar(remoteAvatar, remoteName)}
            alt={remoteName}
            className="w-10 h-10 rounded-full object-cover ring-2 ring-white/20"
          />
          <div>
            <h3 className="text-white font-semibold text-lg">{remoteName}</h3>
            <p className="text-sm text-gray-400">
              {status === 'calling' && '🔔 Đang gọi...'}
              {status === 'connecting' && '🔗 Đang kết nối...'}
              {status === 'connected' && `🟢 ${formatDuration(callDuration)}`}
              {status === 'ended' && '📴 Đã kết thúc'}
            </p>
          </div>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
          title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
        >
          {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
        </button>
      </div>

      {/* Video area */}
      <div className="flex-1 relative bg-gray-800 overflow-hidden">
        <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-contain" />

        {status !== 'connected' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/70 gap-4">
            <img
              src={resolveAvatar(remoteAvatar, remoteName)}
              alt={remoteName}
              className="w-24 h-24 rounded-full object-cover ring-4 ring-white/20 shadow-2xl"
            />
            <h2 className="text-white text-2xl font-bold">{remoteName}</h2>
            <p className="text-gray-300 text-lg animate-pulse">
              {status === 'calling' ? 'Đang gọi...' : 'Đang kết nối...'}
            </p>
            <div className="absolute w-32 h-32 rounded-full border-2 border-white/20 animate-ping" style={{ animationDuration: '2s' }} />
            <div className="absolute w-40 h-40 rounded-full border border-white/10 animate-ping" style={{ animationDuration: '3s' }} />
          </div>
        )}

        {/* Local video PiP */}
        <div className="absolute bottom-4 right-4 w-48 h-36 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-gray-700">
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {isCameraOff && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
              <img src={resolveAvatar(currentUserAvatar, currentUserName)} alt="You" className="w-16 h-16 rounded-full object-cover" />
            </div>
          )}
          {isScreenSharing && (
            <div className="absolute top-1 left-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              Đang chia sẻ MH
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4 px-6 py-5 bg-gray-900/90 backdrop-blur-sm">
        <button onClick={toggleMute} className={`p-4 rounded-full transition-all duration-200 ${isMuted ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/30 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`} title={isMuted ? 'Bật mic' : 'Tắt mic'}>
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <button onClick={toggleCamera} className={`p-4 rounded-full transition-all duration-200 ${isCameraOff ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/30 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`} title={isCameraOff ? 'Bật camera' : 'Tắt camera'}>
          {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
        </button>
        <button onClick={toggleScreenShare} className={`p-4 rounded-full transition-all duration-200 ${isScreenSharing ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-blue-500/30 shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'}`} title={isScreenSharing ? 'Dừng chia sẻ' : 'Chia sẻ màn hình'}>
          {isScreenSharing ? <MonitorOff size={22} /> : <Monitor size={22} />}
        </button>
        <button onClick={handleEndCall} className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/40 transition-all duration-200 scale-110" title="Kết thúc cuộc gọi">
          <PhoneOff size={24} />
        </button>
      </div>
    </div>
  );
};

export default VideoCallModal;
