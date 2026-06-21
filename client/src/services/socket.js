import { io } from 'socket.io-client';

let socket = null;
let visHandler = null;

/**
 * 获取 Socket.IO 单例连接
 *
 * 开发环境：Vite proxy 将 /socket.io 转发到后端，连接 window.location.origin 即可
 * 生产环境：Nginx 同理，连接 window.location.origin
 * 也可通过 VITE_SOCKET_URL 环境变量显式指定后端地址
 */
export function getSocket() {
  if (socket) return socket;

  const token = localStorage.getItem('token');
  if (!token) return null;

  const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;

  socket = io(socketUrl, {
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

  // 手机端后台切换守护：页面恢复可见时确保 socket 连接，不做页面刷新
  if (typeof document !== 'undefined') {
    visHandler = () => {
      if (document.visibilityState === 'visible' && socket) {
        if (!socket.connected) {
          console.log('📱 页面恢复可见，Socket 断开，尝试重连...');
          socket.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', visHandler);
  }

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
  if (visHandler) {
    document.removeEventListener('visibilitychange', visHandler);
    visHandler = null;
  }
}
