import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, MessageSquare, Trash2, Check, X, Search, Eye, EyeOff, Ban, Activity, Server, Database } from 'lucide-react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';

interface AdminUser {
  id: number;
  username: string;
  displayName: string;
  email?: string;
  avatar?: string | null;
  isVerified: boolean;
  isOnline: boolean;
  lastSeen: string;
  createdAt: string;
}

interface AdminStats {
  users: number;
  messages: number;
  chats: number;
}

export default function AdminPanel() {
  const { t, lang } = useLang();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats>({ users: 0, messages: 0, chats: 0 });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'stats'>('users');

  const ADMIN_PASSWORD = 'qwertyuiopasd';

  useEffect(() => {
    const savedAuth = localStorage.getItem('adminAuth');
    if (savedAuth === 'true') {
      setIsAuthenticated(true);
      loadData();
    }
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, messagesData] = await Promise.all([
        api.adminGetUsers(),
        api.request('/admin/messages')
      ]);
      setUsers(usersData);
      setStats({
        users: usersData.length || 0,
        messages: messagesData.count || 0,
        chats: 0
      });
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      localStorage.setItem('adminAuth', 'true');
      setIsAuthenticated(true);
      loadData();
    } else {
      alert(lang === 'ru' ? 'Неверный пароль' : 'Wrong password');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminAuth');
    setIsAuthenticated(false);
    setPassword('');
  };

  const handleVerify = async (userId: number, isVerified: boolean) => {
    try {
      await api.adminVerifyUser(userId, isVerified);
      await loadData();
    } catch (error) {
      console.error('Failed to verify user:', error);
      alert(lang === 'ru' ? 'Ошибка' : 'Error');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm(lang === 'ru' ? 'Удалить пользователя?' : 'Delete user?')) return;
    
    try {
      await api.adminDeleteUser(userId);
      await loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
      alert(lang === 'ru' ? 'Ошибка' : 'Error');
    }
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] to-[#1a1a2e] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-Nexo-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{lang === 'ru' ? 'Админ-панель' : 'Admin Panel'}</h1>
            <p className="text-zinc-500">Nexo Messenger</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-2">
                {lang === 'ru' ? 'Пароль администратора' : 'Admin Password'}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:border-Nexo-500/50 focus:ring-1 focus:ring-Nexo-500/25 transition-all"
                autoFocus
              />
            </div>

            <button
              onClick={handleLogin}
              className="w-full py-3 px-4 bg-gradient-to-r from-Nexo-500 to-purple-600 hover:from-Nexo-600 hover:to-purple-700 rounded-xl text-white font-semibold transition-all flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              {lang === 'ru' ? 'Войти' : 'Login'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f0f23] to-[#1a1a2e]">
      {/* Header */}
      <header className="border-b border-white/10 bg-white/5 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-Nexo-500 to-purple-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">{lang === 'ru' ? 'Админ-панель Nexo' : 'Nexo Admin Panel'}</h1>
              <p className="text-xs text-zinc-500">v2.1.0</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm font-semibold transition-all"
          >
            {lang === 'ru' ? 'Выйти' : 'Logout'}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-Nexo-500/20 flex items-center justify-center">
                <Users className="w-6 h-6 text-Nexo-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">{lang === 'ru' ? 'Пользователей' : 'Users'}</p>
                <p className="text-3xl font-bold text-white">{stats.users}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">{lang === 'ru' ? 'Сообщений' : 'Messages'}</p>
                <p className="text-3xl font-bold text-white">{stats.messages}</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Activity className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-zinc-400">{lang === 'ru' ? 'Статус' : 'Status'}</p>
                <p className="text-lg font-bold text-emerald-400">● Online</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'users'
                ? 'bg-Nexo-500 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <Users className="w-4 h-4" />
            {lang === 'ru' ? 'Пользователи' : 'Users'}
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-4 py-2 rounded-xl font-semibold transition-all flex items-center gap-2 ${
              activeTab === 'stats'
                ? 'bg-Nexo-500 text-white'
                : 'bg-white/5 text-zinc-400 hover:bg-white/10'
            }`}
          >
            <Activity className="w-4 h-4" />
            {lang === 'ru' ? 'Статистика' : 'Statistics'}
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
            {/* Search */}
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={lang === 'ru' ? 'Поиск пользователей...' : 'Search users...'}
                  className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:border-Nexo-500/50 focus:ring-1 focus:ring-Nexo-500/25 transition-all"
                />
              </div>
            </div>

            {/* Users List */}
            <div className="divide-y divide-white/5 max-h-[600px] overflow-y-auto">
              {loading ? (
                <div className="p-8 text-center text-zinc-500">Загрузка...</div>
              ) : filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-zinc-500">
                  {lang === 'ru' ? 'Пользователи не найдены' : 'No users found'}
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-Nexo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-white">
                          {(user.displayName || user.username || '?')[0].toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-white truncate">
                          {user.displayName || user.username}
                        </p>
                        {user.isVerified && (
                          <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-zinc-500">@{user.username}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-zinc-600">
                        <span className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full ${user.isOnline ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                          {user.isOnline ? (lang === 'ru' ? 'онлайн' : 'online') : (lang === 'ru' ? 'офлайн' : 'offline')}
                        </span>
                        <span>•</span>
                        <span>{new Date(user.createdAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US')}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVerify(user.id, !user.isVerified)}
                        className={`p-2 rounded-lg transition-colors ${
                          user.isVerified
                            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400'
                            : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-400'
                        }`}
                        title={user.isVerified ? (lang === 'ru' ? 'Забрать верификацию' : 'Remove verification') : (lang === 'ru' ? 'Верифицировать' : 'Verify')}
                      >
                        {user.isVerified ? <Check className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors text-red-400"
                        title={lang === 'ru' ? 'Удалить' : 'Delete'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Server className="w-5 h-5 text-Nexo-400" />
                {lang === 'ru' ? 'Сервер' : 'Server'}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-zinc-400">{lang === 'ru' ? 'Статус' : 'Status'}</span>
                  <span className="text-emerald-400 font-semibold">● Online</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">{lang === 'ru' ? 'Порт' : 'Port'}</span>
                  <span className="text-white font-mono">3001</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">{lang === 'ru' ? 'Версия' : 'Version'}</span>
                  <span className="text-white font-mono">v2.1.0</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                {lang === 'ru' ? 'База данных' : 'Database'}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-zinc-400">{lang === 'ru' ? 'Тип' : 'Type'}</span>
                  <span className="text-white font-mono">PostgreSQL</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">{lang === 'ru' ? 'Пользователей' : 'Users'}</span>
                  <span className="text-white font-semibold">{stats.users}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">{lang === 'ru' ? 'Сообщений' : 'Messages'}</span>
                  <span className="text-white font-semibold">{stats.messages}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

