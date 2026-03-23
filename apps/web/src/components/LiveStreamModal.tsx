import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Video, Monitor, Square, Mic, MicOff, Settings, Users, Eye, Minimize2, Maximize2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';

interface LiveStreamModalProps {
  isOpen: boolean;
  onClose: () => void;
  chatId: string;
  chatName: string;
}

type StreamSourceType = 'camera' | 'screen';

export default function LiveStreamModal({ isOpen, onClose, chatId, chatName }: LiveStreamModalProps) {
  const { user } = useAuthStore();
  const { t } = useLang();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamType, setStreamType] = useState<StreamSourceType>('camera');
  const [isMuted, setIsMuted] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [pipPosition, setPipPosition] = useState({ x: 20, y: 20 });
  const [pipSize, setPipSize] = useState({ width: 320, height: 240 });

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const pipContainerRef = useRef<HTMLDivElement>(null);

  const socket = getSocket();

  // Drag functionality for PiP
  const handlePipDrag = (e: React.MouseEvent | MouseEvent) => {
    if (!pipContainerRef.current) return;
    
    const handleMove = (moveEvent: MouseEvent) => {
      const newX = moveEvent.clientX - pipSize.width / 2;
      const newY = moveEvent.clientY - pipSize.height / 2;
      
      // Boundary checks
      const maxX = window.innerWidth - pipSize.width;
      const maxY = window.innerHeight - pipSize.height;
      
      setPipPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY))
      });
    };
    
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  // Start stream
  const startStream = async () => {
    try {
      setError(null);
      let stream: MediaStream | null = null;

      if (streamType === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: !isMuted
        });
      } else if (streamType === 'screen') {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: !isMuted
        });
      }

      if (!stream) {
        setError('РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕР»СѓС‡РёС‚СЊ РґРѕСЃС‚СѓРї Рє РёСЃС‚РѕС‡РЅРёРєСѓ');
        return;
      }

      streamRef.current = stream;

      // Set preview
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      // Notify via socket
      if (socket) {
        socket.emit('start_stream', {
          chatId: parseInt(chatId),
          streamType: streamType === 'camera' ? 'video' : 'screen'
        });
      }

      setIsStreaming(true);

      // Handle screen share stop
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopStream();
      });

    } catch (err) {
      console.error('Stream error:', err);
      setError('РћС€РёР±РєР° Р·Р°РїСѓСЃРєР° С‚СЂР°РЅСЃР»СЏС†РёРё: ' + (err as Error).message);
    }
  };

  // Stop stream
  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }

    if (pipVideoRef.current) {
      pipVideoRef.current.srcObject = null;
    }

    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    if (socket) {
      socket.emit('stop_stream', { chatId: parseInt(chatId) });
    }

    setIsStreaming(false);
    setIsMinimized(false);
    onClose();
  };

  // Toggle mute
  const toggleMute = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Switch stream type
  const switchStreamType = async (type: StreamSourceType) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    setStreamType(type);
    
    try {
      let stream: MediaStream | null = null;

      if (type === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720 },
          audio: !isMuted
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: !isMuted
        });
      }

      if (stream) {
        streamRef.current = stream;
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      console.error('Switch stream error:', err);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Sync stream with PiP video
  useEffect(() => {
    if (pipVideoRef.current && streamRef.current) {
      pipVideoRef.current.srcObject = streamRef.current;
    }
    if (videoPreviewRef.current && streamRef.current) {
      videoPreviewRef.current.srcObject = streamRef.current;
    }
  }, [isMinimized, streamRef.current]);

  // Listen for viewer events
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleViewerJoined = (data: { count: number }) => {
      setViewerCount(data.count);
    };

    const handleViewerLeft = (data: { count: number }) => {
      setViewerCount(data.count);
    };

    socket.on('viewer_joined', handleViewerJoined);
    socket.on('viewer_left', handleViewerLeft);

    return () => {
      socket.off('viewer_joined', handleViewerJoined);
      socket.off('viewer_left', handleViewerLeft);
    };
  }, [socket, isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-4xl rounded-3xl bg-surface-secondary border border-white/10 overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center">
                <Video size={20} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">РўСЂР°РЅСЃР»СЏС†РёСЏ</h3>
                <p className="text-xs text-zinc-400">{chatName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isStreaming && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/20 border border-red-500/30">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-medium text-red-400">LIVE</span>
                </div>
              )}
              {isStreaming && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                  <Eye size={14} className="text-zinc-400" />
                  <span className="text-xs text-zinc-300">{viewerCount}</span>
                </div>
              )}
              {isStreaming && (
                <button
                  onClick={() => setIsMinimized(!isMinimized)}
                  className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                  title={isMinimized ? 'Р Р°Р·РІРµСЂРЅСѓС‚СЊ' : 'РЎРІРµСЂРЅСѓС‚СЊ'}
                >
                  {isMinimized ? <Maximize2 size={18} /> : <Minimize2 size={18} />}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {!isStreaming ? (
              /* Stream setup */
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium text-zinc-300 mb-3">Р’С‹Р±РµСЂРёС‚Рµ РёСЃС‚РѕС‡РЅРёРє</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setStreamType('camera')}
                      className={`p-4 rounded-xl border transition-all ${
                        streamType === 'camera'
                          ? 'bg-Nexo-500/20 border-Nexo-500/50 text-white'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      <Video size={24} className="mx-auto mb-2" />
                      <p className="text-sm font-medium">РљР°РјРµСЂР°</p>
                    </button>
                    <button
                      onClick={() => setStreamType('screen')}
                      className={`p-4 rounded-xl border transition-all ${
                        streamType === 'screen'
                          ? 'bg-Nexo-500/20 border-Nexo-500/50 text-white'
                          : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                      }`}
                    >
                      <Monitor size={24} className="mx-auto mb-2" />
                      <p className="text-sm font-medium">Р”РµРјРѕРЅСЃС‚СЂР°С†РёСЏ СЌРєСЂР°РЅР°</p>
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <button
                  onClick={startStream}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-red-500 to-orange-500 text-white font-medium hover:opacity-90 transition-opacity"
                >
                  РќР°С‡Р°С‚СЊ С‚СЂР°РЅСЃР»СЏС†РёСЋ
                </button>
              </div>
            ) : (
              /* Streaming view */
              <div className="space-y-4">
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
                  <video
                    ref={videoPreviewRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 right-4 flex items-center gap-2">
                    <div className="px-3 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-bold flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      LIVE
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={toggleMute}
                    className={`p-3 rounded-full transition-colors ${
                      isMuted ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'
                    }`}
                  >
                    {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>

                  <button
                    onClick={stopStream}
                    className="px-6 py-3 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition-colors flex items-center gap-2"
                  >
                    <Square size={18} />
                    Р—Р°РІРµСЂС€РёС‚СЊ
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Picture-in-Picture for stream owner */}
        <AnimatePresence>
          {isStreaming && isMinimized && (
            <motion.div
              ref={pipContainerRef}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="fixed z-[9999] rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20"
              style={{
                left: pipPosition.x,
                top: pipPosition.y,
                width: pipSize.width,
                height: pipSize.height,
              }}
              onMouseDown={handlePipDrag}
            >
              <video
                ref={pipVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              
              {/* PiP controls overlay */}
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-xs text-white font-medium">LIVE</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                      className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                    >
                      {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setIsMinimized(false); }}
                      className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
                    >
                      <Maximize2 size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); stopStream(); }}
                      className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
