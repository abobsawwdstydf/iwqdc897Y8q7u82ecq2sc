import { useState } from 'react';
import { motion } from 'framer-motion';
import { Folder, Hash, MessageSquare, Users, Bell, Globe, Star, Inbox, UnreadIcon } from 'lucide-react';
import type { BuiltInFolderType } from '../lib/types';

interface ChatFolderTabProps {
  folder: {
    type?: BuiltInFolderType;
    id?: number;
    name: string;
    icon?: string;
    color?: string;
    count?: number;
  };
  isActive: boolean;
  onClick: () => void;
}

const ICONS: Record<string, React.ComponentType<{ size: number; className?: string }>> = {
  folder: Folder,
  hash: Hash,
  message: MessageSquare,
  users: Users,
  bell: Bell,
  globe: Globe,
  star: Star,
  inbox: Inbox,
};

export default function ChatFolderTab({ folder, isActive, onClick }: ChatFolderTabProps) {
  const IconComponent = folder.icon ? (ICONS[folder.icon] || Folder) : Folder;

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      className={`
        flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap
        ${isActive 
          ? 'bg-Nimbus-500/20 text-Nimbus-400 ring-1 ring-Nimbus-500/30' 
          : 'bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white'
        }
      `}
      style={{
        borderLeft: folder.color ? `3px solid ${folder.color}` : undefined,
      }}
    >
      <IconComponent 
        size={16} 
        className="flex-shrink-0"
        style={{ color: isActive ? folder.color : undefined }}
      />
      <span className="truncate">{folder.name}</span>
      {folder.count !== undefined && folder.count > 0 && (
        <span className={`
          px-1.5 py-0.5 rounded-full text-[10px] font-bold min-w-[20px]
          ${isActive ? 'bg-Nimbus-500/30 text-white' : 'bg-zinc-700 text-zinc-300'}
        `}>
          {folder.count}
        </span>
      )}
    </motion.button>
  );
}
