import { useState, useEffect, useRef, useCallback } from 'react';
import { EMOTE_LIST, playEmote } from '../services/sounds';

/**
 * 互动语音面板
 * @param {Object} props
 * @param {Object} props.socket - socket实例
 * @param {string} props.roomId - 房间ID
 * @param {string} props.playerId - 当前玩家ID
 * @param {Array} props.players - 玩家列表
 * @param {string} props.gameId - 游戏ID
 */
export default function EmotePanel({ socket, roomId, playerId, players, gameId }) {
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState(null); // { playerId, emoteId, label, icon }
  const timerRef = useRef(null);
  const containerRef = useRef(null);
  const dragState = useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const hasMoved = useRef(false);

  // 从 localStorage 读取保存的位置，否则默认右下角
  const [position, setPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('emote-btn-pos');
      if (saved) {
        const pos = JSON.parse(saved);
        if (typeof pos.x === 'number' && typeof pos.y === 'number') return pos;
      }
    } catch {}
    // 默认右下角
    return { x: window.innerWidth - 76, y: window.innerHeight - 140 };
  });

  // 保存位置到 localStorage
  const savePos = useCallback((pos) => {
    try { localStorage.setItem('emote-btn-pos', JSON.stringify(pos)); } catch {}
  }, []);

  // --- 拖动实现 ---
  const onPointerDown = useCallback((e) => {
    // 只响应左键 / 单指触控
    if (e.type === 'mousedown' && e.button !== 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = {
      dragging: true,
      startX: clientX,
      startY: clientY,
      offsetX: clientX - position.x,
      offsetY: clientY - position.y,
    };
    hasMoved.current = false;
  }, [position]);

  const onPointerMove = useCallback((e) => {
    const ds = dragState.current;
    if (!ds.dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - ds.startX;
    const dy = clientY - ds.startY;
    if (!hasMoved.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    hasMoved.current = true;
    e.preventDefault(); // 防止手机端滚动
    const newX = Math.max(0, Math.min(window.innerWidth - 50, clientX - ds.offsetX));
    const newY = Math.max(0, Math.min(window.innerHeight - 50, clientY - ds.offsetY));
    setPosition({ x: newX, y: newY });
  }, []);

  const onPointerUp = useCallback(() => {
    if (dragState.current.dragging && hasMoved.current) {
      savePos(position);
    }
    dragState.current.dragging = false;
  }, [position, savePos]);

  useEffect(() => {
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    window.addEventListener('touchmove', onPointerMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    return () => {
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      window.removeEventListener('touchmove', onPointerMove);
      window.removeEventListener('touchend', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  // 按钮点击：只有未拖动时才展开面板
  const handleBtnClick = useCallback(() => {
    if (!hasMoved.current) {
      setOpen(prev => !prev);
    }
  }, []);

  // 监听其他玩家的互动语音
  useEffect(() => {
    if (!socket) return;
    const handleEmote = (data) => {
      if (String(data.playerId) === String(playerId)) return; // 自己的不重复显示
      const emote = EMOTE_LIST.find(e => e.id === data.emoteId);
      if (emote) {
        playEmote(data.emoteId);
        showBubble(data.playerId, emote);
      }
    };
    socket.on('emote', handleEmote);
    return () => socket.off('emote', handleEmote);
  }, [socket, playerId]);

  const showBubble = (pid, emote) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBubble({ playerId: pid, ...emote });
    timerRef.current = setTimeout(() => setBubble(null), 3000);
  };

  const sendEmote = (emote) => {
    playEmote(emote.id);
    showBubble(playerId, emote);
    if (socket && roomId) {
      socket.emit('game_action', { roomId, action: { type: 'emote', emoteId: emote.id } });
    }
    setOpen(false);
  };

  // 找到发送者的昵称
  const senderName = bubble ? (players.find(p => String(p.id) === String(bubble.playerId))?.nickname || '玩家') : '';

  return (
    <div
      ref={containerRef}
      className="emote-container emote-container--draggable"
      style={{ left: position.x, top: position.y, right: 'auto', bottom: 'auto' }}
      onMouseDown={onPointerDown}
      onTouchStart={onPointerDown}
    >
      {/* 气泡 */}
      {bubble && (
        <div className="emote-bubble">
          <span className="emote-bubble-sender">{senderName}：</span>
          <span className="emote-bubble-icon">{bubble.icon}</span>
          <span className="emote-bubble-text">{bubble.label}</span>
        </div>
      )}

      {/* 按钮 */}
      <button
        className="emote-btn"
        onClick={handleBtnClick}
        title="互动语音"
      >
        💬
      </button>

      {/* 面板 */}
      {open && (
        <div className="emote-panel">
          {EMOTE_LIST.map(emote => (
            <button
              key={emote.id}
              className="emote-item"
              onClick={() => sendEmote(emote)}
            >
              <span className="emote-item-icon">{emote.icon}</span>
              <span className="emote-item-label">{emote.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
