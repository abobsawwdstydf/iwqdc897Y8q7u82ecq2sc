import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, PhoneOff, Video, MessageCircle, AtSign, Bell } from 'lucide-react';

export type NotificationType = 'call' | 'mention' | 'message' | 'info' | 'success' | 'error';

export interface InAppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  avatar?: string;
  senderName?: string;
  onAccept?: () => void;
  onDecline?: () => void;
  onClick?: () => void;
  duration?: number;
}

interface InAppNotificationsProps {
  notifications: InAppNotification[];
  onDismiss: (id: string) => void;
}

const typeConfig = {
  call: {
    icon: Phone,
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
    iconColor: 'text-emerald-400',
  },
  mention: {
    icon: AtSign,
    color: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
    iconColor: 'text-blue-400',
  },
  message: {
    icon: MessageCircle,
    color: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
    iconColor: 'text-purple-400',
  },
  info: {
    icon: Bell,
    color: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
    iconColor: 'text-amber-400',
  },
  success: {
    icon: Bell,
    color: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
    iconColor: 'text-emerald-400',
  },
  error: {
    icon: Bell,
    color: 'from-red-500/20 to-rose-500/20 border-red-500/30',
    iconColor: 'text-red-400',
  },
};

export function InAppNotifications({ notifications, onDismiss }: InAppNotificationsProps) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none">
      <AnimatePresence>
        {notifications.map((notification) => (
          <InAppNotificationItem
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function InAppNotificationItem({ notification, onDismiss }: { notification: InAppNotification; onDismiss: (id: string) => void }) {
  const config = typeConfig[notification.type];
  const Icon = config.icon;

  useEffect(() => {
    if (notification.duration !== 0 && !notification.onAccept) {
      const timer = setTimeout(() => {
        onDismiss(notification.id);
      }, notification.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.id, notification.duration, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`pointer-events-auto min-w-[320px] max-w-md p-4 rounded-2xl bg-gradient-to-br ${config.color} backdrop-blur-2xl border shadow-2xl overflow-hidden`}
    >
      <div className="flex items-start gap-3">
        {/* Avatar or Icon */}
        {notification.avatar ? (
          <img src={notification.avatar} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0`}>
            <Icon size={20} className={config.iconColor} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {notification.senderName && (
            <p className="text-xs text-zinc-400 mb-0.5">{notification.senderName}</p>
          )}
          <p className="text-sm font-semibold text-white">{notification.title}</p>
          {notification.message && (
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{notification.message}</p>
          )}

          {/* Action buttons for call notifications */}
          {(notification.onAccept || notification.onDecline) && (
            <div className="flex items-center gap-2 mt-3">
              {notification.onDecline && (
                <button
                  onClick={() => {
                    notification.onDecline?.();
                    onDismiss(notification.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                >
                  <PhoneOff size={16} />
                  Отклонить
                </button>
              )}
              {notification.onAccept && (
                <button
                  onClick={() => {
                    notification.onAccept?.();
                    onDismiss(notification.id);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 transition-colors"
                >
                  <Phone size={16} />
                  Принять
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={() => onDismiss(notification.id)}
          className="flex-shrink-0 p-1 rounded-full hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
}

// Global notification state
let notificationListeners: ((notifications: InAppNotification[]) => void)[] = [];
let currentNotifications: InAppNotification[] = [];

export function useInAppNotifications() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);

  useEffect(() => {
    const listener = (newNotifications: InAppNotification[]) => {
      setNotifications(newNotifications);
    };
    notificationListeners.push(listener);
    listener(currentNotifications);
    return () => {
      notificationListeners = notificationListeners.filter(l => l !== listener);
    };
  }, []);

  const addNotification = (notification: Omit<InAppNotification, 'id'>) => {
    const newNotification: InAppNotification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
    };
    currentNotifications = [...currentNotifications, newNotification];
    notificationListeners.forEach(listener => listener(currentNotifications));
    return newNotification.id;
  };

  const dismissNotification = (id: string) => {
    currentNotifications = currentNotifications.filter(n => n.id !== id);
    notificationListeners.forEach(listener => listener(currentNotifications));
  };

  const dismissAll = () => {
    currentNotifications = [];
    notificationListeners.forEach(listener => listener(currentNotifications));
  };

  return {
    notifications,
    addNotification,
    dismissNotification,
    dismissAll,
    call: (title: string, message?: string, onAccept?: () => void, onDecline?: () => void) =>
      addNotification({ type: 'call', title, message, onAccept, onDecline, duration: 0 }),
    mention: (title: string, message?: string, onClick?: () => void) =>
      addNotification({ type: 'mention', title, message, onClick, duration: 5000 }),
    message: (title: string, message?: string, onClick?: () => void) =>
      addNotification({ type: 'message', title, message, onClick, duration: 5000 }),
    info: (title: string, message?: string) =>
      addNotification({ type: 'info', title, message, duration: 5000 }),
    success: (title: string, message?: string) =>
      addNotification({ type: 'success', title, message, duration: 3000 }),
    error: (title: string, message?: string) =>
      addNotification({ type: 'error', title, message, duration: 5000 }),
  };
}

export const InAppNotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { notifications, dismissNotification } = useInAppNotifications();
  return (
    <>
      {children}
      <InAppNotifications notifications={notifications} onDismiss={dismissNotification} />
    </>
  );
};
