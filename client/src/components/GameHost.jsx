import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';

/**
 * GameHost - 游戏容器组件
 *
 * 管理 Socket.IO 连接、房间状态、游戏生命周期
 * 通过 props 将状态和回调传递给具体的游戏组件
 */
export default function GameHost({ gameId, GameComponent }) {
  const [socket, setSocket] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState(null);
  const [phase, setPhase] = useState('matching'); // matching | waiting | playing | finished
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const playerId = JSON.parse(localStorage.getItem('user'))?.id;

  // 初始化 Socket 连接
  useEffect(() => {
    const s = getSocket();
    if (!s) {
      setError('未登录，请先登录');
      return;
    }
    setSocket(s);

    // 监听房间更新
    s.on('room_update', (data) => {
      setRoomId(data.roomId);
      setPlayers(data.players);
      if (data.state === 'waiting') {
        setPhase('waiting');
      }
    });

    // 监听游戏开始
    s.on('game_start', (data) => {
      setGameState(data.state);
      setPhase('playing');
    });

    // 监听状态更新
    s.on('state_update', (data) => {
      setGameState(data.state);
    });

    // 监听游戏结束
    s.on('game_over', (data) => {
      setResult(data);
      setPhase('finished');
    });

    // 监听错误
    s.on('error', (data) => {
      setError(data.message);
    });

    // 快速匹配
    s.emit('quick_match', { gameId }, (response) => {
      if (response.error) {
        setError(response.error);
        return;
      }
      setRoomId(response.roomId);
      setPlayers(response.players);
      setPhase(response.isNew ? 'waiting' : 'waiting');
    });

    return () => {
      s.off('room_update');
      s.off('game_start');
      s.off('state_update');
      s.off('game_over');
      s.off('error');
    };
  }, [gameId]);

  // 玩家准备
  const handleReady = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: true });
    }
  }, [socket, roomId]);

  // 发送游戏操作
  const handleAction = useCallback(
    (action) => {
      if (socket && roomId) {
        socket.emit('game_action', { roomId, action });
      }
    },
    [socket, roomId]
  );

  // 错误状态
  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorBox}>
          <h2>⚠️ {error}</h2>
          <button style={styles.backBtn} onClick={() => window.history.back()}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  // 匹配中
  if (phase === 'matching') {
    return (
      <div style={styles.container}>
        <div style={styles.loadingBox}>
          <div style={styles.spinner}>⏳</div>
          <h2>正在匹配房间...</h2>
        </div>
      </div>
    );
  }

  // 等待玩家
  if (phase === 'waiting') {
    const isReady = players.find((p) => p.id === playerId)?.ready;
    return (
      <div style={styles.container}>
        <div style={styles.waitingBox}>
          <h2>🎮 等待玩家加入</h2>
          <p style={styles.roomId}>房间号: {roomId}</p>
          <div style={styles.playerList}>
            {players.map((p, i) => (
              <div
                key={p.id}
                style={{
                  ...styles.playerItem,
                  borderColor: p.ready ? 'var(--success)' : 'var(--border)',
                }}
              >
                <span>{p.nickname}</span>
                <span>{p.ready ? '✅ 已准备' : '⏳ 等待中'}</span>
              </div>
            ))}
            {players.length < 3 && (
              <div style={styles.emptySlot}>等待更多玩家...</div>
            )}
          </div>
          {!isReady && (
            <button style={styles.readyBtn} onClick={handleReady}>
              准备
            </button>
          )}
        </div>
      </div>
    );
  }

  // 游戏结束
  if (phase === 'finished') {
    return (
      <div style={styles.container}>
        <div style={styles.resultBox}>
          <h2>{result?.message || '游戏结束'}</h2>
          <button style={styles.backBtn} onClick={() => window.location.href = '/lobby'}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  // 游戏进行中 - 渲染游戏组件
  return (
    <div style={styles.container}>
      <GameComponent
        socket={socket}
        roomId={roomId}
        playerId={playerId}
        gameState={gameState}
        onAction={handleAction}
        players={players}
      />
    </div>
  );
}

const styles = {
  container: {
    minHeight: 'calc(100vh - 64px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
  },
  loadingBox: {
    textAlign: 'center',
  },
  spinner: {
    fontSize: '48px',
    animation: 'spin 1s linear infinite',
  },
  waitingBox: {
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
  },
  roomId: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    marginTop: '8px',
  },
  playerList: {
    margin: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  playerItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  emptySlot: {
    padding: '12px 16px',
    background: 'var(--bg-card)',
    border: '2px dashed var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--text-muted)',
    textAlign: 'center',
  },
  readyBtn: {
    padding: '14px 40px',
    background: 'var(--success)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '16px',
    fontWeight: '700',
  },
  errorBox: {
    textAlign: 'center',
  },
  resultBox: {
    textAlign: 'center',
  },
  backBtn: {
    marginTop: '16px',
    padding: '12px 32px',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    fontWeight: '600',
  },
};
