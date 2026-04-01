import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { getUiAvatarFallbackUrl } from '../../utils/uiAvatar';
import { resolveUploadUrl } from '../../utils/assetsUrl';

interface IncomingCallModalProps {
  callerName: string;
  callerAvatar?: string;
  callType: 'video' | 'audio';
  onAccept: () => void;
  onReject: () => void;
}

const IncomingCallModal: React.FC<IncomingCallModalProps> = ({
  callerName,
  callerAvatar,
  callType,
  onAccept,
  onReject,
}) => {
  const resolveAvatar = (url?: string, name?: string) => {
    if (url) return resolveUploadUrl(url);
    return getUiAvatarFallbackUrl(name || '?');
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-white rounded-3xl shadow-2xl p-8 w-[340px] flex flex-col items-center gap-5 animate-call-popup"
        style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}
      >
        {/* Animated ringing circle */}
        <div className="relative">
          <div className="absolute -inset-3 rounded-full border-2 border-green-400/50 animate-ping" />
          <div className="absolute -inset-5 rounded-full border border-green-400/30 animate-ping" style={{ animationDelay: '0.5s' }} />
          <img
            src={resolveAvatar(callerAvatar, callerName)}
            alt={callerName}
            className="w-20 h-20 rounded-full object-cover ring-4 ring-green-100 relative z-10"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = getUiAvatarFallbackUrl(callerName || '?');
            }}
          />
        </div>

        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-800">{callerName}</h3>
          <p className="text-sm text-gray-500 mt-1 flex items-center justify-center gap-1.5">
            {callType === 'video' ? <Video size={14} /> : <Phone size={14} />}
            {callType === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến'}
          </p>
        </div>

        {/* Pulsing text */}
        <p className="text-sm text-gray-400 animate-pulse">Đang gọi...</p>

        {/* Action buttons */}
        <div className="flex items-center gap-8 mt-2">
          {/* Reject */}
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="p-4 bg-red-500 rounded-full text-white shadow-lg shadow-red-500/30 hover:bg-red-600 transition-all duration-200 group-hover:scale-110">
              <PhoneOff size={24} />
            </div>
            <span className="text-xs text-gray-500 font-medium">Từ chối</span>
          </button>

          {/* Accept */}
          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-1.5 group"
          >
            <div className="p-4 bg-green-500 rounded-full text-white shadow-lg shadow-green-500/30 hover:bg-green-600 transition-all duration-200 group-hover:scale-110">
              <Phone size={24} />
            </div>
            <span className="text-xs text-gray-500 font-medium">Chấp nhận</span>
          </button>
        </div>
      </div>

      {/* CSS animation */}
      <style>{`
        @keyframes call-popup {
          0% { transform: scale(0.8); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-call-popup {
          animation: call-popup 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default IncomingCallModal;
