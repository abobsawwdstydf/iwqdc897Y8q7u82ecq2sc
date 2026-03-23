import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2 } from 'lucide-react';
import { getSocket } from '../lib/socket';
import { useCallStore } from '../stores/callStore';

interface MobileCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: { id: string; displayName?: string; username: string; avatar?: string | null } | null;
  callType: 'voice' | 'video';
  isIncoming?: boolean;
}

export const MobileCallModal: React.FC<MobileCallModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  callType,
  isIncoming = false,
}) => {
  const [callState, setCallState] = useState<'calling' | 'connected' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const { setInCall, clearCall } = useCallStore();

  useEffect(() => {
    if (isOpen) {
      setInCall(true, callType, targetUser?.id || null);
      setCallState('calling');
      setDuration(0);
    } else {
      clearCall();
    }
  }, [isOpen]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (callState === 'connected') {
      timer = setInterval(() => setDuration(d => d + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [callState]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswer = () => {
    setCallState('connected');
    // TODO: Initialize WebRTC
  };

  const handleEndCall = () => {
    setCallState('ended');
    setTimeout(() => {
      onClose();
      clearCall();
    }, 500);
  };

  if (!isOpen || !targetUser) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between py-20 px-6"
          style={{
            background: callType === 'video' && callState === 'connected'
              ? 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f23 100%)'
              : 'radial-gradient(ellipse at center, #16213e 0%, #0f0f23 100%)',
          }}
        >
          {/* User Info */}
          <div className="flex flex-col items-center mt-8">
            <div className="w-32 h-32 rounded-full overflow-hidden mb-6 ring-4 ring-white/10">
              {targetUser.avatar ? (
                <img
                  src={targetUser.avatar}
                  alt={targetUser.displayName || targetUser.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-4xl font-bold">
                  {(targetUser.displayName || targetUser.username || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">
              {targetUser.displayName || targetUser.username || 'Неизвестный'}
            </h2>
            <p className="text-white/60 text-lg">
              {callState === 'calling' && (isIncoming ? 'Входящий вызов...' : 'Вызов...')}
              {callState === 'connected' && formatDuration(duration)}
              {callState === 'ended' && 'Вызов завершён'}
            </p>
          </div>

          {/* Video Preview (if video call) */}
          {callType === 'video' && callState === 'connected' && (
            <div className="absolute inset-0 -z-10">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover opacity-50"
              />
              <div className="absolute bottom-32 right-6 w-32 h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          )}

          {/* Call Controls */}
          <div className="flex flex-col items-center gap-6 mb-8">
            {callState === 'connected' && (
              <div className="flex gap-4 mb-4">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                    isMuted ? 'bg-white text-gray-900' : 'bg-white/20 text-white'
                  }`}
                >
                  {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
                </button>
                {callType === 'video' && (
                  <button
                    onClick={() => setIsVideoOff(!isVideoOff)}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      isVideoOff ? 'bg-white text-gray-900' : 'bg-white/20 text-white'
                    }`}
                  >
                    {isVideoOff ? <VideoOff size={28} /> : <Video size={28} />}
                  </button>
                )}
                <button className="w-16 h-16 rounded-full bg-white/20 text-white flex items-center justify-center">
                  <Volume2 size={28} />
                </button>
              </div>
            )}

            <div className="flex gap-8">
              {isIncoming && callState === 'calling' ? (
                <>
                  <button
                    onClick={handleAnswer}
                    className="w-20 h-20 rounded-full bg-green-500 text-white flex items-center justify-center hover:scale-110 transition-transform"
                  >
                    <Phone size={36} />
                  </button>
                  <button
                    onClick={handleEndCall}
                    className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform"
                  >
                    <PhoneOff size={36} />
                  </button>
                </>
              ) : (
                <button
                  onClick={handleEndCall}
                  className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <PhoneOff size={36} />
                </button>
              )}
            </div>

            {isIncoming && callState === 'calling' && (
              <p className="text-white/60 mt-4">
                {callType === 'video' ? 'Видеозвонок' : 'Голосовой вызов'}
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
