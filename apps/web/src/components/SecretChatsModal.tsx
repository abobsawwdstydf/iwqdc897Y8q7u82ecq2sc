import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Timer, Trash2, Shield, ShieldAlert, Clock, X, Send, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import { useAuthStore } from '../stores/authStore';

interface SecretChat {
  id: number;
  chatId: number;
  senderId: number;
  receiverId: number;
  encryptionKey: string;
  ttl: number;
  isDestroyed: boolean;
  createdAt: string;
  destroyedAt?: string;
  sender?: { id: number; username: string; displayName: string; avatar?: string | null };
  receiver?: { id: number; username: string; displayName: string; avatar?: string | null };
  chat?: {
    id: number;
    type: string;
    members?: Array<{
      user: { id: number; username: string; displayName: string; avatar?: string | null; isOnline: boolean; lastSeen: string };
    }>;
  };
}

interface SecretMessage {
  id: number;
  chatId: number;
  senderId: number;
  content: string;
  isRead: boolean;
  expiresAt: string;
  createdAt: string;
  deletedAt?: string;
}

interface SecretChatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectChat?: (chatId: number) => void;
}

const TTL_OPTIONS = [
  { value: 60, label: '1 минута' },
  { value: 300, label: '5 минут' },
  { value: 900, label: '15 минут' },
  { value: 3600, label: '1 час' },
  { value: 86400, label: '1 день' },
  { value: 604800, label: '7 дней' },
];

export default function SecretChatsModal({ isOpen, onClose, onSelectChat }: SecretChatsModalProps) {
  const { t, lang } = useLang();
  const { user } = useAuthStore();
  const [secretChats, setSecretChats] = useState<SecretChat[]>([]);
  const [messages, setMessages] = useState<Record<number, SecretMessage[]>>({});
  const [activeChat, setActiveChat] = useState<number | null>(null);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedTTL, setSelectedTTL] = useState(3600);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadSecretChats();
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeChat) {
      loadMessages(activeChat);
      const interval = setInterval(() => loadMessages(activeChat), 5000);
      return () => clearInterval(interval);
    }
  }, [activeChat]);

  const loadSecretChats = async () => {
    try {
      setLoading(true);
      const data = await api.getSecretChats();
      setSecretChats(data);
    } catch (error) {
      console.error('Failed to load secret chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: number) => {
    try {
      const data = await api.getSecretMessages(chatId);
      setMessages(prev => ({ ...prev, [chatId]: data }));
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleCreate = async () => {
    // This would need a user selector - simplified for now
    alert(lang === 'ru' ? 'Выберите пользователя для создания секретного чата' : 'Select a user to create secret chat');
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !activeChat) return;
    
    try {
      await api.sendSecretMessage(activeChat, messageText.trim());
      setMessageText('');
      await loadMessages(activeChat);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleDeleteChat = async (chatId: number) => {
    if (!confirm(lang === 'ru' ? 'Удалить этот секретный чат?' : 'Delete this secret chat?')) return;
    
    try {
      await api.deleteSecretChat(chatId);
      if (activeChat === chatId) setActiveChat(null);
      await loadSecretChats();
    } catch (error) {
      console.error('Failed to delete chat:', error);
    }
  };

  const formatTTL = (seconds: number) => {
    if (seconds < 60) return `${seconds} сек`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч`;
    return `${Math.floor(seconds / 86400)} дн`;
  };

  const getOtherUser = (chat: SecretChat) => {
    if (chat.sender?.id === user?.id) return chat.receiver;
    return chat.sender;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-2xl bg-[#1a1a2e] border border-white/10 rounded-2xl z-50 max-h-[80vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-gradient-to-r from-red-500/10 to-purple-500/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {lang === 'ru' ? 'Секретные чаты' : 'Secret Chats'}
                  </h2>
                  <p className="text-xs text-zinc-500 flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {lang === 'ru' ? 'Сквозное шифрование' : 'End-to-end encrypted'}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden flex">
              {/* Chat List */}
              <div className={`w-full md:w-80 border-r border-white/10 flex flex-col ${activeChat ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-4 border-b border-white/10">
                  <button
                    onClick={handleCreate}
                    className="w-full py-2 px-4 bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 rounded-xl text-white font-semibold transition-all flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    {lang === 'ru' ? 'Новый чат' : 'New Chat'}
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="p-4 text-center text-zinc-500">Загрузка...</div>
                  ) : secretChats.length === 0 ? (
                    <div className="p-4 text-center text-zinc-500">
                      <ShieldAlert className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{lang === 'ru' ? 'Нет секретных чатов' : 'No secret chats'}</p>
                    </div>
                  ) : (
                    secretChats.map((chat) => {
                      const otherUser = getOtherUser(chat);
                      return (
                        <motion.div
                          key={chat.id}
                          onClick={() => setActiveChat(chat.id)}
                          className={`p-3 border-b border-white/5 cursor-pointer transition-all hover:bg-white/5 ${
                            activeChat === chat.id ? 'bg-red-500/10' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-red-500/20 to-purple-500/20 flex items-center justify-center flex-shrink-0 border-2 border-red-500/30">
                              <Lock className="w-5 h-5 text-red-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white truncate">
                                {otherUser?.displayName || otherUser?.username || lang === 'ru' ? 'Секретный чат' : 'Secret Chat'}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-zinc-500">
                                <Timer className="w-3 h-3" />
                                <span>{formatTTL(chat.ttl)}</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-red-400" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Chat View */}
              <div className={`flex-1 flex flex-col ${activeChat ? 'flex' : 'hidden md:flex'}`}>
                {activeChat ? (
                  <>
                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {messages[activeChat]?.length === 0 || !messages[activeChat] ? (
                        <div className="text-center py-8 text-zinc-500">
                          <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">{lang === 'ru' ? 'Нет сообщений' : 'No messages'}</p>
                          <p className="text-xs mt-1">{lang === 'ru' ? 'Сообщения исчезнут через' : 'Messages will disappear after'} {formatTTL(selectedTTL)}</p>
                        </div>
                      ) : (
                        messages[activeChat]?.map((msg) => (
                          <motion.div
                            key={msg.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[80%] rounded-2xl p-3 ${
                              msg.senderId === user?.id 
                                ? 'bg-gradient-to-r from-red-500 to-purple-600' 
                                : 'bg-white/10'
                            }`}>
                              <p className="text-white text-sm">{msg.content}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs opacity-60">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-white/10">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={messageText}
                          onChange={(e) => setMessageText(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                          placeholder={lang === 'ru' ? 'Секретное сообщение...' : 'Secret message...'}
                          className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/25 transition-all"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={!messageText.trim()}
                          className="px-4 py-3 bg-gradient-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 rounded-xl text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Send className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-500">
                    <div className="text-center">
                      <Shield className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-semibold">{lang === 'ru' ? 'Выберите чат' : 'Select a chat'}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

