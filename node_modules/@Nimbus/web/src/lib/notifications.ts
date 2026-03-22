// Web Notifications API utility

let notificationPermission: NotificationPermission = 'default';

// Request permission to show notifications
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission !== 'default') {
    notificationPermission = Notification.permission;
    return Notification.permission;
  }

  try {
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return 'denied';
  }
}

// Get current permission status
export function getNotificationPermission(): NotificationPermission {
  if ('Notification' in window) {
    notificationPermission = Notification.permission;
  }
  return notificationPermission;
}

// Show a notification
export function showNotification(title: string, options?: NotificationOptions) {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  try {
    const notification = new Notification(title, {
      icon: '/logo.png',
      badge: '/logo.png',
      silent: false,
      ...options,
    });

    // Auto close after 5 seconds
    setTimeout(() => notification.close(), 5000);

    return notification;
  } catch (error) {
    console.error('Error showing notification:', error);
    return null;
  }
}

// Show message notification
export function showMessageNotification(
  senderName: string,
  messageContent: string,
  chatId?: string
) {
  const title = senderName;
  const options: NotificationOptions = {
    body: messageContent,
    tag: chatId ? `chat-${chatId}` : 'message',
    requireInteraction: false,
  };

  return showNotification(title, options);
}
