import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { getSocket, disconnectSocket } from '../lib/socket';
import { api } from '../lib/api';
import { isChatMuted } from '../lib/sounds';
import { useLang } from '../lib/i18n';
import { showMessageNotification } from '../lib/notifications';
import { useInAppNotifications } from '../components/InAppNotifications';
import type { Message, UserBasic, CallInfo } from '../lib/types';
import { Send, Check } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatView from '../components/ChatView';
import CallModal from '../components/CallModal';
import GroupCallModal from '../components/GroupCallModal';
import LiveStreamModal from '../components/LiveStreamModal';

export default function ChatPage() {
  const {
    loadChats,
    loadMessages,
    addMessage,
    updateMessage,
    removeMessage,
    removeMessages,
    hideMessages,
    addReaction,
    removeReaction,
    markRead,
    addTypingUser,
    removeTypingUser,
    updateUserOnlineStatus,
    setPinnedMessage,
    removePinnedMessage,
    clearStore,
    activeChat,
    setActiveChat,
  } = useChatStore();
  const { user } = useAuthStore();
  const initialized = useRef(false);
  const { mention } = useInAppNotifications();

  // Mobile view state
  const [showMobileList, setShowMobileList] = useState(true);

  // Call state
  const [callOpen, setCallOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<UserBasic | null>(null);
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [incomingCall, setIncomingCall] = useState<CallInfo | null>(null);
  const [callSessionId, setCallSessionId] = useState(0);
  const [deliveryNotification, setDeliveryNotification] = useState<string | null>(null);
  const deliveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Group call state
  const [groupCallOpen, setGroupCallOpen] = useState(false);
  const [groupCallChatId, setGroupCallChatId] = useState('');
  const [groupCallChatName, setGroupCallChatName] = useState('');
  const [groupCallType, setGroupCallType] = useState<'voice' | 'video'>('voice');
  const [groupCallSessionId, setGroupCallSessionId] = useState(0);

  // Live stream state
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamChatId, setStreamChatId] = useState('');
  const [streamChatName, setStreamChatName] = useState('');
  const [streamSessionId, setStreamSessionId] = useState(0);

  const { t } = useLang();

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadChats();
  }, [loadChats]);

  // Mobile: switch to chat view when activeChat changes
  useEffect(() => {
    if (activeChat) {
      setShowMobileList(false);
    } else {
      setShowMobileList(true);
    }
  }, [activeChat]);

  // Обработка закрытия вкладки — отправить disconnect
  useEffect(() => {
    const handleBeforeUnload = () => {
      const socket = getSocket();
      if (socket) {
        socket.disconnect();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    socket.on('new_message', async (message: Message) => {
      // If this chat isn't in our store yet (e.g. someone just created it and sent a message),
      // fetch chats so the new chat appears in the sidebar immediately
      const { chats } = useChatStore.getState();
      if (!chats.some(c => c.id === message.chatId)) {
        try {
          const allChats = await api.getChats();
          const newChat = allChats.find(c => c.id === message.chatId);
          if (newChat) {
            // Reset unreadCount to 0 because addMessage below will increment it by 1
            useChatStore.getState().addChat({ ...newChat, unreadCount: 0 });
          }
        } catch (e) {
          console.error('Failed to fetch new chat:', e);
        }
      }
      addMessage(message);
      // Show browser notification for messages from others
      if (message.senderId !== user?.id && !isChatMuted(message.chatId)) {
        // Check if user is mentioned in the message
        const content = message.content || '';
        const isMentioned = user && content.includes(`@${user.username}`);
        
        if (isMentioned) {
          // Show in-app mention notification
          const senderName = message.sender?.displayName || message.sender?.username || 'Неизвестный';
          mention('Вас упомянули', `${senderName} упомянул(а) вас в сообщении`, () => {
            setActiveChat(message.chatId);
            loadMessages(message.chatId);
          });
        }
        
        // Show browser notification
        const senderName = message.sender?.displayName || message.sender?.username || 'Неизвестный';
        const preview = message.content ||
          message.type === 'image' ? '📷 Фото' :
          message.type === 'video' ? '🎬 Видео' :
          message.type === 'voice' ? '🎤 Голосовое' :
          message.type === 'file' ? '📁 Файл' : 'Сообщение';
        showMessageNotification(senderName, preview, message.chatId);
      }
    });

    socket.on('scheduled_delivered', async (message: Message & { _recipientName?: string; _deliveredAt?: string }) => {
      // If chat unknown, fetch it first
      const { chats } = useChatStore.getState();
      if (!chats.some(c => c.id === message.chatId)) {
        try {
          const allChats = await api.getChats();
          const newChat = allChats.find(c => c.id === message.chatId);
          if (newChat) useChatStore.getState().addChat(newChat);
        } catch (_) { /* ignore */ }
      }
      // A scheduled message was delivered: update it in store (remove scheduledAt)
      updateMessage({ ...message, scheduledAt: null });

      // Show delivery notification to the sender
      if (message.senderId === user?.id && message._recipientName) {
        const time = message._deliveredAt
          ? new Date(message._deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        const notifText = `${useLang.getState().t('scheduledDelivered')} ${message._recipientName} ${useLang.getState().t('scheduledDeliveredAt')} ${time}`;
        setDeliveryNotification(notifText);
        if (deliveryTimerRef.current) clearTimeout(deliveryTimerRef.current);
        deliveryTimerRef.current = setTimeout(() => setDeliveryNotification(null), 5000);
      }

      // Notify others (no sound)
      if (message.senderId !== user?.id && !isChatMuted(message.chatId)) {
        // Silent notification
      }
    });

    socket.on('message_edited', (message: Message) => {
      updateMessage(message);
    });

    socket.on('message_deleted', (data: { messageId: string; chatId: string }) => {
      removeMessage(data.messageId, data.chatId);
    });

    socket.on('messages_deleted', (data: { messageIds: string[]; chatId: string }) => {
      removeMessages(data.messageIds, data.chatId);
    });

    socket.on('messages_hidden', (data: { messageIds: string[]; chatId: string }) => {
      hideMessages(data.messageIds, data.chatId);
    });

    socket.on('reaction_added', (data: { messageId: string; chatId: string; userId: string; username: string; emoji: string }) => {
      addReaction(data.messageId, data.chatId, data.userId, data.username, data.emoji);
    });

    socket.on('reaction_removed', (data: { messageId: string; chatId: string; userId: string; emoji: string }) => {
      removeReaction(data.messageId, data.chatId, data.userId, data.emoji);
    });

    socket.on('messages_read', (data: { chatId: string; userId: string; messageIds: string[] }) => {
      markRead(data.chatId, data.userId, data.messageIds);
    });

    socket.on('user_typing', (data: { chatId: string; userId: string }) => {
      if (data.userId !== user?.id) {
        addTypingUser(data.chatId, data.userId);
        setTimeout(() => removeTypingUser(data.chatId, data.userId), 3000);
      }
    });

    socket.on('user_stopped_typing', (data: { chatId: string; userId: string }) => {
      removeTypingUser(data.chatId, data.userId);
    });

    socket.on('user_online', (data: { userId: string }) => {
      updateUserOnlineStatus(data.userId, true);
    });

    socket.on('user_offline', (data: { userId: string; lastSeen?: string }) => {
      updateUserOnlineStatus(data.userId, false, data.lastSeen);
    });

    socket.on('user_online_status', (data: { userId: string; isOnline: boolean }) => {
      updateUserOnlineStatus(data.userId, data.isOnline);
    });

    socket.on('message_pinned', (data: { chatId: string; message: Message }) => {
      setPinnedMessage(data.chatId, data.message);
    });

    socket.on('message_unpinned', (data: { chatId: string; messageId: string; newPinnedMessage: Message | null }) => {
      removePinnedMessage(data.chatId, data.messageId, data.newPinnedMessage);
    });

    socket.on('call_incoming', async (data: CallInfo) => {
      // Use callerInfo from server if available, otherwise look up from chats
      let callerInfo: UserBasic | null = data.callerInfo || null;
      if (!callerInfo) {
        const { chats } = useChatStore.getState();
        for (const chat of chats) {
          const member = chat.members.find((m) => m.user.id === data.from);
          if (member) {
            callerInfo = member.user;
            break;
          }
        }
      }
      setCallTarget(null); // Clear any previous outgoing target
      setIncomingCall({
        from: data.from,
        offer: data.offer,
        callType: data.callType,
        chatId: data.chatId,
        callerInfo,
      });
      setCallType(data.callType);
      setCallSessionId(id => id + 1);
      setCallOpen(true);
    });

    return () => {
      socket.off('new_message');
      socket.off('scheduled_delivered');
      socket.off('message_edited');
      socket.off('message_deleted');
      socket.off('messages_deleted');
      socket.off('messages_hidden');
      socket.off('reaction_added');
      socket.off('reaction_removed');
      socket.off('messages_read');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('user_online');
      socket.off('user_offline');
      socket.off('user_online_status');
      socket.off('message_pinned');
      socket.off('message_unpinned');
      socket.off('call_incoming');
    };
  }, [user?.id]);

  const handleStartCall = (targetUser: UserBasic, type: 'voice' | 'video') => {
    setCallTarget(targetUser);
    setCallType(type);
    setIncomingCall(null);
    setCallSessionId(id => id + 1);
    setCallOpen(true);
  };

  const handleStartGroupCall = (chatId: string, chatName: string, type: 'voice' | 'video') => {
    setGroupCallChatId(chatId);
    setGroupCallChatName(chatName);
    setGroupCallType(type);
    setGroupCallSessionId(id => id + 1);
    setGroupCallOpen(true);
  };

  const handleStartStream = (chatId: string, chatName: string) => {
    setStreamChatId(chatId);
    setStreamChatName(chatName);
    setStreamSessionId(id => id + 1);
    setStreamOpen(true);
  };

  const handleCloseCall = () => {
    setCallOpen(false);
    setCallTarget(null);
    setIncomingCall(null);
  };

  const handleCloseGroupCall = () => {
    setGroupCallOpen(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex bg-surface p-3 gap-3 overflow-hidden"
    >
      {/* Sidebar - fullscreen on mobile/tablet (< lg), split view on desktop (>= lg) */}
      <div className={`${showMobileList ? 'flex' : 'hidden'} lg:flex flex-shrink-0 ${
        showMobileList 
          ? 'fixed inset-0 z-50 lg:static lg:inset-auto lg:z-auto w-full lg:w-auto' 
          : ''
      }`}>
        <Sidebar onChatSelect={() => setShowMobileList(false)} />
      </div>

      {/* ChatView - hidden on mobile/tablet when showing list */}
      <div className={`${!showMobileList ? 'flex' : 'hidden'} lg:flex flex-1 min-w-0`}>
        <ChatView
          onStartCall={handleStartCall}
          onStartGroupCall={handleStartGroupCall}
          onStartStream={handleStartStream}
          onBack={() => setShowMobileList(true)}
        />
      </div>
      
      <CallModal
        key={callSessionId}
        isOpen={callOpen}
        onClose={handleCloseCall}
        targetUser={callTarget}
        callType={callType}
        incoming={incomingCall}
      />
      <GroupCallModal
        key={`gc-${groupCallSessionId}`}
        isOpen={groupCallOpen}
        onClose={handleCloseGroupCall}
        chatId={groupCallChatId}
        chatName={groupCallChatName}
        callType={groupCallType}
      />

      <LiveStreamModal
        key={`ls-${streamSessionId}`}
        isOpen={streamOpen}
        onClose={() => setStreamOpen(false)}
        chatId={streamChatId}
        chatName={streamChatName}
      />

      {/* Scheduled message delivery notification */}
      <AnimatePresence>
        {deliveryNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl bg-surface-secondary shadow-2xl border border-border flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
              <Send size={14} className="text-emerald-400" />
            </div>
            <span className="text-sm text-zinc-200">{deliveryNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
