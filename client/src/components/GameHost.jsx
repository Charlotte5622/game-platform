import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSocket } from '../services/socket';
import { playSound } from '../services/sounds';

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
  const [maxPlayers, setMaxPlayers] = useState(null); // 从API获取
  const [hostId, setHostId] = useState(null);
  const [allowBots, setAllowBots] = useState(true); // 默认允许，从API获取
  const [gameName, setGameName] = useState(''); // 游戏名称
  const [minPlayers, setMinPlayers] = useState(null);
  const effectiveMaxPlayers = maxPlayers || 2; // 兜底2人
  const effectiveMinPlayers = minPlayers || 2;
  const isVariablePlayers = effectiveMinPlayers !== effectiveMaxPlayers;

  const playerId = useMemo(getPlayerId, []);

  // 获取游戏人数配置
  useEffect(() => {
    fetch(`/api/games/${gameId}`)
      .then(res => res.json())
      .then(data => {
        if (data.game?.maxPlayers) setMaxPlayers(data.game.maxPlayers);
        if (data.game?.allowBots === false) setAllowBots(false);
        if (data.game?.name) setGameName(data.game.name);
        if (data.game?.minPlayers) setMinPlayers(data.game.minPlayers);
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
      if (data.hostId) setHostId(data.hostId);
      if (data.state === 'waiting') setPhase('waiting');
    });

    // ===== 游戏生命周期 =====
    s.on('game_start', (data) => {
      setGameState(data.state);
      setPhase('playing');
    });

    s.on('state_update', (data) => {
      console.log(`[GameHost] state_update: phase=${data.state?.phase}`);
      setGameState(data.state);
    });

    s.on('game_restart', (data) => {
      setGameState(data.state);
    });

    s.on('game_over', (data) => {
      setResult(data);
      setPhase('finished');
      const won = data?.winners?.includes(playerId) || String(data?.winner) === String(playerId);
      playSound(gameId, won ? 'win' : 'lose');
    });

    return () => {
      s.off('room_update');
      s.off('game_start');
      s.off('state_update');
      s.off('game_restart');
      s.off('game_over');
    };
  }, [gameId]);

  // 快速匹配
  const handleCreateRoom = useCallback((customCode) => {
    if (!socket) return;
    setError(null);
    setPhase('matching');
    // 如果提供了自定义房间号，使用 create_room 事件
    if (customCode) {
      if (!/^\d{1,6}$/.test(customCode)) {
        setError('请输入1-6位数字房间号');
        setPhase('choosing');
        return;
      }
      socket.emit('create_room', { gameId, roomCode: customCode }, (response) => {
        if (response.error) {
          setError(response.error);
          setPhase('choosing');
          return;
        }
        setRoomId(response.roomId);
        setRoomCode(response.roomCode);
        setPlayers(response.players);
        if (response.hostId) setHostId(response.hostId);
        setPhase('waiting');
      });
    } else {
      // 快速匹配（自动创建或加入房间）
      socket.emit('quick_match', { gameId }, (response) => {
        if (response.error) {
          setError(response.error);
          setPhase('choosing');
          return;
        }
        setRoomId(response.roomId);
        setRoomCode(response.roomCode);
        setPlayers(response.players);
        if (response.hostId) setHostId(response.hostId);
        setPhase('waiting');
      });
    }
  }, [socket, gameId]);

  // 通过房间号加入
  const handleJoinByCode = useCallback((code) => {
    if (!socket) return;
    if (!code || !/^\d{1,6}$/.test(code)) {
      setError('请输入1-6位数字房间号');
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
      if (response.hostId) setHostId(response.hostId);
      setPhase('waiting');
    });
  }, [socket, gameId]);

  const handleReady = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: true });
    }
  }, [socket, roomId]);

  const handleAddBots = useCallback(() => {
    if (!socket || !roomId) return;
    socket.emit('add_bots', { roomId }, (response) => {
      if (response?.error) return; // 静默忽略
      if (response?.botsAdded === 0) return; // 已满，静默忽略
      // botsAdded > 0: 机器人已添加，等待玩家准备
    });
  }, [socket, roomId]);

  const handleUnready = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: false });
    }
  }, [socket, roomId]);

  // 踢出玩家（仅房主）
  const handleKickPlayer = useCallback((targetId) => {
    if (!socket || !roomId) return;
    socket.emit('kick_player', { roomId, targetId }, (response) => {
      if (response?.error) {
        setError(response.error);
      }
    });
  }, [socket, roomId]);

  // 房主直接开始游戏（可变人数游戏）
  const handleStartGame = useCallback(() => {
    if (!socket || !roomId) return;
    socket.emit('host_start_game', { roomId }, (response) => {
      if (response?.error) {
        setError(response.error);
      }
    });
  }, [socket, roomId]);

  // 快速匹配（无自定义房间号）
  const handleQuickMatch = useCallback(() => {
    handleCreateRoom();
  }, [handleCreateRoom]);

  // 返回大厅
  const handleLeaveRoom = useCallback(() => {
    if (socket) socket.emit('leave_room');
    window.location.href = '/lobby';
  }, [socket]);

  // 返回房间（游戏结束后重新加入）
  const handleReturnToRoom = useCallback(() => {
    if (!socket || !roomId) return;
    socket.emit('return_to_room', { roomId }, (response) => {
      if (response.error) {
        alert(response.error);
        window.location.href = '/lobby';
        return;
      }
      // 成功返回房间，重置状态
      setResult(null);
      setPhase('waiting');
      setGameState(null);
    });
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
  const hasLeftRef = useRef(false);

  useEffect(() => {
    if (!socket || !roomId) return;
    hasLeftRef.current = false;

    const leaveRoom = () => {
      if (hasLeftRef.current) return;
      hasLeftRef.current = true;
      try {
        socket.emit('leave_room');
        // sendBeacon 兜底（页面卸载时 socket 可能已断）
        if (navigator.sendBeacon) {
          const userId = JSON.parse(localStorage.getItem('user'))?.id;
          navigator.sendBeacon('/api/leave-room', JSON.stringify({ roomId, userId }));
        }
      } catch {}
    };

    // 1. 浏览器关闭/刷新
    const handleBeforeUnload = () => leaveRoom();

    // 2. 手机返回键 / 浏览器后退
    const handlePopState = () => leaveRoom();

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    return () => {
      leaveRoom();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [socket, roomId]);

  // ===== 各阶段渲染 =====

  if (error) {
    return (
      <div className="game-host">
        <div className="error-box">
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>⚠️</span>
          <h2>{error}</h2>
          <div className="error-box-actions">
            <button className="back-btn" onClick={() => { setError(null); setPhase('choosing'); }}>重试</button>
            <button className="back-btn" onClick={handleLeaveRoom}>返回大厅</button>
          </div>
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
                placeholder="输入房间号加入，或留空创建新房间"
                maxLength={6}
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
              <button
                className="choosing-btn create-code"
                onClick={() => {
                  const input = document.getElementById('room-code-input');
                  const val = input?.value?.trim();
                  // 留空则生成随机房间号，有值则用自定义房间号
                  if (!val) {
                    const randomCode = String(Math.floor(100000 + Math.random() * 900000));
                    handleCreateRoom(randomCode);
                  } else {
                    handleCreateRoom(val);
                  }
                }}
              >
                🏠 创建房间
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
    const isHost = hostId === playerId;
    return (
      <div className="game-host">
        <div className="waiting-box">
          <h2 className="waiting-title">🎮 {gameName || '等待玩家加入'}</h2>
          <div className="waiting-room-id">房间号: {roomCode || roomId}</div>

          <div className="waiting-players">
            {players.map((p) => (
              <div key={p.id} className={`waiting-player${p.ready ? ' ready' : ''}`}>
                <span className="waiting-player-name">
                  {p.id === playerId ? `${p.nickname}（你）` : p.nickname}
                  {p.isBot ? ' 🤖' : ''}
                </span>
                <span className={`waiting-player-status${p.ready ? ' ready' : ''}`}>
                  {p.ready ? '✅ 已准备' : '⏳ 等待中'}
                </span>
                {isHost && p.id !== playerId && (
                  <button
                    className="kick-btn"
                    onClick={() => handleKickPlayer(p.id)}
                    title={p.isBot ? '移除机器人' : '踢出玩家'}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {!isVariablePlayers && Array.from({ length: Math.max(0, effectiveMaxPlayers - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="waiting-empty-slot">
                等待玩家加入...
              </div>
            ))}
          </div>

          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '16px' }}>
            {isVariablePlayers
              ? `至少需要 ${effectiveMinPlayers} 人，当前 ${players.length} 人`
              : `需要 ${effectiveMaxPlayers} 位玩家才能开始`}
          </p>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            {!isReady && (
              <button className="waiting-ready-btn" onClick={handleReady} style={{ flex: 1 }}>
                准备
              </button>
            )}
            {allowBots !== false && (
              <button className="waiting-bot-btn" onClick={handleAddBots}>
                🤖 填充机器人
              </button>
            )}
            {isHost && isVariablePlayers && players.length >= effectiveMinPlayers && players.every(p => p.ready) && (
              <button className="waiting-start-btn" onClick={handleStartGame}>
                🎮 开始游戏
              </button>
            )}
          </div>

          {isReady && (
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
            {(() => {
              const isWin = result?.winners?.includes(playerId) || String(result?.winner) === String(playerId);
              const isDraw = result?.draw || (!isWin && !result?.winners?.length && !result?.winner);
              if (isDraw) return '🤝';
              if (isWin) {
                return ['🎉', '🏆', '🥳'][Math.floor(Math.random() * 3)];
              }
              return ['😢', '😭', '🥺'][Math.floor(Math.random() * 3)];
            })()}
          </span>
          <h2>{(() => {
            // 象棋等游戏：区分绝杀/超时结果
            if (gameId === 'chess' && result?.reason) {
              const isWin = result?.winners?.includes(playerId) || String(result?.winner) === String(playerId);
              if (result.reason === 'checkmate') {
                return isWin ? '🏆 绝杀！你赢了！' : '😭 被绝杀，你输了';
              }
              if (result.reason === 'timeout') {
                return isWin ? '⏰ 对方超时，你赢了！' : '⏰ 超时判负';
              }
            }
            return result?.message || '游戏结束';
          })()}</h2>
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
          <div className="error-box-actions">
            <button className="back-btn" onClick={() => (window.location.href = '/lobby')}>
              返回大厅
            </button>
            <button className="back-btn" onClick={handleReturnToRoom}>
              返回房间
            </button>
          </div>
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
      onReturnToRoom={handleReturnToRoom}
    />
  );
}
