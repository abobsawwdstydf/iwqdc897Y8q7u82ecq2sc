import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

// Get API URL from environment or derive from current origin
const getApiUrl = () => {
  // Check if we have an explicit API URL in environment
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl) {
    return envUrl.replace('/api', '');
  }

  // For production or when accessed via IP, use the same origin
  return window.location.origin;
};

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    return socket;
  }

  // Clean up old socket instance if it exists but is disconnected
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const socketUrl = getApiUrl();

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    // Silent success
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    // Silent disconnect
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
