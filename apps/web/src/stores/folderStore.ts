import { create } from 'zustand';
import { api } from '../lib/api';
import type { ChatFolder, BuiltInFolder, BuiltInFolderType } from '../lib/types';

interface FolderState {
  folders: ChatFolder[];
  activeFolder: BuiltInFolderType | number | 'all';
  isLoading: boolean;

  // Built-in folders
  builtInFolders: BuiltInFolder[];

  loadFolders: () => Promise<void>;
  setActiveFolder: (folderId: BuiltInFolderType | number) => void;
  addFolder: (folder: ChatFolder) => void;
  updateFolder: (folder: ChatFolder) => void;
  deleteFolder: (folderId: number) => void;
}

const DEFAULT_BUILT_IN_FOLDERS: BuiltInFolder[] = [
  { type: 'all', name: 'Все', icon: 'inbox', color: '#6366f1' },
  { type: 'unread', name: 'Непрочитанные', icon: 'bell', color: '#f59e0b' },
  { type: 'personal', name: 'Личные', icon: 'message', color: '#3b82f6' },
  { type: 'groups', name: 'Группы', icon: 'users', color: '#10b981' },
  { type: 'channels', name: 'Каналы', icon: 'globe', color: '#8b5cf6' },
];

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  activeFolder: 'all',
  isLoading: false,
  builtInFolders: DEFAULT_BUILT_IN_FOLDERS,

  loadFolders: async () => {
    try {
      set({ isLoading: true });
      const folders = await api.getFolders();
      set({ folders, isLoading: false });
    } catch (error) {
      console.error('Failed to load folders:', error);
      set({ isLoading: false });
    }
  },

  setActiveFolder: (folderId) => {
    set({ activeFolder: folderId });
  },

  addFolder: (folder) => {
    set((state) => ({
      folders: [...state.folders, folder],
    }));
  },

  updateFolder: (folder) => {
    set((state) => ({
      folders: state.folders.map((f) => (f.id === folder.id ? folder : f)),
    }));
  },

  deleteFolder: (folderId) => {
    set((state) => ({
      folders: state.folders.filter((f) => f.id !== folderId),
      activeFolder: state.activeFolder === folderId ? 'all' : state.activeFolder,
    }));
  },
}));

