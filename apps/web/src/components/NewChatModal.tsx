import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Users, Check, ArrowLeft, ArrowRight, Megaphone, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useLang } from '../lib/i18n';
import type { UserPresence, FriendWithId } from '../lib/types';

interface NewChatModalProps {
  onClose: () => void;
}

type Mode = 'menu' | 'group-select' | 'group-name' | 'channel';

export default function NewChatModal({ onClose }: NewChatModalProps) {
  const { user } = useAuthStore();
  const { t } = useLang();
  const { addChat, setActiveChat, loadMessages } = useChatStore();
  const [mode, setMode] = useState<Mode>('menu');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<UserPresence[]>([]);
  const [groupName, setGroupName] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelUsername, setChannelUsername] = useState('');
  const [channelDescription, setChannelDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [friends, setFriends] = useState<FriendWithId[]>([]);
  const [usernameError, setUsernameError] = useState('');

  // Load friends on mount
  useEffect(() => {
    api.getFriends().then(setFriends).catch(() => {});
  }, []);

  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) {
      setUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setIsLoading(true);
        const results = await api.searchUsers(query);
        setUsers(results.filter((u) => u.id !== user?.id));
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, user?.id]);

  // Validate channel username
  useEffect(() => {
    if (channelUsername) {
      if (channelUsername.length < 3) {
        setUsernameError('Минимум 3 символа');
      } else if (!/^[a-zA-Z0-9_]+$/.test(channelUsername)) {
        setUsernameError('Только буквы, цифры и _');
      } else {
        setUsernameError('');
      }
    } else {
      setUsernameError('');
    }
  }, [channelUsername]);

  const handleSelectUser = (selectedUser: UserPresence) => {
    setSelectedUsers((prev) => {
      const exists = prev.find((u) => u.id === selectedUser.id);
      if (exists) return prev.filter((u) => u.id !== selectedUser.id);
      return [...prev, selectedUser];
    });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setIsCreating(true);
    try {
      const chat = await api.createGroupChat(
        groupName.trim(),
        selectedUsers.map((u) => u.id)
      );
      addChat(chat);
      setActiveChat(chat.id);
      loadMessages(chat.id);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim() || !channelUsername.trim() || usernameError) return;
    setIsCreating(true);
    try {
      const chat = await api.createChannel(
        channelName.trim(),
        channelUsername.trim().toLowerCase(),
        channelDescription.trim(),
        selectedUsers.map((u) => u.id)
      );
      addChat(chat);
      setActiveChat(chat.id);
      loadMessages(chat.id);
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsCreating(false);
    }
  };

  const isSelected = (userId: string) => selectedUsers.some((u) => u.id === userId);

  const resetToMenu = () => {
    setMode('menu');
    setSelectedUsers([]);
    setGroupName('');
    setChannelName('');
    setChannelUsername('');
    setChannelDescription('');
    setUsernameError('');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div className="w-full max-w-md max-h-[90vh] rounded-2xl glass-strong shadow-2xl overflow-hidden flex flex-col" role="dialog" aria-modal="true" aria-label={t('newChat')}>
          {/* Шапка */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-2">
              {mode !== 'menu' && (
                <button
                  onClick={() => {
                    if (mode === 'group-name') setMode('group-select');
                    else if (mode === 'group-select') setMode('menu');
                    else if (mode === 'channel') resetToMenu();
                  }}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
              )}
              <h2 className="text-lg font-semibold text-white">
                {mode === 'menu' ? t('newChatTitle') :
                 mode === 'group-select' ? t('selectMembers') :
                 mode === 'group-name' ? t('newGroup') :
                 t('newChannel')}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Главное меню */}
          {mode === 'menu' && (
            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              <button
                onClick={() => setMode('group-select')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-tertiary hover:bg-surface-hover transition-colors border border-border"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-Nimbus-500/20 to-purple-500/20 flex items-center justify-center ring-1 ring-Nimbus-400/30">
                  <Users size={20} className="text-Nimbus-400" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-white">{t('createGroup')}</p>
                  <p className="text-xs text-zinc-500">{t('unlimitedMembers')}</p>
                </div>
              </button>

              <button
                onClick={() => setMode('channel')}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-surface-tertiary hover:bg-surface-hover transition-colors border border-border"
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center ring-1 ring-amber-400/30">
                  <Megaphone size={20} className="text-amber-400" />
                </div>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium text-white">{t('createChannel')}</p>
                  <p className="text-xs text-zinc-500">{t('broadcastMessages')}</p>
                </div>
              </button>
            </div>
          )}

          {/* Создание канала */}
          {mode === 'channel' && (
            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('channelName')}</label>
                <input
                  type="text"
                  placeholder={t('channelNamePlaceholder')}
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-border focus:border-accent transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">{t('channelUsername')}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">@</span>
                  <input
                    type="text"
                    placeholder="username"
                    value={channelUsername}
                    onChange={(e) => setChannelUsername(e.target.value.replace(/\s/g, ''))}
                    className={`w-full pl-8 pr-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border ${usernameError ? 'border-red-500' : 'border-border'} focus:border-accent transition-colors`}
                  />
                </div>
                {usernameError && <p className="text-xs text-red-400 mt-1">{usernameError}</p>}
                <p className="text-xs text-zinc-500 mt-1">t.me/{channelUsername || 'username'}</p>
              </div>

              <div>
                <label className="text-xs text-zinc-400 mb-1 block">Описание канала</label>
                <textarea
                  placeholder="Расскажите, о чем будет ваш канал..."
                  value={channelDescription}
                  onChange={(e) => setChannelDescription(e.target.value.slice(0, 255))}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-border focus:border-accent transition-colors resize-none"
                  rows={3}
                />
                <p className="text-xs text-zinc-500 mt-1">{channelDescription.length}/255</p>
              </div>

              <div>
                <p className="text-xs text-zinc-500 mb-2">{t('addMembersOptional')}:</p>
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {selectedUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id))}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-Nimbus-500/20 border border-Nimbus-500/30 text-xs text-white hover:bg-Nimbus-500/30 transition-colors"
                      >
                        {u.displayName || u.username}
                        <X size={11} />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setMode('group-select')}
                  className="text-xs text-Nimbus-400 hover:text-Nimbus-300 transition-colors"
                >
                  + {t('selectMembers')}
                </button>
              </div>

              <button
                onClick={handleCreateChannel}
                disabled={!channelName.trim() || !channelUsername.trim() || !!usernameError || isCreating}
                className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Megaphone size={16} />
                    {t('createChannel')}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Создание группы - шаг 2 */}
          {mode === 'group-name' && (
            <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
              <input
                type="text"
                placeholder={t('groupNamePlaceholder')}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-border focus:border-accent transition-colors"
                autoFocus
              />
              <div>
                <p className="text-xs text-zinc-500 mb-2">
                  {t('membersCount')} ({selectedUsers.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-Nimbus-500/20 border border-Nimbus-500/30"
                    >
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-Nimbus-500 to-purple-600 flex items-center justify-center text-white text-[9px] font-semibold">
                          {(u.displayName || u.username)?.[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs text-white">{u.displayName || u.username}</span>
                      <button
                        onClick={() => setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id))}
                        className="text-zinc-500 hover:text-zinc-300"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button
                onClick={handleCreateGroup}
                disabled={!groupName.trim() || isCreating}
                className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Users size={16} />
                    {t('createGroup')}
                  </>
                )}
              </button>
            </div>
          )}

          {/* Выбор участников */}
          {mode === 'group-select' && (
            <>
              {/* Поиск */}
              <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
                {mode === 'group-select' && selectedUsers.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedUsers.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id))}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-Nimbus-500/20 border border-Nimbus-500/30 text-xs text-white hover:bg-Nimbus-500/30 transition-colors"
                      >
                        {(u.displayName || u.username)}
                        <X size={11} />
                      </button>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder={t('addMembers')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-surface-tertiary text-sm text-white placeholder-zinc-500 border border-border focus:border-accent transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              {/* Результаты */}
              <div className="max-h-72 overflow-y-auto px-2 pb-4">
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 border-2 border-Nimbus-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : query.trim().length >= 3 && users.length > 0 ? (
                  users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                        isSelected(u.id)
                          ? 'bg-Nimbus-500/15 border border-Nimbus-500/30'
                          : 'hover:bg-surface-hover border border-transparent'
                      }`}
                    >
                      <div className="relative flex-shrink-0">
                        {u.avatar ? (
                          <img src={u.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-Nimbus-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                            {(u.displayName || u.username)?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        {u.isOnline && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-surface-secondary" />
                        )}
                      </div>
                      <div className="min-w-0 text-left flex-1">
                        <p className="text-sm font-medium text-white truncate">
                          {u.displayName || u.username}
                        </p>
                        <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                      </div>
                      {mode === 'group-select' && (
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected(u.id)
                            ? 'bg-Nimbus-500 border-Nimbus-500'
                            : 'border-zinc-600'
                        }`}>
                          {isSelected(u.id) && <Check size={12} className="text-white" />}
                        </div>
                      )}
                    </button>
                  ))
                ) : query.trim().length >= 3 && users.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <p className="text-sm">{t('usersNotFound')}</p>
                  </div>
                ) : query.trim().length > 0 && query.trim().length < 3 ? (
                  <div className="text-center py-6 text-zinc-500">
                    <p className="text-sm">{t('minCharsHint')}</p>
                  </div>
                ) : friends.length > 0 ? (
                  <>
                    <p className="text-xs text-zinc-500 uppercase tracking-wider px-2 mb-2 font-semibold">{t('friends')}</p>
                    {friends.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleSelectUser(u)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                          isSelected(u.id)
                            ? 'bg-Nimbus-500/15 border border-Nimbus-500/30'
                            : 'hover:bg-surface-hover border border-transparent'
                        }`}
                      >
                        <div className="relative flex-shrink-0">
                          {u.avatar ? (
                            <img src={u.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-Nimbus-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                              {(u.displayName || u.username)?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          {u.isOnline && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-surface-secondary" />
                          )}
                        </div>
                        <div className="min-w-0 text-left flex-1">
                          <p className="text-sm font-medium text-white truncate">
                            {u.displayName || u.username}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">@{u.username}</p>
                        </div>
                        {mode === 'group-select' && (
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isSelected(u.id)
                              ? 'bg-Nimbus-500 border-Nimbus-500'
                              : 'border-zinc-600'
                          }`}>
                            {isSelected(u.id) && <Check size={12} className="text-white" />}
                          </div>
                        )}
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-zinc-500">
                    <MessageSquare size={32} className="opacity-30" />
                    <p className="text-sm">{t('enterNameOrUsername')}</p>
                  </div>
                )}
              </div>

              {/* Кнопка "Далее" для группы */}
              {mode === 'group-select' && selectedUsers.length > 0 && (
                <div className="p-4 border-t border-border">
                  <button
                    onClick={() => setMode('group-name')}
                    className="w-full py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {t('next')}
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </>
  );
}
