import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSocket } from '../services/socket';

/**
 * 安全解析 localStorage 中的用户信息
 */
function getPlayerId() {
  try {
    return JSON.parse(localStorage.getItem('user'))?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * GameHost - 游戏容器组件
 *
 * 管理 Socket.IO 连接、房间状态、游戏生命周期
 */
export default function GameHost({ gameId, GameComponent }) {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState('choosing'); // choosing | matching | waiting | playing | finished
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [maxPlayers, setMaxPlayers] = useState(4); // 默认4人，从API获取

  const playerId = useMemo(getPlayerId, []);

  // 获取游戏人数配置
  useEffect(() => {
    fetch(`/api/games/${gameId}`)
      .then(res => res.json())
      .then(data => {
        if (data.game?.maxPlayers) setMaxPlayers(data.game.maxPlayers);
      })
      .catch(() => {});
  }, [gameId]);

  // 初始化 Socket 连接 + 注册事件（只做一次）
  useEffect(() => {
    const s = getSocket();
    if (!s) {
      setError('未登录，请先登录');
      return;
    }
    setSocket(s);

    // ===== 房间事件 =====
    s.on('room_update', (data) => {
      setRoomId(data.roomId);
      setRoomCode(data.roomCode);
      setPlayers(data.players);
      if (data.state === 'waiting') setPhase('waiting');
    });

    // ===== 游戏生命周期 =====
    s.on('game_start', (data) => {
      setGameState(data.state);
      setPhase('playing');
    });

    s.on('state_update', (data) => {
      setGameState(data.state);
    });

    s.on('game_restart', (data) => {
      setGameState(data.state);
    });

    // BUG-4 修复：监听 play_update，即时更新 playHistory
    s.on('play_update', (data) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          playHistory: [
            ...(prev.playHistory || []),
            { playerId: data.playerId, cards: data.cards, cardType: data.cardType, action: 'play' },
          ],
        };
      });
    });

    // BUG-5 修复：监听 pass_update，即时写入 playHistory
    s.on('pass_update', (data) => {
      setGameState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          playHistory: [
            ...(prev.playHistory || []),
            { playerId: data.playerId, cards: [], action: 'pass' },
          ],
        };
      });
    });

    s.on('game_over', (data) => {
      setResult(data);
      setPhase('finished');
    });

    return () => {
      s.off('room_update');
      s.off('game_start');
      s.off('state_update');
      s.off('game_restart');
      s.off('play_update');
      s.off('pass_update');
      s.off('game_over');
    };
  }, [gameId]);

  // 快速匹配
  const handleQuickMatch = useCallback(() => {
    if (!socket) return;
    setPhase('matching');
    socket.emit('quick_match', { gameId }, (response) => {
      if (response.error) {
        setError(response.error);
        return;
      }
      setRoomId(response.roomId);
      setRoomCode(response.roomCode);
      setPlayers(response.players);
      setPhase('waiting');
    });
  }, [socket, gameId]);

  // 通过房间号加入
  const handleJoinByCode = useCallback((code) => {
    if (!socket) return;
    if (!code || !/^\d{3}$/.test(code)) {
      setError('请输入3位数字房间号');
      return;
    }
    socket.emit('join_by_code', { code, gameId }, (response) => {
      if (response.error) {
        setError(response.error);
        return;
      }
      setRoomId(response.roomId);
      setRoomCode(response.roomCode);
      setPlayers(response.players);
      setPhase('waiting');
    });
  }, [socket, gameId]);

  const handleReady = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: true });
    }
  }, [socket, roomId]);

  const handleUnready = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: false });
    }
  }, [socket, roomId]);

  const handleAction = useCallback(
    (action) => {
      if (socket && roomId) {
        socket.emit('game_action', { roomId, action });
      }
    },
    [socket, roomId]
  );

  // ===== 页面离开检测（手机返回 / 关闭标签页 / 刷新） =====
  useEffect(() => {
    if (!socket || !roomId) return;

    // 主动离开房间
    const leaveRoom = () => {
      try {
        socket.emit('leave_room');
      } catch {}
    };

    // 1. 浏览器关闭/刷新
    const handleBeforeUnload = (e) => {
      leaveRoom();
    };

    // 2. 手机返回键 / 浏览器后退
    const handlePopState = (e) => {
      leaveRoom();
    };

    // 3. 页面可见性变化（手机切后台/切标签页）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // 页面隐藏时发送 beacon（更可靠，不会被页面卸载中断）
        if (navigator.sendBeacon) {
          const token = localStorage.getItem('token');
          navigator.sendBeacon('/api/leave-room', JSON.stringify({ roomId, token }));
        }
      }
    };

    // 4. 组件卸载（React Router 导航离开）
    const handleUnmount = () => {
      leaveRoom();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      handleUnmount();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, roomId]);

  // ===== 各阶段渲染 =====

  if (error) {
    return (
      <div className="game-host">
        <div className="error-box">
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>⚠️</span>
          <h2>{error}</h2>
          <button className="back-btn" onClick={() => (window.location.href = '/lobby')}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  // 选择入口：快速匹配 or 输入房间号
  if (phase === 'choosing') {
    return (
      <div className="game-host">
        <div className="choosing-box">
          <h2>选择加入方式</h2>
          <div className="choosing-actions">
            <button className="choosing-btn quick-match" onClick={handleQuickMatch}>
              ⚡ 快速匹配
            </button>
            <div className="choosing-divider">或</div>
            <div className="choosing-code-input">
              <input
                type="text"
                placeholder="输入3位房间号"
                maxLength={3}
                pattern="\d*"
                id="room-code-input"
              />
              <button
                className="choosing-btn join-code"
                onClick={() => {
                  const input = document.getElementById('room-code-input');
                  handleJoinByCode(input?.value);
                }}
              >
                🚪 加入房间
              </button>
            </div>
          </div>
          {error && <p className="choosing-error">{error}</p>}
        </div>
      </div>
    );
  }

  if (phase === 'matching') {
    return (
      <div className="game-host">
        <div className="matching-box">
          <div className="matching-spinner">⏳</div>
          <h2 className="matching-text">正在匹配房间...</h2>
          <p className="matching-hint">正在寻找可用的游戏房间</p>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    const isReady = players.find((p) => p.id === playerId)?.ready;
    return (
      <div className="game-host">
        <div className="waiting-box">
          <h2 className="waiting-title">🎮 等待玩家加入</h2>
          <div className="waiting-room-id">房间号: {roomCode || roomId}</div>

          <div className="waiting-players">
            {players.map((p) => (
              <div key={p.id} className={`waiting-player${p.ready ? ' ready' : ''}`}>
                <span className="waiting-player-name">
                  {p.id === playerId ? `${p.nickname}（你）` : p.nickname}
                </span>
                <span className={`waiting-player-status${p.ready ? ' ready' : ''}`}>
                  {p.ready ? '✅ 已准备' : '⏳ 等待中'}
                </span>
              </div>
            ))}
            {Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="waiting-empty-slot">
                等待玩家加入...
              </div>
            ))}
          </div>

          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '16px' }}>
            需要 {maxPlayers} 位玩家才能开始
          </p>

          {!isReady ? (
            <button className="waiting-ready-btn" onClick={handleReady}>
              准备
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <p style={{ color: 'var(--success)', fontWeight: '600' }}>
                ✅ 你已准备，等待其他玩家...
              </p>
              <button className="waiting-unready-btn" onClick={handleUnready}>
                取消准备
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="game-host">
        <div className="result-box">
          <span style={{ fontSize: '72px', display: 'block', marginBottom: '16px' }}>
            {result?.winners?.includes(playerId) ? '🎉' : '😢'}
          </span>
          <h2>{result?.message || '游戏结束'}</h2>
          {result?.scores && (
            <div className="result-scores">
              {Object.entries(result.scores).map(([pid, score]) => {
                const p = players.find((pl) => String(pl.id) === String(pid));
                const cls = score > 0 ? 'win' : score < 0 ? 'lose' : 'draw';
                return (
                  <div key={pid} className="result-score-item">
                    <div className="result-score-name">{p?.nickname || pid}</div>
                    <div className={`result-score-value ${cls}`}>
                      {score > 0 ? '+' : ''}{score}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button className="back-btn" onClick={() => (window.location.href = '/lobby')}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  // 游戏进行中
  return (
    <GameComponent
      socket={socket}
      roomId={roomId}
      playerId={playerId}
      gameState={gameState}
      onAction={handleAction}
      players={players}
    />
  );
}
