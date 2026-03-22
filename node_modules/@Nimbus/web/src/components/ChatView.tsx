import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone,
  Video,
  MoreVertical,
  Search,
  X,
  ArrowDown,
  Trash2,
  UserPlus,
  Bell,
  BellOff,
  Settings,
  Eraser,
  Pin,
  Forward,
  Bookmark,
  PhoneOff,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { isChatMuted, toggleMuteChat } from '../lib/sounds';
import { useLang } from '../lib/i18n';
import { formatLastSeen } from '../lib/utils';
import type { UserBasic, Message } from '../lib/types';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import UserProfile from './UserProfile';
import GroupSettings from './GroupSettings';
import ForwardModal from './ForwardModal';
import ConfirmModal from './ConfirmModal';
import Avatar from './Avatar';
import { useThemeStore } from '../stores/themeStore';

export default function ChatView({ onStartCall, onStartGroupCall, onStartStream, onBack }: { 
  onStartCall?: (targetUser: UserBasic, type: 'voice' | 'video') => void; 
  onStartGroupCall?: (chatId: string, chatName: string, type: 'voice' | 'video') => void; 
  onStartStream?: (chatId: string, chatName: string) => void;
  onBack?: () => void 
}) {
  const { user } = useAuthStore();
  const { t, lang } = useLang();
  const { chatTheme } = useThemeStore();
  const {
    activeChat,
    chats,
    messages,
    typingUsers,
    pinnedMessages,
    isLoadingMessages,
    setActiveChat,
  } = useChatStore();

  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [profileChannelId, setProfileChannelId] = useState<string | null>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showCallPopup, setShowCallPopup] = useState(false);
  const callPopupRef = useRef<HTMLDivElement>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => void } | null>(null);
  const [scrollReady, setScrollReady] = useState(false);
  const [activeGroupCallParticipants, setActiveGroupCallParticipants] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const topMenuRef = useRef<HTMLDivElement>(null);
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const chatViewRef = useRef<HTMLDivElement>(null);

  const chat = chats.find((c) => c.id === activeChat);
  const chatMessages = activeChat ? messages[activeChat] || [] : [];
  const pinnedMsg = activeChat ? pinnedMessages[activeChat] : null;

  // Количество непрочитанных сообщений (для бейджика)
  const unreadCount = chatMessages.filter(
    (m) => m.senderId !== user?.id && !m.readBy?.some((r) => r.userId === user?.id)
  ).length;

  const otherMember = chat?.members.find((m) => m.user.id !== user?.id);
  const isFavorites = chat?.type === 'favorites';
  const chatName = isFavorites
    ? t('favorites')
    : chat?.type === 'personal'
      ? otherMember?.user.displayName || otherMember?.user.username || t('chat')
      : chat?.name || t('group');
  const chatAvatar = isFavorites
    ? null
    : chat?.type === 'personal'
      ? otherMember?.user.avatar
      : chat?.avatar;
  const isOnline = chat?.type === 'personal' && otherMember?.user.isOnline;

  const typingInChat = typingUsers.filter((t) => t.chatId === activeChat && t.userId !== user?.id);

  // Load muted state
  useEffect(() => {
    if (activeChat) {
      setMuted(isChatMuted(activeChat));
      setScrollReady(false);
      setActiveGroupCallParticipants([]);
    }
  }, [activeChat]);

  // Listen for active group calls
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (data: { chatId: string; participants: string[] }) => {
      if (data.chatId === activeChat) {
        setActiveGroupCallParticipants(data.participants.filter(p => p !== user?.id));
      }
    };
    socket.on('group_call_active', handler);
    // Request current status when opening a group chat
    if (activeChat && chat?.type === 'group') {
      socket.emit('group_call_status', { chatId: activeChat });
    }
    return () => { socket.off('group_call_active', handler); };
  }, [activeChat, user?.id, chat?.type]);

  // Close top menu on click outside
  useEffect(() => {
    if (!showTopMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (topMenuRef.current && !topMenuRef.current.contains(e.target as Node)) {
        setShowTopMenu(false);
      }
    };
    // Use setTimeout to avoid the same click that opened the menu from closing it
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showTopMenu]);

  // Close delete menu on click outside
  useEffect(() => {
    if (!showDeleteMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(e.target as Node)) {
        setShowDeleteMenu(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showDeleteMenu]);

  // Close call popup on click outside
  useEffect(() => {
    if (!showCallPopup) return;
    const handleClick = (e: MouseEvent) => {
      if (callPopupRef.current && !callPopupRef.current.contains(e.target as Node)) {
        setShowCallPopup(false);
      }
    };
    const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick);
    };
  }, [showCallPopup]);

  // Прокрутка вниз
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'end' });
  }, []);

  // Первичная прокрутка при открытии чата или после загрузки (layout effect — до отрисовки)
  useLayoutEffect(() => {
    if (!isLoadingMessages && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
      setScrollReady(true);
    }
  }, [activeChat, isLoadingMessages]);

  // Scroll on new message arrivals
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.senderId === user?.id) {
        setTimeout(() => scrollToBottom(true), 50);
      } else {
        // Если пользователь внизу — прокрутить
        const container = messagesContainerRef.current;
        if (container) {
          const isNearBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight < 250;
          if (isNearBottom) setTimeout(() => scrollToBottom(true), 50);
        }
      }
    }
  }, [chatMessages.length, user?.id, scrollToBottom]);

  // Read receipts — debounced via ref to avoid excessive emits
  const sentReadIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeChat || !user?.id) return;
    // Reset tracked IDs when switching chats
    sentReadIdsRef.current.clear();
  }, [activeChat, user?.id]);

  useEffect(() => {
    if (!activeChat || !user?.id) return;
    const unread = chatMessages.filter(
      (m) => m.senderId !== user.id && !m.readBy?.some((r) => r.userId === user.id) && !sentReadIdsRef.current.has(m.id)
    );
    if (unread.length > 0) {
      const ids = unread.map((m) => m.id);
      ids.forEach((id) => sentReadIdsRef.current.add(id));
      const socket = getSocket();
      if (socket) {
        socket.emit('read_messages', {
          chatId: activeChat,
          messageIds: ids,
        });
      }
      // Update local store immediately for current user
      useChatStore.getState().markRead(activeChat, user.id, ids);
    }
  }, [chatMessages.length, activeChat, user?.id]);

  // Scroll detection
  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    setShowScrollDown(!isNearBottom);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chatViewRef.current) return;
    const { left, top } = chatViewRef.current.getBoundingClientRect();
    chatViewRef.current.style.setProperty('--mouse-x', `${e.clientX - left}px`);
    chatViewRef.current.style.setProperty('--mouse-y', `${e.clientY - top}px`);
  };

  // Поиск сообщений
  useEffect(() => {
    if (!searchText.trim() || !activeChat) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchMessages(searchText, activeChat);
        setSearchResults(results);
      } catch (e) {
        console.error(e);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, activeChat]);

  const openSearch = () => {
    setShowSearch(true);
    setShowTopMenu(false);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  if (!activeChat || !chat) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-secondary/50 rounded-[2rem] overflow-hidden border border-white/5 shadow-2xl relative z-0 backdrop-blur-3xl group">
        {/* Slowly pulsing purple background as requested */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden transition-opacity duration-[10000ms]">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[60vw] max-w-[800px] max-h-[800px] bg-Nimbus-600/10 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-purple-600/15 rounded-full blur-[100px] animate-[pulse_12s_ease-in-out_infinite_reverse]" />
        </div>

        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wMSkvPjwvc3ZnPg==')] [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_100%)] opacity-20 pointer-events-none" />

        <div className="text-center relative z-10 w-full max-w-sm px-6 no-select">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-28 h-28 mx-auto mb-8 rounded-[2rem] bg-gradient-to-br from-Nimbus-500/20 to-purple-600/20 flex items-center justify-center shadow-[0_0_60px_-15px_var(--color-accent)] ring-1 ring-white/10 backdrop-blur-2xl relative"
          >
            <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />
            <img src="/logo.png" alt="Nimbus" className="w-16 h-16 rounded-2xl object-cover shadow-2xl transform hover:scale-105 transition-transform" />
          </motion.div>
          <motion.h2
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-Nimbus-400 via-fuchsia-400 to-indigo-400 mb-4 drop-shadow-lg tracking-tight"
          >
            Nimbus Messenger
          </motion.h2>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="text-sm font-medium text-zinc-300 bg-white/5 backdrop-blur-lg py-2.5 px-6 rounded-full inline-flex border border-white/10 shadow-lg"
          >
            {t('selectChat')}
          </motion.p>
        </div>
      </div>
    );
  }

  const initials = chatName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleToggleSelect = (msgId: string) => {
    const newMap = new Set(selectedMessages);
    if (newMap.has(msgId)) {
      newMap.delete(msgId);
      if (newMap.size === 0) setSelectionMode(false);
    } else {
      newMap.add(msgId);
    }
    setSelectedMessages(newMap);
  };

  const handleStartSelection = (msgId: string) => {
    setSelectionMode(true);
    setSelectedMessages(new Set([msgId]));
  };

  const handleForward = (targetChatId: string) => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    const messagesToForward = Array.from(selectedMessages)
      .map(id => chatMessages.find(m => m.id === id))
      .filter(Boolean)
      .sort((a, b) => new Date(a!.createdAt).getTime() - new Date(b!.createdAt).getTime());

    messagesToForward.forEach(msg => {
      socket.emit('send_message', {
        chatId: targetChatId,
        content: msg?.content,
        type: msg?.type,
        forwardedFromId: msg?.sender.id,
        mediaUrl: msg?.media?.[0]?.url,
        mediaType: msg?.media?.[0]?.type,
        fileName: msg?.media?.[0]?.filename,
        fileSize: msg?.media?.[0]?.size ?? undefined,
      });
    });

    setSelectionMode(false);
    setSelectedMessages(new Set());
    setShowForwardModal(false);
    setActiveChat(targetChatId);
  };

  const handleBulkDelete = (deleteForAll: boolean) => {
    const socket = getSocket();
    if (!socket || !activeChat) return;

    const ids = Array.from(selectedMessages);
    socket.emit('delete_messages', {
      messageIds: ids,
      chatId: activeChat,
      deleteForAll,
    });

    // Optimistic local removal
    if (!deleteForAll) {
      useChatStore.getState().hideMessages(ids, activeChat);
    }

    setSelectionMode(false);
    setSelectedMessages(new Set());
    setShowDeleteMenu(false);
  };

  return (
    <div
      ref={chatViewRef}
      onMouseMove={handleMouseMove}
      className={`flex-1 flex flex-col h-full rounded-3xl overflow-hidden shadow-[0_0_120px_-20px_rgba(0,0,0,0.5)] border border-border/50 relative z-0 chat-theme-${chatTheme} transition-colors duration-500`}
    >
      {/* Шапка чата */}
      {selectionMode ? (
        <div className="h-[76px] flex items-center justify-between px-6 border-b border-border/40 bg-surface-secondary/80 backdrop-blur-xl z-20 flex-shrink-0 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-4 text-white">
            <button onClick={() => { setSelectionMode(false); setSelectedMessages(new Set()); }} className="p-2 -ml-2 rounded-full hover:bg-white/10 transition">
              <X size={20} className="text-zinc-300" />
            </button>
            <span className="font-medium text-[15px]">{selectedMessages.size} {t('selected') || 'выбрано'}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Кнопка удаления с выпадающим меню */}
            <div className="relative" ref={deleteMenuRef}>
              <button
                disabled={selectedMessages.size === 0}
                onClick={() => setShowDeleteMenu(!showDeleteMenu)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/90 text-white font-medium rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                <Trash2 size={18} />
                {t('delete')}
              </button>
              <AnimatePresence>
                {showDeleteMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-2xl bg-surface-secondary/95 backdrop-blur-2xl shadow-2xl z-50 py-1.5 ring-1 ring-border/50 overflow-hidden"
                  >
                    <button
                      onClick={() => handleBulkDelete(false)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Trash2 size={16} className="text-zinc-400" />
                      {t('deleteForMe')}
                    </button>
                    <div className="border-t border-border/30 mx-3" />
                    <button
                      onClick={() => handleBulkDelete(true)}
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={16} className="text-red-400" />
                      {t('deleteForAll')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button
              disabled={selectedMessages.size === 0}
              onClick={() => setShowForwardModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              <Forward size={18} />
              {t('forward')}
            </button>
          </div>
        </div>
      ) : (
        <div className="h-[76px] flex items-center justify-between px-6 border-b border-border/40 bg-surface-secondary/80 backdrop-blur-xl z-20 flex-shrink-0">
          {/* Mobile/Tablet back button */}
          <button
            onClick={onBack}
            className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <button
            className="flex items-center gap-3 min-w-0 flex-1 group transition-all"
            onClick={() => {
              if (chat.type === 'personal' && otherMember) {
                setProfileUserId(otherMember.user.id);
              } else if (chat.type === 'group') {
                setShowGroupSettings(true);
              } else if (chat.type === 'channel') {
                setProfileChannelId(chat.id);
              }
            }}
          >
            <div className="relative flex-shrink-0 transform transition-transform duration-300 group-hover:scale-105">
              {isFavorites ? (
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg ring-2 ring-transparent group-hover:ring-accent/30 transition-all duration-300">
                  <Bookmark size={20} className="text-white" />
                </div>
              ) : (
                <Avatar
                  src={chatAvatar}
                  name={chatName}
                  size="md"
                  online={isOnline ? true : undefined}
                  className="ring-2 ring-transparent group-hover:ring-accent/30 transition-all duration-300 rounded-full"
                />
              )}
            </div>
            <div className="min-w-0 text-left">
              <h3 className="text-base font-semibold text-white truncate drop-shadow-sm group-hover:text-accent/90 transition-colors">{chatName}</h3>
              <p className="text-xs text-zinc-400 truncate">
                {isFavorites
                  ? t('favoritesDescription')
                  : typingInChat.length > 0
                    ? <span className="text-accent font-medium">{t('typing')}</span>
                    : isOnline
                      ? <span className="text-emerald-400">{t('online')}</span>
                      : chat.type === 'personal' && otherMember?.user.lastSeen
                        ? `${t('lastSeenAt')} ${formatLastSeen(otherMember.user.lastSeen, lang)}`
                        : chat.type === 'group'
                          ? `${chat.members.length} ${t('members')}`
                          : ''}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 ml-4">
            {!isFavorites && (
              <>
                {/* Кнопка звонка с popup выбором (audio/video) */}
                {(chat.type === 'personal' || chat.type === 'group') && (
                  <div className="relative" ref={callPopupRef}>
                    <button
                      onClick={() => setShowCallPopup(!showCallPopup)}
                      className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
                      title="Начать звонок"
                    >
                      <Phone size={18} />
                    </button>
                    
                    <AnimatePresence>
                      {showCallPopup && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute right-0 top-full mt-2 w-40 rounded-xl bg-surface-secondary/95 backdrop-blur-2xl shadow-2xl z-50 py-1 ring-1 ring-border/50 overflow-hidden"
                        >
                          <button
                            onClick={() => {
                              if (chat.type === 'personal' && otherMember) {
                                onStartCall?.(otherMember.user, 'voice');
                              } else if (chat.type === 'group') {
                                onStartGroupCall?.(chat.id, chat.name || 'Group', 'voice');
                              }
                              setShowCallPopup(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                          >
                            <Phone size={16} className="text-emerald-400" />
                            Аудиозвонок
                          </button>
                          <div className="border-t border-border/30 mx-3" />
                          <button
                            onClick={() => {
                              if (chat.type === 'personal' && otherMember) {
                                onStartCall?.(otherMember.user, 'video');
                              } else if (chat.type === 'group') {
                                onStartGroupCall?.(chat.id, chat.name || 'Group', 'video');
                              }
                              setShowCallPopup(false);
                            }}
                            className="flex items-center gap-3 w-full px-4 py-3 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                          >
                            <Video size={16} className="text-blue-400" />
                            Видеозвонок
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Кнопка трансляции только для каналов */}
                {chat.type === 'channel' && (
                  <button
                    onClick={() => {
                      const isAdmin = chat.members?.some(m => m.user.id === user?.id && (m.role === 'owner' || m.role === 'co-owner' || m.role === 'admin'));
                      if (isAdmin) {
                        onStartStream?.(chat.id, chat.name || 'Channel');
                      }
                    }}
                    className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
                    title="Начать трансляцию"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 12h.01M18 12h.01M12 12h.01M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Меню */}
            <div className="relative" ref={topMenuRef}>
              <button
                onClick={() => setShowTopMenu(!showTopMenu)}
                className="p-2 rounded-lg hover:bg-surface-hover transition-colors text-zinc-400 hover:text-white"
              >
                <MoreVertical size={18} />
              </button>
              <AnimatePresence>
                {showTopMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-2xl glass-strong shadow-2xl z-50 py-1.5 ring-1 ring-border/50 backdrop-blur-2xl"
                  >
                    <button
                      onClick={openSearch}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Search size={16} />
                      {t('searchMessages')}
                    </button>
                    {chat.type === 'personal' && otherMember && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          setProfileUserId(otherMember.user.id);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <UserPlus size={16} />
                        {t('userProfile')}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (activeChat) {
                          const nowMuted = toggleMuteChat(activeChat);
                          setMuted(nowMuted);
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      {muted ? <Bell size={16} /> : <BellOff size={16} />}
                      {muted ? t('enableSound') : t('disableSound')}
                    </button>
                    {chat.type === 'group' && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          setShowGroupSettings(true);
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                      >
                        <Settings size={16} />
                        {t('groupSettings')}
                      </button>
                    )}
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => {
                        setShowTopMenu(false);
                        if (activeChat) {
                          setConfirmAction({
                            message: t('clearChatConfirm'),
                            action: async () => {
                              try {
                                await api.clearChat(activeChat);
                                useChatStore.getState().clearMessages(activeChat);
                              } catch (e) {
                                console.error(e);
                              }
                            },
                          });
                        }
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-hover hover:text-white transition-colors"
                    >
                      <Eraser size={16} />
                      {t('clearChat')}
                    </button>
                    {chat.type !== 'favorites' && (
                      <button
                        onClick={() => {
                          setShowTopMenu(false);
                          if (activeChat) {
                            setConfirmAction({
                              message: t('deleteChatConfirm'),
                              action: async () => {
                                try {
                                  await api.deleteChat(activeChat);
                                  useChatStore.getState().removeChat(activeChat);
                                } catch (e) {
                                  console.error(e);
                                }
                              },
                            });
                          }
                        }}
                        className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={16} />
                        {t('deleteChat')}
                      </button>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      {/* Результаты поиска */}
      <AnimatePresence>
        {showSearch && searchResults.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="absolute top-14 left-0 right-0 z-20 max-h-60 overflow-y-auto glass-strong border-b border-border"
          >
            {searchResults.map((msg) => (
              <div
                key={msg.id}
                className="px-4 py-2 hover:bg-surface-hover cursor-pointer border-b border-border/50 last:border-0"
                onClick={() => {
                  // Scroll to message
                  const el = document.getElementById(`msg-${msg.id}`);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('bg-Nimbus-500/20');
                    setTimeout(() => el.classList.remove('bg-Nimbus-500/20'), 2000);
                  }
                  setShowSearch(false);
                  setSearchText('');
                  setSearchResults([]);
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-medium text-Nimbus-400">
                    {msg.sender?.displayName || msg.sender?.username}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru' : 'en')}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 truncate">{msg.content}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Закреплённое сообщение */}
      {/* Active group call banner */}
      {chat?.type === 'group' && activeGroupCallParticipants.length > 0 && (
        <button
          onClick={() => onStartGroupCall?.(chat.id, chat.name || 'Group', 'voice')}
          className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left w-full flex-shrink-0"
        >
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <Phone size={14} className="text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-emerald-400">{t('activeCall')}</p>
            <p className="text-sm text-zinc-300">{activeGroupCallParticipants.length} {t('participants')}</p>
          </div>
          <span className="text-xs text-emerald-400 font-medium px-3 py-1 rounded-full bg-emerald-500/20">{t('joinCall')}</span>
        </button>
      )}

      {pinnedMsg && (
        <button
          onClick={() => {
            const el = document.getElementById(`msg-${pinnedMsg.id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('bg-Nimbus-500/20');
              setTimeout(() => el.classList.remove('bg-Nimbus-500/20'), 2000);
            }
          }}
          className="flex items-center gap-3 px-4 py-2 border-b border-border bg-surface-secondary/60 hover:bg-surface-hover transition-colors text-left w-full flex-shrink-0"
        >
          <Pin size={16} className="text-Nimbus-400 flex-shrink-0 rotate-45" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-Nimbus-400">{t('pinnedMessage')}</p>
            <p className="text-sm text-zinc-300 truncate">
              {pinnedMsg.content || (pinnedMsg.media?.length > 0 ? t('media') : '...')}
            </p>
          </div>
          <X
            size={16}
            className="text-zinc-500 hover:text-white flex-shrink-0 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              const socket = getSocket();
              if (socket && activeChat) {
                socket.emit('unpin_message', { messageId: pinnedMsg.id, chatId: activeChat });
              }
            }}
          />
        </button>
      )}

      {/* Сообщения */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className={`flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-4 pt-4 pb-2 relative z-10 ${!scrollReady && !isLoadingMessages && chatMessages.length > 0 ? 'invisible' : ''}`}
      >
        {isLoadingMessages ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-Nimbus-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chatMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-zinc-500">{t('noMessages')}</p>
          </div>
        ) : (
          <div className="space-y-1 max-w-full sm:max-w-3xl mx-auto">
            {chatMessages.map((msg, i) => {
              const prevMsg = i > 0 ? chatMessages[i - 1] : null;
              const showAvatar = !prevMsg || prevMsg.senderId !== msg.senderId;
              const showDate =
                !prevMsg ||
                new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

              return (
                <div key={msg.id} id={`msg-${msg.id}`} className="transition-colors duration-500">
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <span className="px-3 py-1 rounded-full text-xs text-zinc-400 glass">
                        {new Date(msg.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                          day: 'numeric',
                          month: 'long',
                        })}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={msg}
                    isMine={msg.senderId === user?.id}
                    showAvatar={showAvatar}
                    chatType={chat.type as 'personal' | 'group' | 'channel' | 'favorites'}
                    onViewProfile={(userId) => setProfileUserId(userId)}
                    selectionMode={selectionMode}
                    isSelected={selectedMessages.has(msg.id)}
                    onToggleSelect={handleToggleSelect}
                    onStartSelectionMode={handleStartSelection}
                  />
                </div>
              );
            })}
            <div ref={messagesEndRef} className="h-4" /> {/* Empty spacer for the bottom scroll boundary */}
          </div>
        )}
      </div>

      {/* Кнопка прокрутки вниз */}
      <AnimatePresence>
        {showScrollDown && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 right-6 px-4 h-11 rounded-full bg-surface-tertiary/90 backdrop-blur-md border border-border shadow-2xl flex items-center gap-2 text-zinc-400 hover:text-white hover:bg-surface-hover hover:scale-105 transition-all z-10"
          >
            <ArrowDown size={18} />
            <span className="text-sm font-medium">{t('newMessages') || 'Новые сообщения'}</span>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-[11px] font-bold flex items-center justify-center shadow-lg border-2 border-surface-secondary"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </motion.span>
            )}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Typing индикатор */}
      {typingInChat.length > 0 && (
        <div className="px-4 pb-1">
          <TypingIndicator />
        </div>
      )}

      {/* Ввод сообщения */}
      <MessageInput chatId={activeChat} />

      {/* Профиль пользователя */}
      <AnimatePresence>
        {profileUserId && (
          <UserProfile
            userId={profileUserId}
            chatId={activeChat || undefined}
            onClose={() => setProfileUserId(null)}
            isSelf={profileUserId === user?.id}
            onStartCall={(userId, type) => {
              const chat = chats.find(c => c.id === activeChat);
              const member = chat?.members.find(m => m.user.id === profileUserId);
              if (member) {
                onStartCall?.(member.user, type);
                setProfileUserId(null);
              }
            }}
            onOpenChat={(userId) => {
              const chat = chats.find(c => c.members.some(m => m.user.id === userId));
              if (chat) {
                setActiveChat(chat.id);
                setProfileUserId(null);
              }
            }}
          />
        )}
        {profileChannelId && (
          <UserProfile
            channelId={profileChannelId}
            chatId={activeChat || undefined}
            onClose={() => setProfileChannelId(null)}
          />
        )}
      </AnimatePresence>

      {/* Настройки группы */}
      <AnimatePresence>
        {showGroupSettings && chat && chat.type === 'group' && (
          <GroupSettings
            chat={chat}
            onClose={() => setShowGroupSettings(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForwardModal && (
          <ForwardModal
            onClose={() => setShowForwardModal(false)}
            onForward={handleForward}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={!!confirmAction}
        message={confirmAction?.message || ''}
        onConfirm={() => {
          confirmAction?.action();
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
