import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    console.log('[Socket] Already connected');
    return socket;
  }

  // Clean up old socket instance if it exists but is disconnected
  if (socket) {
    console.log('[Socket] Cleaning up old socket');
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }

  const socketUrl = window.location.origin;
  console.log('[Socket] Connecting to:', socketUrl);

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected with id:', socket?.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
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
