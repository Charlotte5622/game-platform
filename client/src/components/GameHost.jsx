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
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState('matching'); // matching | waiting | playing | finished
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const playerId = useMemo(getPlayerId, []);

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

    s.on('game_over', (data) => {
      setResult(data);
      setPhase('finished');
    });

    // 快速匹配
    s.emit('quick_match', { gameId }, (response) => {
      if (response.error) {
        setError(response.error);
        return;
      }
      setRoomId(response.roomId);
      setPlayers(response.players);
      setPhase('waiting');
    });

    return () => {
      s.off('room_update');
      s.off('game_start');
      s.off('state_update');
      s.off('game_restart');
      s.off('game_over');
    };
  }, [gameId]);

  const handleReady = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: true });
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
          <div className="waiting-room-id">房间号: {roomId}</div>

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
            {Array.from({ length: Math.max(0, 3 - players.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="waiting-empty-slot">
                等待玩家加入...
              </div>
            ))}
          </div>

          <p style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '16px' }}>
            需要 3 位玩家才能开始
          </p>

          {!isReady ? (
            <button className="waiting-ready-btn" onClick={handleReady}>
              准备
            </button>
          ) : (
            <p style={{ color: 'var(--success)', fontWeight: '600' }}>
              ✅ 你已准备，等待其他玩家...
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="game-host">
        <div className="result-box">
          <span style={{ fontSize: '64px', display: 'block', marginBottom: '12px' }}>
            {result?.winners?.includes(playerId) ? '🎉' : '😢'}
          </span>
          <h2>{result?.message || '游戏结束'}</h2>
          {result?.scores && (
            <div style={{ margin: '20px 0', display: 'flex', gap: '20px', justifyContent: 'center' }}>
              {Object.entries(result.scores).map(([pid, score]) => {
                // pid 来自 Object.entries 一定是字符串，player.id 可能是数字或字符串
                const p = players.find((pl) => String(pl.id) === String(pid));
                return (
                  <div key={pid} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      {p?.nickname || pid}
                    </div>
                    <div
                      style={{
                        fontSize: '20px',
                        fontWeight: '700',
                        color:
                          score > 0
                            ? 'var(--success)'
                            : score < 0
                              ? 'var(--danger)'
                              : 'var(--text-muted)',
                      }}
                    >
                      {score > 0 ? '+' : ''}
                      {score}
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
