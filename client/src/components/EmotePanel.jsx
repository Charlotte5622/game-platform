import { useState, useEffect, useRef } from 'react';
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
    <div className="emote-container">
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
        onClick={() => setOpen(!open)}
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
