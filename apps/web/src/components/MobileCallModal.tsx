import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Volume2, ChevronUp } from 'lucide-react';
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
  const [showControls, setShowControls] = useState(true);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState(false);
  const [micPermissionGranted, setMicPermissionGranted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { setInCall, clearCall } = useCallStore();

  // Cache camera/mic permissions
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        if (navigator.permissions) {
          const micStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          const camStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
          setMicPermissionGranted(micStatus.state === 'granted');
          setCameraPermissionGranted(camStatus.state === 'granted');
        }
      } catch (e) {
        console.warn('Permissions API not supported');
      }
    };
    checkPermissions();
  }, []);

  useEffect(() => {
    if (isOpen) {
      setInCall(true, callType, targetUser?.id || null);
      setCallState('calling');
      setDuration(0);
      
      // Request permissions once on mount
      if (callType === 'video' && !cameraPermissionGranted) {
        navigator.mediaDevices.getUserMedia({ video: true })
          .then(stream => {
            stream.getTracks().forEach(track => track.stop());
            setCameraPermissionGranted(true);
          })
          .catch(() => {});
      }
      if (!micPermissionGranted) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(stream => {
            stream.getTracks().forEach(track => track.stop());
            setMicPermissionGranted(true);
          })
          .catch(() => {});
      }
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

  // Auto-hide controls
  useEffect(() => {
    if (callState === 'connected') {
      const hideControls = () => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
      };
      
      hideControls();
      
      const resetTimer = () => {
        setShowControls(true);
        hideControls();
      };
      
      window.addEventListener('mousemove', resetTimer);
      window.addEventListener('touchstart', resetTimer);
      
      return () => {
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        window.removeEventListener('mousemove', resetTimer);
        window.removeEventListener('touchstart', resetTimer);
      };
    }
  }, [callState]);

  const formatDuration = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleAnswer = useCallback(() => {
    setCallState('connected');
  }, []);

  const handleEndCall = useCallback(() => {
    setCallState('ended');
    setTimeout(() => {
      onClose();
      clearCall();
    }, 500);
  }, [onClose, clearCall]);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    setIsVideoOff(prev => !prev);
  }, []);

  if (!isOpen || !targetUser) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col"
          style={{
            background: callType === 'video' && callState === 'connected'
              ? 'radial-gradient(ellipse at center, #1a1a2e 0%, #0f0f23 100%)'
              : 'radial-gradient(ellipse at center, #16213e 0%, #0f0f23 100%)',
          }}
          onClick={() => setShowControls(true)}
        >
          {/* User Info - Top */}
          <div className="flex flex-col items-center justify-center pt-16 pb-8">
            <div className="w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden mb-4 ring-4 ring-white/10 flex-shrink-0">
              {targetUser.avatar && typeof targetUser.avatar === 'string' ? (
                <img
                  src={targetUser.avatar}
                  alt={targetUser.displayName || targetUser.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl md:text-4xl font-bold">
                  {(targetUser.displayName || targetUser.username || '?')[0].toUpperCase()}
                </div>
              )}
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 text-center px-4">
              {targetUser.displayName || targetUser.username || 'РќРµРёР·РІРµСЃС‚РЅС‹Р№'}
            </h2>
            <p className="text-white/60 text-base md:text-lg">
              {callState === 'calling' && (isIncoming ? 'Р’С…РѕРґСЏС‰РёР№ РІС‹Р·РѕРІ...' : 'Р’С‹Р·РѕРІ...')}
              {callState === 'connected' && formatDuration(duration)}
              {callState === 'ended' && 'Р’С‹Р·РѕРІ Р·Р°РІРµСЂС€С‘РЅ'}
            </p>
          </div>

          {/* Video Preview (if video call) */}
          {callType === 'video' && callState === 'connected' && (
            <div className="flex-1 relative">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-50"
              />
              <div className="absolute bottom-24 right-4 w-24 h-32 md:w-32 md:h-48 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20">
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

          {/* Spacer */}
          <div className="flex-1" />

          {/* Call Controls - Bottom */}
          <AnimatePresence>
            {showControls && (
              <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 100, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="flex flex-col items-center gap-6 pb-12 px-4"
              >
                {callState === 'connected' && (
                  <div className="flex gap-4 flex-wrap justify-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                      className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                        isMuted ? 'bg-white text-gray-900' : 'bg-white/20 text-white'
                      }`}
                      aria-label={isMuted ? 'Р’РєР»СЋС‡РёС‚СЊ РјРёРєСЂРѕС„РѕРЅ' : 'Р’С‹РєР»СЋС‡РёС‚СЊ РјРёРєСЂРѕС„РѕРЅ'}
                    >
                      {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                    </button>
                    {callType === 'video' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleVideo(); }}
                        className={`w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all flex-shrink-0 ${
                          isVideoOff ? 'bg-white text-gray-900' : 'bg-white/20 text-white'
                        }`}
                        aria-label={isVideoOff ? 'Р’РєР»СЋС‡РёС‚СЊ РІРёРґРµРѕ' : 'Р’С‹РєР»СЋС‡РёС‚СЊ РІРёРґРµРѕ'}
                      >
                        {isVideoOff ? <VideoOff size={24} /> : <Video size={24} />}
                      </button>
                    )}
                    <button
                      onClick={(e) => e.stopPropagation()}
                      className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-white/20 text-white flex items-center justify-center flex-shrink-0"
                      aria-label="Р“СЂРѕРјРєРѕСЃС‚СЊ"
                    >
                      <Volume2 size={24} />
                    </button>
                  </div>
                )}

                <div className="flex gap-6 flex-wrap justify-center">
                  {isIncoming && callState === 'calling' ? (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleAnswer(); }}
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-green-500 text-white flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0"
                        aria-label="РћС‚РІРµС‚РёС‚СЊ"
                      >
                        <Phone size={32} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEndCall(); }}
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0"
                        aria-label="РћС‚РєР»РѕРЅРёС‚СЊ"
                      >
                        <PhoneOff size={32} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEndCall(); }}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500 text-white flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0"
                      aria-label="Р—Р°РІРµСЂС€РёС‚СЊ"
                    >
                      <PhoneOff size={32} />
                    </button>
                  )}
                </div>

                {isIncoming && callState === 'calling' && (
                  <p className="text-white/60 mt-2 text-sm md:text-base">
                    {callType === 'video' ? 'Р’РёРґРµРѕР·РІРѕРЅРѕРє' : 'Р“РѕР»РѕСЃРѕРІРѕР№ РІС‹Р·РѕРІ'}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hide controls hint */}
          {callState === 'connected' && showControls && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 text-white/40 text-sm"
            >
              <ChevronUp size={20} />
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
