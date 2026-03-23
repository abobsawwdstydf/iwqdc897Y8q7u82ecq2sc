import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationsContainerProps {
  notifications: Notification[];
  onDismiss: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const colors = {
  success: 'from-emerald-500/20 to-teal-500/20 border-emerald-500/30',
  error: 'from-red-500/20 to-rose-500/20 border-red-500/30',
  info: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
  warning: 'from-amber-500/20 to-orange-500/20 border-amber-500/30',
};

const iconColors = {
  success: 'text-emerald-400',
  error: 'text-red-400',
  info: 'text-blue-400',
  warning: 'text-amber-400',
};

export function NotificationsContainer({ notifications, onDismiss }: NotificationsContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm pointer-events-none">
      <AnimatePresence>
        {notifications.map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NotificationItem({ notification, onDismiss }: { notification: Notification; onDismiss: (id: string) => void }) {
  const Icon = icons[notification.type];
  const colorClass = colors[notification.type];
  const iconColorClass = iconColors[notification.type];

  useEffect(() => {
    if (notification.duration !== 0) {
      const timer = setTimeout(() => {
        onDismiss(notification.id);
      }, notification.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [notification.id, notification.duration, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 100, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`pointer-events-auto min-w-[300px] max-w-sm p-4 rounded-2xl bg-gradient-to-br ${colorClass} backdrop-blur-2xl border shadow-2xl overflow-hidden`}
    >
      <div className="flex items-start gap-3">
        <Icon size={20} className={`flex-shrink-0 mt-0.5 ${iconColorClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{notification.title}</p>
          {notification.message && (
            <p className="text-xs text-zinc-300 mt-1 leading-relaxed">{notification.message}</p>
          )}
        </div>
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
let notificationListeners: ((notifications: Notification[]) => void)[] = [];
let currentNotifications: Notification[] = [];

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const listener = (newNotifications: Notification[]) => {
      setNotifications(newNotifications);
    };
    notificationListeners.push(listener);
    listener(currentNotifications);
    return () => {
      notificationListeners = notificationListeners.filter(l => l !== listener);
    };
  }, []);

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const newNotification: Notification = {
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
    success: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'success', title, message, duration }),
    error: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'error', title, message, duration }),
    info: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'info', title, message, duration }),
    warning: (title: string, message?: string, duration?: number) =>
      addNotification({ type: 'warning', title, message, duration }),
  };
}

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { notifications, dismissNotification } = useNotifications();
  return (
    <>
      {children}
      <NotificationsContainer notifications={notifications} onDismiss={dismissNotification} />
    </>
  );
};
