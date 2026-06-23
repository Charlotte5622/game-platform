import { io } from 'socket.io-client';
import { clearAuthSession, getStoredToken, refreshAccessToken } from './api';

let socket = null;
let visHandler = null;
let refreshingSocket = null;

async function refreshSocketAuth() {
  if (!refreshingSocket) {
    refreshingSocket = refreshAccessToken().finally(() => {
      refreshingSocket = null;
    });
  }
  return refreshingSocket;
}

async function reconnectWithFreshToken() {
  if (!socket) return;
  try {
    const token = await refreshSocketAuth();
    socket.auth = { token };
    socket.disconnect();
    socket.connect();
  } catch {
    clearAuthSession();
    disconnectSocket();
  }
}

export function getSocket() {
  if (socket) return socket;

  const token = getStoredToken();
  if (!token) return null;

  const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

  socket = io(socketUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.on('connect', () => {
    console.log('Socket.IO connected');
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket.IO disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'auth_required' || err.message.includes('Token')) {
      reconnectWithFreshToken();
      return;
    }
    console.error('Socket.IO connection error:', err.message);
  });

  socket.on('auth_required', () => {
    reconnectWithFreshToken();
  });

  if (typeof document !== 'undefined') {
    visHandler = async () => {
      if (document.visibilityState === 'visible' && socket) {
        if (!socket.connected) {
          await reconnectWithFreshToken();
        } else {
          const savedRoomId = localStorage.getItem('activeRoomId');
          if (savedRoomId) {
            socket.emit('sync_state', { roomId: savedRoomId });
          }
        }
      }
    };
    document.addEventListener('visibilitychange', visHandler);
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (visHandler) {
    document.removeEventListener('visibilitychange', visHandler);
    visHandler = null;
  }
}
