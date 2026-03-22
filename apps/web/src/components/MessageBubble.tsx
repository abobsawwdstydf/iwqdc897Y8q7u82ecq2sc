import { useState, useRef, useEffect, memo, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Play,
  Pause,
  Download,
  FileText,
  Copy,
  Pencil,
  Trash2,
  Reply,
  Smile,
  MoreHorizontal,
  X,
  Volume2,
  Pin,
  Clock,
  VolumeX,
  Maximize,
  Minimize,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useChatStore } from '../stores/chatStore';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { extractWaveform } from '../lib/utils';
import type { Message, MediaItem, Reaction, ChatMember } from '../lib/types';
import ImageLightbox from './ImageLightbox';

interface MessageBubbleProps {
  message: Message;
  isMine: boolean;
  showAvatar: boolean;
  chatType?: 'personal' | 'group' | 'channel' | 'favorites';
  onViewProfile?: (userId: string) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onStartSelectionMode?: (id: string) => void;
}

function MessageBubble({
  message,
  isMine,
  showAvatar,
  chatType,
  onViewProfile,
  selectionMode,
  isSelected,
  onToggleSelect,
  onStartSelectionMode
}: MessageBubbleProps) {
  const { user } = useAuthStore();
  const { setReplyTo, setEditingMessage, pinnedMessages, chats } = useChatStore();
  const { t, lang } = useLang();
  const [showContext, setShowContext] = useState(false);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [deleteMenuMode, setDeleteMenuMode] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [waveformBars, setWaveformBars] = useState<number[] | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);

  // Прочитано
  const isRead = message.readBy?.some((r) => r.userId !== user?.id);

  const timeStr = new Date(message.createdAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Avoid triggering window listener instantly for other menus
    if (selectionMode) {
      onToggleSelect?.(message.id);
      return;
    }
    const rect = bubbleRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Check if text is selected inside this bubble
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && bubbleRef.current?.contains(selection?.anchorNode || null)) {
      setQuotedText(text);
    } else {
      setQuotedText(null);
    }

    const menuWidth = 208;
    const menuHeight = 350; // estimate
    let x = e.clientX;
    let y = e.clientY;

    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;

    setContextPos({ x, y });
    setShowContext(true);
  };

  const handleCopy = () => {
    if (message.content) {
      navigator.clipboard.writeText(message.content);
    }
    setShowContext(false);
  };

  const handleReply = () => {
    setReplyTo({ ...message, quote: quotedText });
    setShowContext(false);
    setQuotedText(null);
  };

  const handleEdit = () => {
    setEditingMessage(message);
    setShowContext(false);
  };

  const handleDeleteForAll = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_messages', {
        messageIds: [message.id],
        chatId: message.chatId,
        deleteForAll: true,
      });
    }
    setShowContext(false);
    setDeleteMenuMode(false);
  };

  const handleDeleteForMe = () => {
    const socket = getSocket();
    if (socket) {
      socket.emit('delete_messages', {
        messageIds: [message.id],
        chatId: message.chatId,
        deleteForAll: false,
      });
    }
    // Optimistic hide
    useChatStore.getState().hideMessages([message.id], message.chatId);
    setShowContext(false);
    setDeleteMenuMode(false);
  };

  // Имя собеседника для кнопки «Удалить также для ...»
  const chatForDelete = chats.find(c => c.id === message.chatId);
  const otherMemberName = chatForDelete?.type === 'personal'
    ? chatForDelete.members.find(m => m.user.id !== user?.id)?.user.displayName
      || chatForDelete.members.find(m => m.user.id !== user?.id)?.user.username
      || ''
    : '';

  const isPinned = pinnedMessages[message.chatId]?.id === message.id;

  const handlePin = () => {
    const socket = getSocket();
    if (socket) {
      if (isPinned) {
        socket.emit('unpin_message', { messageId: message.id, chatId: message.chatId });
      } else {
        socket.emit('pin_message', { messageId: message.id, chatId: message.chatId });
      }
    }
    setShowContext(false);
  };

  const handleReaction = (emoji: string) => {
    const socket = getSocket();
    if (socket) {
      const existingReaction = message.reactions?.find(
        (r) => r.userId === user?.id && r.emoji === emoji
      );
      if (existingReaction) {
        socket.emit('remove_reaction', { messageId: message.id, chatId: message.chatId, emoji });
      } else {
        socket.emit('add_reaction', { messageId: message.id, chatId: message.chatId, emoji });
      }
    }
    setShowContext(false);
  };

  // Аудио плеер
  const toggleAudio = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      // Ensure audio is loaded before playing
      if (audio.readyState < 2) {
        audio.load();
      }
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Audio play error:', err);
        // Try reloading and playing again
        audio.load();
        audio.play().then(() => setIsPlaying(true)).catch(console.error);
      });
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setAudioProgress((audio.currentTime / audio.duration) * 100);
      }
    };

    const onLoadedMetadata = () => {
      setAudioDuration(audio.duration);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setAudioProgress(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  // Extract real waveform from voice audio  
  useEffect(() => {
    const voiceUrl = message.media?.find((m) => m.type === 'voice')?.url;
    if (!voiceUrl) return;
    extractWaveform(voiceUrl, 28).then(setWaveformBars);
  }, [message.media]);

  const formatDuration = (sec: number) => {
    if (!sec || isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Close context menu logic
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showContext) return;
    const hideMenu = (e: MouseEvent) => {
      // Don't close if clicking inside the context menu
      if (contextMenuRef.current?.contains(e.target as Node)) {
        return;
      }
      setShowContext(false);
      setDeleteMenuMode(false);
    };
    window.addEventListener('click', hideMenu, true);
    window.addEventListener('contextmenu', hideMenu, true);
    return () => {
      window.removeEventListener('click', hideMenu, true);
      window.removeEventListener('contextmenu', hideMenu, true);
    };
  }, [showContext]);

  // Deleted message — auto-hide after 5 seconds
  const [deletedVisible, setDeletedVisible] = useState(true);
  useEffect(() => {
    if (message.isDeleted) {
      const timer = setTimeout(() => setDeletedVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [message.isDeleted]);

  if (message.isDeleted) {
    if (!deletedVisible) return null;
    return (
      <motion.div
        initial={{ opacity: 1, height: 'auto' }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, height: 0 }}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1`}
      >
        <div className="px-4 py-2 rounded-2xl text-sm italic text-zinc-600 bg-surface-tertiary/50">
          {t('messageDeleted')}
        </div>
      </motion.div>
    );
  }

  const media = Array.isArray(message.media) ? message.media : [];
  const hasImage = media.some((m) => m.type === 'image');
  const hasVoice = message.type === 'voice' || media.some((m) => m.type === 'voice');
  const hasAudio = !hasVoice && (message.type === 'audio' || media.some((m) => m.type === 'audio'));
  const hasFile = media.some((m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video' && m.type !== 'audio');
  const hasVideo = media.some((m) => m.type === 'video');

  // Группировка реакций
  const reactionGroups: Record<string, { count: number; users: string[]; isMine: boolean }> = {};
  (message.reactions || []).forEach((r) => {
    if (!reactionGroups[r.emoji]) {
      reactionGroups[r.emoji] = { count: 0, users: [], isMine: false };
    }
    reactionGroups[r.emoji].count++;
    reactionGroups[r.emoji].users.push(r.user?.displayName || r.user?.username || '');
    if (r.userId === user?.id) reactionGroups[r.emoji].isMine = true;
  });

  const senderName = message.sender?.displayName || message.sender?.username || '';
  const senderAvatar = message.sender?.avatar;

  // Copy code to clipboard
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  // Advanced Markdown formatter with quotes, code blocks with copy button
  const renderFormattedText = (text: string) => {
    if (!text) return text;
    
    // First, check for code blocks with language specification (```python ... ```)
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const beforeText = text.slice(lastIndex, match.index);
        parts.push(...processInlineMarkdown(beforeText));
      }

      // Add code block
      const language = match[1] || 'code';
      const code = match[2].trim();
      parts.push(
        <div key={`code-${match.index}`} className="my-2 rounded-lg overflow-hidden bg-gray-900/90 border border-white/10">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800/50 border-b border-white/5">
            <span className="text-xs text-gray-400 font-mono">{language}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copyCode(code);
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
            >
              <Copy size={12} />
              Копировать
            </button>
          </div>
          <pre className="p-3 overflow-x-auto text-sm">
            <code className="font-mono text-gray-100 whitespace-pre-wrap break-words">{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last code block
    if (lastIndex < text.length) {
      const remainingText = text.slice(lastIndex);
      parts.push(...processInlineMarkdown(remainingText));
    }

    return parts;
  };

  // Process inline markdown (bold, italic, strike, inline code, quotes, mentions)
  const processInlineMarkdown = (text: string): (string | JSX.Element)[] => {
    const inlineParts: (string | JSX.Element)[] = [];
    const inlineRegex = /(\*\*[\s\S]*?\*\*|\*[\s\S]*?\*|_[\s\S]*?_|~[\s\S]*?~|`[\s\S]*?`|»[\s\S]*?«|@(\w+))/g;
    let inlineLastIndex = 0;
    let inlineMatch;

    while ((inlineMatch = inlineRegex.exec(text)) !== null) {
      // Add text before match
      if (inlineMatch.index > inlineLastIndex) {
        inlineParts.push(text.slice(inlineLastIndex, inlineMatch.index));
      }

      const part = inlineMatch[0];
      const mentionUsername = inlineMatch[2]; // Group 2 is the username without @

      if (part.startsWith('**') && part.endsWith('**')) {
        inlineParts.push(<strong key={`bold-${inlineMatch.index}`} className="font-bold">{part.slice(2, -2)}</strong>);
      } else if (part.startsWith('_') && part.endsWith('_')) {
        inlineParts.push(<em key={`italic-${inlineMatch.index}`} className="italic">{part.slice(1, -1)}</em>);
      } else if (part.startsWith('*') && part.endsWith('*')) {
        inlineParts.push(<em key={`italic2-${inlineMatch.index}`} className="italic">{part.slice(1, -1)}</em>);
      } else if (part.startsWith('~') && part.endsWith('~')) {
        inlineParts.push(<del key={`strike-${inlineMatch.index}`} className="line-through opacity-80">{part.slice(1, -1)}</del>);
      } else if (part.startsWith('`') && part.endsWith('`')) {
        inlineParts.push(<code key={`inline-${inlineMatch.index}`} className="font-mono text-[13px] bg-black/20 px-1.5 py-0.5 rounded">{part.slice(1, -1)}</code>);
      } else if (part.startsWith('»') && part.endsWith('«')) {
        // Quote in «guillemets»
        inlineParts.push(
          <span key={`quote-${inlineMatch.index}`} className="italic text-zinc-400 border-l-2 border-zinc-500 pl-2">
            {part.slice(1, -1)}
          </span>
        );
      } else if (mentionUsername) {
        // @username mention
        inlineParts.push(
          <span
            key={`mention-${inlineMatch.index}`}
            className="font-semibold text-sky-300 cursor-pointer hover:underline hover:text-sky-200 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              // Find user by username and open profile or channel
              const chat = chats.find(c => c.members?.some((m) => m.user?.username === mentionUsername));
              if (chat) {
                useChatStore.getState().setActiveChat(chat.id);
                useChatStore.getState().loadMessages(chat.id);
              } else {
                // Search for channel by username
                api.globalSearch(mentionUsername).then((result: any) => {
                  const channel = result.channels?.find((c: any) => c.username === mentionUsername);
                  if (channel) {
                    useChatStore.getState().setActiveChat(channel.id);
                    useChatStore.getState().loadMessages(channel.id);
                  }
                }).catch(console.error);
              }
            }}
          >@{mentionUsername}</span>
        );
      }

      inlineLastIndex = inlineMatch.index + part.length;
    }

    // Add remaining text
    if (inlineLastIndex < text.length) {
      inlineParts.push(text.slice(inlineLastIndex));
    }

    return inlineParts;
  };

  return (
    <>
      <div
        ref={bubbleRef}
        className={`flex ${isMine ? 'justify-end' : 'justify-start'} items-end group mb-0.5 relative transition-colors duration-200 ${selectionMode ? 'px-4 -mx-4 cursor-pointer hover:bg-white/5 rounded-xl' : ''
          } ${isSelected ? 'bg-Nimbus-500/10 hover:bg-Nimbus-500/20' : ''} overflow-hidden`}
        onClick={() => {
          if (selectionMode) onToggleSelect?.(message.id);
        }}
        onContextMenu={handleContextMenu}
      >
        {/* Selection Checkbox */}
        {selectionMode && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white/30 flex items-center justify-center transition-colors">
            {isSelected && <div className="w-5 h-5 rounded-full bg-Nimbus-500 flex items-center justify-center">
              <Check size={12} className="text-white" />
            </div>}
          </div>
        )}

        {/* Аватар (чужие) */}
        {!isMine && (
          <div className={`${showAvatar ? 'w-8 mr-2' : 'w-1 mr-0'} flex-shrink-0 self-end overflow-hidden`}>
            {showAvatar ? (
              <button onClick={() => onViewProfile?.(message.senderId)}>
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-Nimbus-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        )}

        <div className={`max-w-[96%] sm:max-w-[96%] md:max-w-[94%] ${isMine ? 'items-end' : 'items-start'} flex flex-col min-w-0`}>
          {/* Имя отправителя (для групп и каналов, но не показываем для каналов, чтобы скрыть владельца) */}
          {!isMine && showAvatar && chatType !== 'channel' && (
            <button
              className="text-xs font-medium text-Nimbus-400 ml-3 mb-0.5 hover:underline"
              onClick={() => onViewProfile?.(message.senderId)}
            >
              {senderName}
            </button>
          )}

          {/* Reply */}
          {message.replyTo && (
            <div className={`mx-3 mb-1 px-3 py-1.5 rounded-lg border-l-2 border-Nimbus-500 bg-Nimbus-500/10 max-w-full`}>
              <p className="text-xs font-medium text-Nimbus-400 truncate">
                {message.replyTo.sender?.displayName || message.replyTo.sender?.username}
              </p>
              <p className="text-xs text-zinc-400 truncate">{message.quote || message.replyTo.content || t('media')}</p>
            </div>
          )}

          {/* Пузырь */}
          <div
            onContextMenu={handleContextMenu}
            onDoubleClick={handleReply}
            title={t('reply') ? `${t('reply')} (Double Click)` : 'Double click to reply'}
            className={`cursor-pointer rounded-[1.25rem] overflow-hidden transition-all duration-300 ${
              hasImage && !message.content
                ? 'p-0 shadow-none border-none'
                : isMine
                  ? 'bubble-sent text-white shadow-sm px-4 py-2.5 hover:shadow-md hover:brightness-105'
                  : 'bubble-received text-zinc-100 shadow-sm px-4 py-2.5 hover:shadow-md hover:brightness-105'
            }`}
          >
            {/* Рендер пересланного сообщения */}
            {message.forwardedFrom && (
              <div className="mb-2 text-xs opacity-90 border-l-[3px] border-white/30 pl-2">
                <span className="font-medium">{t('forwardedFrom')}: </span>
                {message.forwardedFrom.displayName || message.forwardedFrom.username}
              </div>
            )}

            {/* Альбом (изображения и видео) — ПЕРВЫЕ */}
            {hasImage && (
              <div className="w-full overflow-hidden">
                <AlbumView
                  media={media.filter((m) => m.type === 'image' || m.type === 'video')}
                  contentExists={!!message.content}
                  isMine={isMine}
                  onImageClick={setLightboxUrl}
                />
              </div>
            )}

            {/* Видео (отдельные) */}
            {hasVideo && !hasImage && (
              <div className="w-full overflow-hidden">
                {media
                  .filter((m) => m.type === 'video')
                  .map((m) => (
                    <VideoPlayer
                      key={m.id}
                      src={m.url}
                      isMine={isMine}
                      filename={m.filename || undefined}
                      onOpenLightbox={setLightboxUrl}
                    />
                  ))}
              </div>
            )}

            {/* Голосовое */}
            {hasVoice && (
              <div className="flex items-center gap-3 min-w-[200px]">
                <audio
                  ref={audioRef}
                  src={media.find((m) => m.type === 'voice')?.url}
                  preload="auto"
                  onError={(e) => console.debug('Audio load error:', e)}
                />
                <button
                  onClick={toggleAudio}
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-Nimbus-500/20 hover:bg-Nimbus-500/30'
                    } transition-colors`}
                >
                  {isPlaying ? (
                    <Pause size={16} className={isMine ? 'text-white' : 'text-Nimbus-400'} />
                  ) : (
                    <Play size={16} className={`${isMine ? 'text-white' : 'text-Nimbus-400'} ml-0.5`} />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  {/* Waveform visualization */}
                  <div
                    className="flex items-end gap-[2px] h-6 cursor-pointer"
                    onClick={(e) => {
                      const audio = audioRef.current;
                      if (!audio || !audio.duration) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const pct = (e.clientX - rect.left) / rect.width;
                      audio.currentTime = pct * audio.duration;
                      setAudioProgress(pct * 100);
                      if (!isPlaying) toggleAudio();
                    }}
                  >
                    {(waveformBars || Array(28).fill(0.5)).map((val, i) => {
                      const barHeight = Math.max(10, val * 100);
                      const progress = audioProgress / 100;
                      const barProgress = i / 28;
                      const isActive = barProgress < progress;
                      return (
                        <div
                          key={i}
                          className={`flex-1 rounded-full transition-colors duration-150 ${isActive
                            ? isMine ? 'bg-white/80' : 'bg-Nimbus-400'
                            : isMine ? 'bg-white/20' : 'bg-white/10'
                            }`}
                          style={{ height: `${barHeight}%` }}
                        />
                      );
                    })}
                  </div>
                  <span className={`text-xs mt-0.5 block ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                    {isPlaying
                      ? formatDuration(audioRef.current?.currentTime || 0)
                      : formatDuration(audioDuration || message.media?.find((m) => m.type === 'voice')?.duration || 0)}
                  </span>
                </div>
              </div>
            )}

            {/* Аудио (mp3 файлы) */}
            {hasAudio && (() => {
              const audioMedia = media.find((m) => m.type === 'audio');
              return (
                <div className="min-w-[220px]">
                  {audioMedia?.filename && (
                    <div className="flex items-center gap-2 mb-2">
                      <Volume2 size={14} className={isMine ? 'text-white/60' : 'text-Nimbus-400'} />
                      <span className={`text-xs truncate ${isMine ? 'text-white/70' : 'text-zinc-400'}`}>{audioMedia.filename}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <audio
                      ref={audioRef}
                      src={audioMedia?.url}
                      preload="auto"
                      onError={(e) => console.debug('Audio load error:', e)}
                    />
                    <button
                      onClick={toggleAudio}
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-white/20 hover:bg-white/30' : 'bg-Nimbus-500/20 hover:bg-Nimbus-500/30'
                        } transition-colors`}
                    >
                      {isPlaying ? (
                        <Pause size={16} className={isMine ? 'text-white' : 'text-Nimbus-400'} />
                      ) : (
                        <Play size={16} className={`${isMine ? 'text-white' : 'text-Nimbus-400'} ml-0.5`} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-[2px] h-6">
                        {Array.from({ length: 28 }).map((_, i) => {
                          const barHeight = [40, 65, 35, 80, 50, 90, 45, 70, 55, 85, 30, 75, 60, 95, 40, 80, 50, 70, 35, 90, 55, 65, 45, 85, 60, 75, 50, 40][i] || 50;
                          const progress = audioProgress / 100;
                          const barProgress = i / 28;
                          const isActive = barProgress < progress;
                          return (
                            <div
                              key={i}
                              className={`flex-1 rounded-full transition-colors duration-150 ${isActive
                                ? isMine ? 'bg-white/80' : 'bg-Nimbus-400'
                                : isMine ? 'bg-white/20' : 'bg-white/10'
                                }`}
                              style={{ height: `${barHeight}%` }}
                            />
                          );
                        })}
                      </div>
                      <span className={`text-xs mt-0.5 block ${isMine ? 'text-white/60' : 'text-zinc-500'}`}>
                        {isPlaying
                          ? formatDuration(audioRef.current?.currentTime || 0)
                          : formatDuration(audioDuration || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Файлы — ПОСЛЕ фото/видео */}
            {hasFile && (
              <div className="w-full overflow-hidden">
                {media
                  .filter((m) => m.type !== 'image' && m.type !== 'voice' && m.type !== 'video')
                  .map((m) => {
                    // Get file extension only (hide real filename for security)
                    const getExtension = (filename?: string | null) => {
                      if (!filename) return 'FILE';
                      const ext = filename.split('.').pop();
                      return ext ? ext.toUpperCase() : 'FILE';
                    };
                    const ext = getExtension(m.filename);
                    
                    return (
                      <a
                        key={m.id}
                        href={m.url}
                        download={m.filename || 'file'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-2 p-2 rounded-xl ${isMine ? 'bg-white/10 hover:bg-white/15' : 'bg-surface-tertiary hover:bg-surface-hover'
                          } transition-colors mb-1 w-full`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isMine ? 'bg-white/20' : 'bg-Nimbus-500/20'
                          }`}>
                          <FileText size={18} className={isMine ? 'text-white' : 'text-Nimbus-400'} />
                        </div>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-sm font-mono truncate block w-full">{ext}</p>
                          <p className={`text-xs ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
                            {m.size ? `${(m.size / 1024).toFixed(1)} ${t('kb')}` : t('download')}
                          </p>
                        </div>
                        <Download size={16} className={`flex-shrink-0 ${isMine ? 'text-white/50' : 'text-zinc-500'}`} />
                      </a>
                    );
                  })}
              </div>
            )}

            {/* Текст — ПОСЛЕДНИЙ */}
            {message.content && (
              <div className="mt-2">
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                  {renderFormattedText(message.content)}
                </p>
              </div>
            )}

            {/* Время для медиа с текстом и статусы отправки */}
            <div className="flex items-end justify-end gap-1 mt-1">
              {/* Scheduled message indicator */}
              {message.scheduledAt && (
                <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                  <Clock size={10} className="animate-pulse" />
                  Запланировано
                </span>
              )}
              {/* Sending indicator */}
              {!message.id && (
                <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                  <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                  Отправка...
                </span>
              )}
              {/* Time and read receipts */}
              {(message.id || !message.scheduledAt) && (
                <span className={`text-[10px] flex items-center gap-0.5 ${isMine ? 'text-white/50' : 'text-zinc-500'}`}>
                  {message.isEdited && <span>{t('edited')}</span>}
                  {message.scheduledAt && <Clock size={11} className="text-amber-400 mr-0.5" />}
                  {timeStr}
                  {isMine && !message.scheduledAt && (
                    message.readBy && message.readBy.length > 0 ? (
                      <CheckCheck size={13} className="text-sky-300 ml-0.5" />
                    ) : (
                      <Check size={13} className="ml-0.5" />
                    )
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Реакции с анимацией */}
          {Object.keys(reactionGroups).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 mx-1">
              {Object.entries(reactionGroups).map(([emoji, data]) => (
                <motion.button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
                    data.isMine
                      ? 'bg-Nimbus-500/30 border border-Nimbus-500/50 shadow-[0_0_10px_rgba(124,58,237,0.3)]'
                      : 'bg-surface-tertiary border border-border hover:border-zinc-600 hover:shadow-md'
                  }`}
                  title={data.users.join(', ')}
                >
                  <motion.span
                    animate={{
                      scale: [1, 1.2, 1],
                    }}
                    transition={{
                      duration: 0.3,
                      repeat: Infinity,
                      repeatDelay: 2,
                    }}
                  >
                    {emoji}
                  </motion.span>
                  <span className="text-zinc-400">{data.count}</span>
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Аватар (свои) */}
        {isMine && (
          <div className={`${showAvatar ? 'w-8 ml-2' : 'w-1 ml-0'} flex-shrink-0 self-end overflow-hidden`}>
            {showAvatar ? (
              <button onClick={() => onViewProfile?.(message.senderId)}>
                {senderAvatar ? (
                  <img src={senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-Nimbus-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {senderName[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Контекстное меню */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showContext && (
            <motion.div
              ref={contextMenuRef}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed z-[9999] w-52 rounded-[1.25rem] glass-strong shadow-2xl py-1.5 overflow-hidden border border-white/10"
              style={{ left: contextPos.x, top: contextPos.y }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {deleteMenuMode ? (
                <>
                  {/* Delete submenu */}
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                    <button
                      onClick={() => setDeleteMenuMode(false)}
                      className="p-1 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <span className="text-sm font-medium text-zinc-300">{t('delete')}</span>
                  </div>
                  <button
                    onClick={handleDeleteForMe}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                  >
                    <Trash2 size={16} className="text-zinc-400" />
                    {t('deleteForMe')}
                  </button>
                  <button
                    onClick={handleDeleteForAll}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={16} />
                    {chatForDelete?.type === 'personal' && otherMemberName
                      ? `${t('deleteAlsoFor')} ${otherMemberName}`
                      : t('deleteForAll')}
                  </button>
                </>
              ) : (
                <>
              {/* Быстрые реакции */}
              <div className="flex items-center gap-1 px-3 py-2 border-b border-border">
                {['👍', '❤️', '😂', '😮', '😢', '🔥'].map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors text-lg"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <button
                onClick={handleReply}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Reply size={16} />
                {quotedText ? t('replyWithQuote') : t('reply')}
              </button>

              <button
                onClick={() => {
                  setShowContext(false);
                  onStartSelectionMode?.(message.id);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <CheckCheck size={16} />
                {t('select')}
              </button>

              <button
                onClick={handlePin}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
              >
                <Pin size={16} />
                {isPinned ? t('unpinMessage') : t('pinMessage')}
              </button>

              {message.content && (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                >
                  <Copy size={16} />
                  {t('copy')}
                </button>
              )}

              {isMine && message.content && (
                <button
                  onClick={handleEdit}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                >
                  <Pencil size={16} />
                  {t('edit')}
                </button>
              )}

              <div className="border-t border-border my-1" />
              <button
                onClick={() => setDeleteMenuMode(true)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 size={16} />
                {t('delete')}
              </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Album Component ──────────────────────────────────────────────────

interface AlbumViewProps {
  media: MediaItem[];
  contentExists: boolean;
  isMine: boolean;
  onImageClick: (url: string) => void;
}

function AlbumView({ media, contentExists, isMine, onImageClick }: AlbumViewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const count = media.length;
  const isAlbum = count > 1;

  // Grid layout: 3 columns for albums
  const getGridClass = () => {
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-3';
    if (count === 4) return 'grid-cols-2 grid-rows-2';
    return 'grid-cols-3 grid-rows-2';
  };

  return (
    <div className={`${contentExists ? 'mb-3' : ''} ${!contentExists ? 'rounded-[1.25rem]' : ''} overflow-hidden max-w-full`}>
      {/* Album header with collapse button */}
      {isAlbum && (
        <div className={`flex items-center justify-between px-2 py-1.5 ${isMine ? 'bg-white/5' : 'bg-Nimbus-500/10'} rounded-t-[1.25rem]`}>
          <span className="text-xs text-zinc-400">
            {count} {count === 1 ? 'файл' : count <= 4 ? 'файла' : 'файлов'}
          </span>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
          >
            {isExpanded ? 'Свернуть' : 'Развернуть'}
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      )}

      {/* Media grid — smaller sizes */}
      <div className={`grid ${getGridClass()} gap-[2px] ${!isExpanded && isAlbum ? 'max-h-32 overflow-hidden' : ''}`}>
        {media.map((m, idx) => (
          <div
            key={m.id}
            className={`relative overflow-hidden cursor-pointer group ${!isExpanded && isAlbum && idx >= 3 ? 'hidden' : ''} ${
              count === 1 ? 'rounded-[1.25rem]' :
              count === 2 ? (idx === 0 ? 'rounded-l-[1.25rem] rounded-r-none' : 'rounded-r-[1.25rem] rounded-l-none') :
              count === 3 ? (idx === 2 ? 'rounded-b-[1.25rem] rounded-t-none' : 'rounded-t-[1.25rem] rounded-b-none') :
              'rounded-[0.75rem]'
            }`}>
            <div className="aspect-square w-full h-full" onClick={() => onImageClick(m.url)}>
              {m.type === 'video' ? (
                <>
                  <img src={m.thumbnail || m.url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm group-hover:scale-110 transition-transform">
                      <Play size={16} className="text-white fill-white ml-0.5" />
                    </div>
                  </div>
                </>
              ) : (
                <img
                  src={m.url}
                  alt=""
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              )}
            </div>
            {/* Overlay for collapsed album with count */}
            {!isExpanded && isAlbum && idx === 2 && count > 3 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">+{count - 2}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Show all button for collapsed albums */}
      {!isExpanded && isAlbum && count > 3 && (
        <button
          onClick={() => setIsExpanded(true)}
          className={`w-full py-2 text-xs ${isMine ? 'bg-white/10 hover:bg-white/20' : 'bg-Nimbus-500/10 hover:bg-Nimbus-500/20'} transition-colors rounded-b-[1.25rem]`}
        >
          Показать все {count} фото
        </button>
      )}
    </div>
  );
}

// ─── Video Player Component (Telegram-style) ────────────────────────

interface VideoPlayerProps {
  src: string;
  isMine: boolean;
  filename?: string;
  onOpenLightbox?: (url: string) => void;
}

function VideoPlayer({ src, isMine, filename, onOpenLightbox }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const optionsRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const progress = (videoRef.current.currentTime / videoRef.current.duration) * 100;
    setProgress(progress);
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    setIsLoading(false);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * videoRef.current.duration;
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const newVolume = parseFloat(e.target.value);
    videoRef.current.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  };

  const toggleFullscreen = () => {
    const video = videoRef.current;
    if (!video) return;

    if (!document.fullscreenElement) {
      video.requestFullscreen().catch(console.error);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.error);
      setIsFullscreen(false);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  };

  const handleVideoClick = () => {
    // Open in lightbox for fullscreen viewing
    if (onOpenLightbox) {
      onOpenLightbox(src);
    } else {
      togglePlay();
    }
  };

  const setPlaybackSpeed = (rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setPlaybackRate(rate);
      setShowSpeedMenu(false);
    }
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = src;
    a.download = filename || 'video.mp4';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setShowOptions(false);
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target as Node)) {
        setShowOptions(false);
      }
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div
      className={`relative rounded-xl overflow-hidden bg-black group ${!isFullscreen ? 'max-h-48 sm:max-h-64' : ''} max-w-full`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video element */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain max-w-full"
        onClick={handleVideoClick}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setShowControls(true);
        }}
      />

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Play/Pause button (center) */}
      {!isPlaying && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
            <Play size={32} className="text-white ml-1" />
          </div>
        </div>
      )}

      {/* Options button (always visible on hover) */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="relative" ref={optionsRef}>
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="p-2 rounded-full bg-black/60 hover:bg-black/80 transition-colors backdrop-blur-sm"
          >
            <MoreHorizontal size={20} className="text-white" />
          </button>

          {/* Options menu */}
          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-2xl overflow-hidden z-50"
              >
                {/* Speed submenu */}
                <div className="relative" ref={speedMenuRef}>
                  <button
                    onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                    className="flex items-center justify-between w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    <span>Скорость</span>
                    <span className="text-xs text-zinc-400">{playbackRate}x</span>
                  </button>

                  {/* Speed options */}
                  <AnimatePresence>
                    {showSpeedMenu && (
                      <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="px-2 py-2 bg-black/40 border-t border-white/5"
                      >
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                          <button
                            key={rate}
                            onClick={() => setPlaybackSpeed(rate)}
                            className={`flex items-center justify-between w-full px-3 py-2 text-sm rounded-lg transition-colors ${
                              playbackRate === rate
                                ? 'bg-Nimbus-500/30 text-Nimbus-400'
                                : 'text-white hover:bg-white/10'
                            }`}
                          >
                            <span>{rate}x</span>
                            {playbackRate === rate && <Check size={14} />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Download */}
                <button
                  onClick={handleDownload}
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-white hover:bg-white/10 transition-colors border-t border-white/5"
                >
                  <Download size={16} />
                  Скачать
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Controls overlay */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 flex flex-col justify-end p-4"
          >
            {/* Top bar - filename and fullscreen */}
            <div className="flex items-center justify-between mb-4">
              {filename && (
                <span className="text-white/80 text-sm truncate max-w-[70%]">{filename}</span>
              )}
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
              >
                {isFullscreen ? <Minimize size={20} className="text-white" /> : <Maximize size={20} className="text-white" />}
              </button>
            </div>

            {/* Progress bar */}
            <div
              className="w-full h-1 bg-white/30 rounded-full cursor-pointer group/progress mb-4"
              onClick={handleProgressClick}
            >
              <div
                className={`h-full rounded-full relative ${isMine ? 'bg-white' : 'bg-Nimbus-400'}`}
                style={{ width: `${progress}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
              </div>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {isPlaying ? (
                    <Pause size={24} className="text-white" />
                  ) : (
                    <Play size={24} className="text-white ml-0.5" />
                  )}
                </button>

                {/* Volume */}
                <div className="flex items-center gap-2 group/volume">
                  <button
                    onClick={toggleMute}
                    className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX size={20} className="text-white" />
                    ) : (
                      <Volume2 size={20} className="text-white" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover/volume:w-20 transition-all duration-200 accent-white"
                  />
                </div>

                {/* Time */}
                <span className="text-white/80 text-xs">
                  {formatTime(videoRef.current?.currentTime || 0)} / {formatTime(duration)}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(MessageBubble);
