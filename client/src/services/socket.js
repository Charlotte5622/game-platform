import { io } from 'socket.io-client';

let socket = null;

/**
 * 获取 Socket.IO 单例连接
 */
export function getSocket() {
  if (socket) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  socket = io(window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('🔌 Socket.IO 已连接');
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket.IO 断开:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('🔌 Socket.IO 连接错误:', err.message);
  });

  return socket;
}

/**
 * 断开连接
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
