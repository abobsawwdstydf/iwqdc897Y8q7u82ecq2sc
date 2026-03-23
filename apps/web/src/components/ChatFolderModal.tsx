import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderPlus, X, Check, Edit3, Trash2, Plus, Hash, MessageSquare, Users, Bell, BellOff, Palette } from 'lucide-react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';

interface ChatFolder {
  id: number;
  userId: number;
  name: string;
  color: string;
  icon: string;
  position: number;
  chats: Array<{ chatId: number; position: number }>;
}

interface ChatFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COLORS = [
  '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
  '#ec4899', '#8b5cf6', '#06b6d4', '#84cc16', '#f97316'
];

const ICONS = [
  { id: 'folder', icon: Folder },
  { id: 'hash', icon: Hash },
  { id: 'message', icon: MessageSquare },
  { id: 'users', icon: Users },
  { id: 'bell', icon: Bell },
  { id: 'bell-off', icon: BellOff },
  { id: 'palette', icon: Palette },
];

export default function ChatFolderModal({ isOpen, onClose, onSuccess }: ChatFolderModalProps) {
  const { t, lang } = useLang();
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ChatFolder | null>(null);
  
  // Create form
  const [folderName, setFolderName] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState('folder');

  useEffect(() => {
    if (isOpen) {
      loadFolders();
    }
  }, [isOpen]);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const data = await api.getFolders();
      setFolders(data);
    } catch (error) {
      console.error('Failed to load folders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!folderName.trim()) return;
    
    try {
      await api.createFolder(folderName.trim(), selectedColor, selectedIcon);
      setFolderName('');
      setSelectedColor(COLORS[0]);
      setSelectedIcon('folder');
      setShowCreate(false);
      await loadFolders();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to create folder:', error);
    }
  };

  const handleUpdate = async () => {
    if (!editingFolder || !folderName.trim()) return;
    
    try {
      await api.updateFolder(editingFolder.id, { 
        name: folderName.trim(), 
        color: selectedColor,
        icon: selectedIcon 
      });
      setEditingFolder(null);
      setShowCreate(false);
      await loadFolders();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to update folder:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить эту папку?')) return;
    
    try {
      await api.deleteFolder(id);
      await loadFolders();
      onSuccess?.();
    } catch (error) {
      console.error('Failed to delete folder:', error);
    }
  };

  const openEdit = (folder: ChatFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setSelectedColor(folder.color);
    setSelectedIcon(folder.icon);
    setShowCreate(true);
  };

  const resetForm = () => {
    setFolderName('');
    setSelectedColor(COLORS[0]);
    setSelectedIcon('folder');
    setEditingFolder(null);
    setShowCreate(false);
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
            className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-md bg-[#1a1a2e] border border-white/10 rounded-2xl z-50 max-h-[80vh] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Folder className="w-5 h-5 text-Nexo-500" />
                {lang === 'ru' ? 'Папки чатов' : 'Chat Folders'}
              </h2>
              <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Folders List */}
              <div className="space-y-2 mb-4">
                {loading ? (
                  <div className="text-center py-8 text-zinc-500">Загрузка...</div>
                ) : folders.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    {lang === 'ru' ? 'Нет папок' : 'No folders'}
                  </div>
                ) : (
                  folders.map((folder) => (
                    <motion.div
                      key={folder.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group"
                      style={{ borderLeftColor: folder.color, borderLeftWidth: '3px' }}
                    >
                      <div 
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${folder.color}20` }}
                      >
                        {ICONS.find(i => i.id === folder.icon)?.icon({ 
                          className: 'w-5 h-5', 
                          style: { color: folder.color } 
                        }) || <Folder className="w-5 h-5" style={{ color: folder.color }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{folder.name}</p>
                        <p className="text-xs text-zinc-500">
                          {folder.chats?.length || 0} {lang === 'ru' ? 'чатов' : 'chats'}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => openEdit(folder)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                        >
                          <Edit3 className="w-4 h-4 text-zinc-400" />
                        </button>
                        <button 
                          onClick={() => handleDelete(folder.id)}
                          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Create Button */}
              {!showCreate && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full py-3 px-4 bg-Nexo-500/20 hover:bg-Nexo-500/30 border border-Nexo-500/30 rounded-xl text-Nexo-400 font-semibold transition-all flex items-center justify-center gap-2"
                >
                  <FolderPlus className="w-5 h-5" />
                  {lang === 'ru' ? 'Создать папку' : 'Create Folder'}
                </button>
              )}

              {/* Create/Edit Form */}
              <AnimatePresence>
                {showCreate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {lang === 'ru' ? 'Название' : 'Name'}
                      </label>
                      <input
                        type="text"
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
                        placeholder={lang === 'ru' ? 'Личное, Работа, Каналы...' : 'Personal, Work, Channels...'}
                        className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:border-Nexo-500/50 focus:ring-1 focus:ring-Nexo-500/25 transition-all"
                        autoFocus
                      />
                    </div>

                    {/* Color Selection */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {lang === 'ru' ? 'Цвет' : 'Color'}
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => setSelectedColor(color)}
                            className={`w-8 h-8 rounded-lg transition-all ${
                              selectedColor === color 
                                ? 'ring-2 ring-white scale-110' 
                                : 'hover:scale-105'
                            }`}
                            style={{ background: color }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Icon Selection */}
                    <div>
                      <label className="block text-sm font-medium text-zinc-400 mb-2">
                        {lang === 'ru' ? 'Иконка' : 'Icon'}
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {ICONS.map(({ id, icon: Icon }) => (
                          <button
                            key={id}
                            onClick={() => setSelectedIcon(id)}
                            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                              selectedIcon === id 
                                ? 'bg-Nexo-500/20 ring-2 ring-Nexo-500 scale-110' 
                                : 'bg-white/5 hover:bg-white/10'
                            }`}
                          >
                            <Icon className="w-5 h-5 text-white" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={resetForm}
                        className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white font-semibold transition-all"
                      >
                        {lang === 'ru' ? 'Отмена' : 'Cancel'}
                      </button>
                      <button
                        onClick={editingFolder ? handleUpdate : handleCreate}
                        disabled={!folderName.trim()}
                        className="flex-1 py-3 px-4 bg-gradient-to-r from-Nexo-500 to-purple-600 hover:from-Nexo-600 hover:to-purple-700 rounded-xl text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        {editingFolder ? (lang === 'ru' ? 'Сохранить' : 'Save') : (lang === 'ru' ? 'Создать' : 'Create')}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
