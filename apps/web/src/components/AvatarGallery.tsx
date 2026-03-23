import { useState, useRef } from 'react';
import { motion, Reorder } from 'framer-motion';
import { Upload, X, Star, Trash2, Image as ImageIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useLang } from '../lib/i18n';
import type { ChatAvatar } from '../lib/types';

interface AvatarGalleryProps {
  chatId: string;
  avatars: ChatAvatar[];
  onAvatarsChange: () => void;
}

export default function AvatarGallery({ chatId, avatars, onAvatarsChange }: AvatarGalleryProps) {
  const { t } = useLang();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);
    try {
      await api.uploadChatAvatars(chatId, files);
      onAvatarsChange();
    } catch (error) {
      console.error('Upload error:', error);
      alert('Ошибка загрузки: ' + (error as Error).message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSetMain = async (avatarId: number) => {
    try {
      await api.setMainChatAvatar(chatId, avatarId);
      onAvatarsChange();
    } catch (error) {
      console.error('Set main error:', error);
    }
  };

  const handleDelete = async (avatarId: number) => {
    if (!confirm('Удалить это фото?')) return;
    try {
      await api.deleteChatAvatar(chatId, avatarId);
      onAvatarsChange();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handleReorder = async (newOrder: ChatAvatar[]) => {
    const avatarIds = newOrder.map(a => parseInt(a.id));
    try {
      await api.reorderChatAvatars(chatId, avatarIds);
      onAvatarsChange();
    } catch (error) {
      console.error('Reorder error:', error);
    }
  };

  const openLightbox = (avatar: ChatAvatar) => {
    setSelectedAvatar(avatar.url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-zinc-300">Фотографии профиля</h4>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading || avatars.length >= 100}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-Nexo-500/20 text-Nexo-400 hover:bg-Nexo-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload size={14} />
          {isUploading ? 'Загрузка...' : `Добавить фото (${avatars.length}/100)`}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleUpload}
        className="hidden"
      />

      {avatars.length === 0 ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer hover:border-white/20 hover:bg-white/5 transition-all"
        >
          <ImageIcon size={32} className="mx-auto mb-3 text-zinc-600" />
          <p className="text-sm text-zinc-400">Нет фотографий</p>
          <p className="text-xs text-zinc-500 mt-1">Нажмите чтобы добавить до 100 фото</p>
        </div>
      ) : (
        <Reorder.Group
          axis="y"
          values={avatars}
          onReorder={handleReorder}
          className="grid grid-cols-3 gap-2"
        >
          {avatars.map((avatar) => (
            <Reorder.Item
              key={avatar.id}
              value={avatar}
              className="relative group aspect-square rounded-xl overflow-hidden cursor-grab active:cursor-grabbing"
            >
              <img
                src={avatar.url}
                alt=""
                className="w-full h-full object-cover"
                onClick={() => openLightbox(avatar)}
              />

              {/* Main badge */}
              {avatar.isMain && (
                <div className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center shadow-lg">
                  <Star size={12} className="text-white fill-white" />
                </div>
              )}

              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!avatar.isMain && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSetMain(parseInt(avatar.id)); }}
                    className="p-2 rounded-full bg-yellow-500/20 hover:bg-yellow-500/30 transition-colors"
                    title="Сделать главным"
                  >
                    <Star size={16} className="text-yellow-400" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(parseInt(avatar.id)); }}
                  className="p-2 rounded-full bg-red-500/20 hover:bg-red-500/30 transition-colors"
                  title="Удалить"
                >
                  <Trash2 size={16} className="text-red-400" />
                </button>
              </div>

              {/* Drag handle indicator */}
              <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-5 h-5 rounded bg-black/50 flex items-center justify-center">
                  <div className="flex flex-col gap-0.5">
                    <div className="w-3 h-0.5 bg-white/50 rounded" />
                    <div className="w-3 h-0.5 bg-white/50 rounded" />
                  </div>
                </div>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/* Lightbox */}
      {selectedAvatar && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setSelectedAvatar(null)}
        >
          <button
            onClick={() => setSelectedAvatar(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
          >
            <X size={24} />
          </button>
          <img
            src={selectedAvatar}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

