import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useChat } from '../../context/ChatContext';
import { useAuthStore } from '../../context/useAuthStore';
import { apiClient } from '../../api/client';
import IncomingCallModal from './IncomingCallModal';
import VideoCallModal from './VideoCallModal';
import type { CallEndInfo } from './VideoCallModal';

// ─── Ringtone: Facebook Messenger–style ascending three-note chime ───
const createRingtone = () => {
  let ctx: AudioContext | null = null;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const play = () => {
    try {
      ctx = new AudioContext();

      const playChime = () => {
        if (!ctx) return;
        const now = ctx.currentTime;
        // Messenger-style notes: three ascending tones (E5, G#5, B5)
        const notes = [659.25, 830.61, 987.77]; // E5, G#5, B5
        const noteGap = 0.15; // gap between notes

        notes.forEach((freq, i) => {
          const t = now + i * noteGap;
          // Main sine tone
          const osc = ctx!.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;

          // Harmonic overtone for "marimba" brightness
          const osc2 = ctx!.createOscillator();
          osc2.type = 'sine';
          osc2.frequency.value = freq * 2;

          const gain = ctx!.createGain();
          const gain2 = ctx!.createGain();

          osc.connect(gain);
          osc2.connect(gain2);
          gain.connect(ctx!.destination);
          gain2.connect(ctx!.destination);

          // Quick attack, smooth decay (marimba-like envelope)
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

          gain2.gain.setValueAtTime(0, t);
          gain2.gain.linearRampToValueAtTime(0.04, t + 0.01);
          gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

          osc.start(t);
          osc.stop(t + 0.4);
          osc2.start(t);
          osc2.stop(t + 0.2);
        });
      };

      playChime();
      // Repeat pattern every ~2 seconds (like Messenger)
      intervalId = setInterval(playChime, 2000);
    } catch (_) { /* Web Audio not supported */ }
  };

  const stop = () => {
    if (intervalId) { clearInterval(intervalId); intervalId = null; }
    if (ctx) { ctx.close().catch(() => {}); ctx = null; }
  };

  return { play, stop };
};

interface IncomingCallData {
  groupId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'audio';
}

/**
 * Global component that listens for incoming calls on ANY page.
 * Should be placed inside ChatProvider (e.g. in MainLayout).
 */
const GlobalCallHandler: React.FC = () => {
  const { socket, activeCall, endCall, acceptCall } = useChat();
  const { user } = useAuthStore();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);

  const ringtoneRef = useRef(createRingtone());

  // ─── Listen for incoming calls globally ───
  useEffect(() => {
    if (!socket || !user) return;

    const handleIncoming = (data: IncomingCallData) => {
      if (data.callerId === user.id) return;
      // Don't interrupt if already in a call
      if (activeCall) return;
      setIncomingCall(data);
      ringtoneRef.current.play();
    };

    // If someone ends before we answer
    const handleCallEnded = () => {
      if (incomingCall) {
        ringtoneRef.current.stop();
        setIncomingCall(null);
      }
    };

    socket.on('call:incoming', handleIncoming);
    socket.on('call:ended', handleCallEnded);

    return () => {
      socket.off('call:incoming', handleIncoming);
      socket.off('call:ended', handleCallEnded);
    };
  }, [socket, user, activeCall, incomingCall]);

  // ─── Accept call ───
  const handleAccept = useCallback(() => {
    if (!socket || !user || !incomingCall) return;
    ringtoneRef.current.stop();
    socket.emit('call:accept', {
      groupId: incomingCall.groupId,
      accepterId: user.id,
      accepterName: user.name || 'Bạn',
    });
    
    acceptCall({
      groupId: incomingCall.groupId,
      callType: incomingCall.callType,
      remoteName: incomingCall.callerName,
      remoteAvatar: incomingCall.callerAvatar,
    });
    
    setIncomingCall(null);
  }, [socket, user, incomingCall, acceptCall]);

  // ─── Reject call ───
  const handleReject = useCallback(async () => {
    if (!socket || !user || !incomingCall) return;
    ringtoneRef.current.stop();
    socket.emit('call:reject', {
      groupId: incomingCall.groupId,
      rejecterId: user.id,
      rejectorName: user.name || 'Bạn',
    });
    // Save rejected call history
    try {
      await apiClient.post('/chat/messages/call', {
        groupId: incomingCall.groupId,
        duration: 0,
        result: 'rejected',
        callType: incomingCall.callType,
      });
    } catch (_) { /* ignore */ }
    setIncomingCall(null);
  }, [socket, user, incomingCall]);

  // ─── Close call modal ───
  const handleCallClose = useCallback(async (info: CallEndInfo) => {
    if (!activeCall) return;
    // Save call history
    try {
      await apiClient.post('/chat/messages/call', {
        groupId: activeCall.groupId,
        duration: info.duration,
        result: info.result,
        callType: info.callType,
      });
    } catch (_) { /* ignore */ }
    endCall();
  }, [activeCall, endCall]);

  return (
    <>
      {/* Incoming call popup (shown on any page) */}
      {incomingCall && !activeCall && (
        <IncomingCallModal
          callerName={incomingCall.callerName}
          callerAvatar={incomingCall.callerAvatar}
          callType={incomingCall.callType}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}

      {/* Active call modal */}
      {activeCall && socket && user && (
        <VideoCallModal
          socket={socket}
          groupId={activeCall.groupId}
          currentUserId={user.id}
          currentUserName={user.name || 'Bạn'}
          currentUserAvatar={user.avatar}
          remoteName={activeCall.remoteName}
          remoteAvatar={activeCall.remoteAvatar}
          callType={activeCall.callType}
          isCaller={activeCall.isCaller}
          onClose={handleCallClose}
        />
      )}
    </>
  );
};

export default GlobalCallHandler;
