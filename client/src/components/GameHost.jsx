import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../services/socket';
import { playSound, startGameBgm, stopGameBgm } from '../services/sounds';
import { soundRoomJoin, soundPlayerJoin, soundPlayerLeave, soundMatching, soundGameStart, soundAllReady, soundKicked, soundClick } from '../services/sounds';
import EmotePanel from './EmotePanel';
import { RiLogoutBoxLine, RiArrowGoBackLine, RiRobotLine } from '@remixicon/react';

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

const ROOM_CODE_PATTERN = /^[A-Z0-9]{3,6}$/;

function normalizeRoomCode(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
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
  const [notice, setNotice] = useState(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [result, setResult] = useState(null);
  const resultEmojiRef = useRef(null);
  const defeatEmojiRef = useRef(null);
  const noticeTimerRef = useRef(null);
  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);
  const [maxPlayers, setMaxPlayers] = useState(null); // 从API获取
  const [hostId, setHostId] = useState(null);
  const [allowBots, setAllowBots] = useState(true); // 默认允许，从API获取
  const [gameName, setGameName] = useState(''); // 游戏名称
  const [minPlayers, setMinPlayers] = useState(null);
  const prevPlayersLenRef = useRef(0);
  const allReadyRef = useRef(false);
  const effectiveMaxPlayers = maxPlayers || 2; // 兜底2人
  const effectiveMinPlayers = minPlayers || 2;
  const isVariablePlayers = effectiveMinPlayers !== effectiveMaxPlayers;

  const playerId = useMemo(getPlayerId, []);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const hasPushedRef = useRef(false);

  const showNotice = useCallback((message, type = 'error') => {
    if (!message) return;
    if (noticeTimerRef.current) {
      clearTimeout(noticeTimerRef.current);
    }
    setNotice({ message, type });
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, type === 'success' ? 2200 : 3400);
  }, []);

  useEffect(() => () => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
  }, []);

  useEffect(() => () => {
    stopGameBgm({ fade: false });
  }, []);

  useEffect(() => {
    if (phase === 'playing') {
      startGameBgm(gameId);
    } else {
      stopGameBgm();
    }
  }, [gameId, phase]);

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
      .catch(() => showNotice('游戏配置加载失败，已按默认人数继续', 'warning'));
  }, [gameId, showNotice]);

  // 初始化 Socket 连接 + 注册事件（只做一次）
  useEffect(() => {
    const s = getSocket();
    if (!s) {
      setError('未登录，请先登录');
      return;
    }
    setSocket(s);

    // ===== 自动重连：检查 localStorage 中是否有未完成的房间 =====
    const savedRoomId = localStorage.getItem('activeRoomId');
    const savedGameId = localStorage.getItem('activeGameId');
    if (savedRoomId && savedGameId === gameId) {
      console.log(`🔄 检测到未完成房间 ${savedRoomId}，尝试自动重连...`);
      // 使用 quick_match 触发服务器端的重连逻辑
      s.emit('quick_match', { gameId }, (response) => {
        if (response.error) {
          console.log('🔄 自动重连失败，清除缓存:', response.error);
          localStorage.removeItem('activeRoomId');
          localStorage.removeItem('activeGameId');
          return;
        }
        console.log('🔄 自动重连成功');
        setRoomId(response.roomId);
        setRoomCode(response.roomCode);
        setPlayers(response.players);
        if (response.hostId) setHostId(response.hostId);
        setPhase('waiting');
        soundRoomJoin();
      });
    }

    // ===== 房间事件 =====
    s.on('room_update', (data) => {
      setRoomId(data.roomId);
      setRoomCode(data.roomCode);
      setPlayers(data.players);
      if (data.hostId) setHostId(data.hostId);
      if (data.state === 'waiting') setPhase('waiting');
      // 保存 roomId 用于后台切换后恢复
      localStorage.setItem('activeRoomId', data.roomId);
      localStorage.setItem('activeGameId', gameId);
      // 播放玩家加入/离开音效
      const prevLen = prevPlayersLenRef.current;
      const newLen = data.players?.length || 0;
      if (newLen > prevLen && prevLen > 0) {
        soundPlayerJoin();
      } else if (newLen < prevLen) {
        soundPlayerLeave();
      }
      prevPlayersLenRef.current = newLen;
      // 检查全员就绪
      const allReady = data.players && data.players.length > 0 && data.players.every(p => p.ready);
      if (allReady && !allReadyRef.current) {
        soundAllReady();
      }
      allReadyRef.current = allReady;
    });

    // ===== 游戏生命周期 =====
    s.on('game_start', (data) => {
      soundGameStart();
      setGameState(data.state);
      setPhase('playing');
      // 确保 roomId 保存（重连场景）
      if (data.roomId) {
        localStorage.setItem('activeRoomId', data.roomId);
        localStorage.setItem('activeGameId', gameId);
      }
    });

    s.on('state_update', (data) => {
      // state_update
      setGameState(data.state);
    });

    s.on('game_restart', (data) => {
      setGameState(data.state);
      setPhase('playing');
      setResult(null);
    });

    s.on('game_over', (data) => {
      setResult(data);
      setPhase('finished');
      const won = data?.winners?.includes(playerId) || String(data?.winner) === String(playerId);
      playSound(gameId, won ? 'win' : 'lose');
      // 游戏结束，清除房间缓存
      localStorage.removeItem('activeRoomId');
      localStorage.removeItem('activeGameId');
    });

    s.on('kicked', (data) => {
      soundKicked();
      setError(data?.message || '你被踢出了房间');
      localStorage.removeItem('activeRoomId');
      localStorage.removeItem('activeGameId');
      setTimeout(() => navigateRef.current('/lobby'), 1400);
    });

    return () => {
      s.off('room_update');
      s.off('game_start');
      s.off('state_update');
      s.off('game_restart');
      s.off('game_over');
      s.off('kicked');
    };
  }, [gameId, playerId]);

  // 快速匹配
  const handleCreateRoom = useCallback((customCode) => {
    if (!socket) return;
    setError(null);
    setNotice(null);
    setPhase('matching');
    soundMatching();
    // 如果提供了自定义房间号，使用 create_room 事件
    if (customCode) {
      const normalizedCode = normalizeRoomCode(customCode);
      if (!ROOM_CODE_PATTERN.test(normalizedCode)) {
        showNotice('请输入 3-6 位数字或字母房间号');
        setPhase('choosing');
        return;
      }
      setActionBusy(true);
      socket.emit('create_room', { gameId, roomCode: normalizedCode }, (response) => {
        setActionBusy(false);
        if (response.error) {
          showNotice(response.error);
          setPhase('choosing');
          return;
        }
        setRoomId(response.roomId);
        setRoomCode(response.roomCode);
        setPlayers(response.players);
        if (response.hostId) setHostId(response.hostId);
        setRoomCodeInput('');
        setPhase('waiting');
        soundRoomJoin();
      });
    } else {
      // 快速匹配（自动创建或加入房间）
      setActionBusy(true);
      socket.emit('quick_match', { gameId }, (response) => {
        setActionBusy(false);
        if (response.error) {
          showNotice(response.error);
          setPhase('choosing');
          return;
        }
        setRoomId(response.roomId);
        setRoomCode(response.roomCode);
        setPlayers(response.players);
        if (response.hostId) setHostId(response.hostId);
        setRoomCodeInput('');
        setPhase('waiting');
        soundRoomJoin();
      });
    }
  }, [socket, gameId, showNotice]);

  // 通过房间号加入
  const handleJoinByCode = useCallback((code) => {
    if (!socket) return;
    const normalizedCode = normalizeRoomCode(code);
    if (!ROOM_CODE_PATTERN.test(normalizedCode)) {
      showNotice('请输入 3-6 位数字或字母房间号');
      return;
    }
    setNotice(null);
    setActionBusy(true);
    socket.emit('join_by_code', { code: normalizedCode, gameId }, (response) => {
      setActionBusy(false);
      if (response.error) {
        showNotice(response.error);
        return;
      }
      setRoomId(response.roomId);
      setRoomCode(response.roomCode);
      setPlayers(response.players);
      if (response.hostId) setHostId(response.hostId);
      setRoomCodeInput('');
      setPhase('waiting');
      soundRoomJoin();
    });
  }, [socket, gameId, showNotice]);

  const handleReady = useCallback(() => {
    soundClick();
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: true });
    }
  }, [socket, roomId]);

  const handleAddBots = useCallback(() => {
    soundClick();
    if (!socket || !roomId) return;
    socket.emit('add_bots', { roomId }, (response) => {
      if (response?.error) {
        showNotice(response.error);
        return;
      }
      if (response?.botsAdded === 0) {
        showNotice('房间人数已满，不能再添加机器人', 'warning');
        return;
      }
      showNotice('已添加一名机器人', 'success');
      // botsAdded > 0: 机器人已添加，等待玩家准备
    });
  }, [socket, roomId, showNotice]);

  const handleUnready = useCallback(() => {
    if (socket && roomId) {
      socket.emit('player_ready', { roomId, ready: false });
    }
  }, [socket, roomId]);

  // 踢出玩家（仅房主）
  const handleKickPlayer = useCallback((targetId) => {
    soundClick();
    if (!socket || !roomId) return;
    socket.emit('kick_player', { roomId, targetId }, (response) => {
      if (response?.error) {
        showNotice(response.error);
      } else {
        showNotice('已移出该玩家', 'success');
      }
    });
  }, [socket, roomId, showNotice]);

  // 房主直接开始游戏（可变人数游戏）
  const handleStartGame = useCallback(() => {
    soundClick();
    if (!socket || !roomId) return;
    socket.emit('host_start_game', { roomId }, (response) => {
      if (response?.error) {
        showNotice(response.error);
      }
    });
  }, [socket, roomId, showNotice]);

  // 快速匹配（无自定义房间号）
  const handleQuickMatch = useCallback(() => {
    handleCreateRoom();
  }, [handleCreateRoom]);

  // 返回大厅
  const handleLeaveRoom = useCallback(() => {
    let navigated = false;
    const doNavigate = () => {
      if (navigated) return;
      navigated = true;
      localStorage.removeItem('activeRoomId');
      localStorage.removeItem('activeGameId');
      hasPushedRef.current = false;
      navigateRef.current('/lobby');
    };
    if (socket && socket.connected) {
      socket.emit('leave_room');
    }
    doNavigate(); // 立即导航，不等服务端
  }, [socket]);

  // 确认离开房间（弹出自定义弹窗）
  const confirmLeave = useCallback(() => {
    soundClick();
    setLeaveConfirm(true);
  }, []);

  const handleConfirmLeave = useCallback(() => {
    setLeaveConfirm(false);
    hasLeftRef.current = true;
    handleLeaveRoom();
  }, [handleLeaveRoom]);

  const handleCancelLeave = useCallback(() => {
    setLeaveConfirm(false);
  }, []);

  // 返回房间（游戏结束后重新加入）
  const handleReturnToRoom = useCallback(() => {
    if (!socket || !roomId) return;
    socket.emit('return_to_room', { roomId }, (response) => {
      if (response.error) {
        showNotice(response.error);
        setTimeout(() => navigateRef.current('/lobby'), 1200);
        return;
      }
      // 成功返回房间，重置状态
      setResult(null);
      setPhase('waiting');
      setGameState(null);
      showNotice('已回到房间，重新准备后开始下一局', 'success');
    });
  }, [socket, roomId, showNotice]);

  const handleAction = useCallback(
    (action) => {
      if (socket && roomId) {
        socket.emit('game_action', { roomId, action });
      } else {
        showNotice('连接未就绪，请稍后再试');
      }
    },
    [socket, roomId, showNotice]
  );

  // ===== 页面离开检测（手机返回 / 关闭标签页 / 刷新） =====
  const hasLeftRef = useRef(false);

  useEffect(() => {
    if (!socket || !roomId) return;
    hasLeftRef.current = false;

    // 注意：不在 beforeunload 中 emit leave_room
    // 让 socket 断开自然触发服务器的 disconnect 宽限期机制
    // 这样手机切后台再回来时，房间不会被立即销毁

    // 手机返回键 / 浏览器后退：确实要离开
    // 进入房间时推入一个历史记录条目，用于检测手机返回手势
    if (!hasPushedRef.current) {
      window.history.pushState(null, '', window.location.href);
      hasPushedRef.current = true;
    }

    const handlePopState = () => {
      if (hasLeftRef.current) return;
      // 再次 pushState 阻止浏览器后退
      window.history.pushState(null, '', window.location.href);
      setLeaveConfirm(true);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [socket, roomId]);

  // ===== 各阶段渲染 =====
  const noticeNode = notice && (
    <div className={`game-notice ${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
      {notice.message}
    </div>
  );

  if (error) {
    return (
      <div className="game-host">
        <div className="error-box">
          <span style={{ fontSize: '48px', display: 'block', marginBottom: '16px' }}>⚠️</span>
          <h2>{error}</h2>
          <div className="error-box-actions">
            <button className="back-btn" onClick={() => { setError(null); setPhase('choosing'); }}>重试</button>
            <button className="back-btn" onClick={handleLeaveRoom}><RiLogoutBoxLine size={16} style={{verticalAlign:'middle',marginRight:4}} />返回大厅</button>
          </div>
        </div>
      </div>
    );
  }

  // 选择入口：快速匹配 or 输入房间号
  if (phase === 'choosing') {
    return (
      <div className="game-host">
        {noticeNode}
        <div className="choosing-box">
          <h2>选择加入方式</h2>
          <div className="choosing-actions">
            <button className="choosing-btn quick-match" onClick={handleQuickMatch} disabled={actionBusy}>
              ⚡ 快速匹配
            </button>
            <div className="choosing-divider">或</div>
            <div className="choosing-code-input">
              <input
                type="text"
                placeholder="输入 3-6 位数字或字母"
                maxLength={6}
                pattern="[A-Za-z0-9]{3,6}"
                inputMode="text"
                autoComplete="off"
                aria-label="房间号"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleJoinByCode(roomCodeInput);
                }}
              />
              <button
                className="choosing-btn join-code"
                disabled={actionBusy || roomCodeInput.length < 3}
                onClick={() => handleJoinByCode(roomCodeInput)}
              >
                🚪 加入房间
              </button>
              <button
                className="choosing-btn create-code"
                disabled={actionBusy || roomCodeInput.length < 3}
                onClick={() => {
                  const val = roomCodeInput.trim();
                  if (!val) {
                    showNotice('请输入房间号再创建');
                    return;
                  }
                  handleCreateRoom(val);
                }}
              >
                🏠 创建房间
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'matching') {
    return (
      <div className="game-host">
        {noticeNode}
        <div className="matching-box">
          <div className="matching-spinner">⏳</div>
          <h2 className="matching-text">正在匹配房间...</h2>
          <p className="matching-hint">正在寻找可用的游戏房间</p>
          <button className="matching-cancel-btn" onClick={handleLeaveRoom} style={{ marginTop: '16px', padding: '8px 24px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', cursor: 'pointer' }}>
            取消匹配
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'waiting') {
    const isReady = players.find((p) => p.id === playerId)?.ready;
    const isHost = hostId === playerId;
    const isRoomFull = players.length >= effectiveMaxPlayers;
    const everyoneReady = players.length > 0 && players.every(p => p.ready);
    return (
      <div className="game-host">
        {noticeNode}
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
          {everyoneReady && (
            <p className="waiting-start-hint">
              {isHost ? '所有玩家已准备，可以开始游戏。' : '所有玩家已准备，等待房主开始游戏。'}
            </p>
          )}

          <div className="waiting-actions">
            {!isReady && (
              <button className="waiting-ready-btn" onClick={handleReady}>
                准备
              </button>
            )}
            {allowBots !== false && (
              <button className="waiting-bot-btn" onClick={handleAddBots} disabled={isRoomFull}>
                {isRoomFull ? '人数已满' : <><RiRobotLine size={16} style={{verticalAlign:'middle',marginRight:4}} />填充机器人</>}
              </button>
            )}
            {isHost && players.length >= effectiveMinPlayers && everyoneReady && (
              <button className="waiting-start-btn" onClick={handleStartGame}>
                🎮 开始游戏
              </button>
            )}
            <button className="waiting-leave-btn" onClick={confirmLeave}>
              <RiLogoutBoxLine size={16} style={{verticalAlign:'middle',marginRight:4}} />离开房间
            </button>
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

        {leaveConfirm && (
          <div className="modal-overlay" onClick={handleCancelLeave}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
              <div className="modal-title">确认离开</div>
              <div className="modal-message">
                {playersRef.current.length <= 1
                  ? '当前仅你一人，离开后将关闭。'
                  : '确认离开房间？'}
              </div>
              <div className="modal-actions">
                <button className="modal-btn modal-btn-cancel" onClick={handleCancelLeave}>取消</button>
                <button className="modal-btn modal-btn-confirm" onClick={handleConfirmLeave}>离开</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="game-host">
        {noticeNode}
        <div className="result-box">
          <span style={{ fontSize: '72px', display: 'block', marginBottom: '16px' }}>
            {(() => {
              const isWin = result?.winners?.includes(playerId) || String(result?.winner) === String(playerId);
              const isDraw = result?.draw || (!isWin && !result?.winners?.length && !result?.winner);
              if (isDraw) return '🤝';
              if (isWin) {
                if (!resultEmojiRef.current) resultEmojiRef.current = ['🎉', '🏆', '🥳'][Math.floor(Math.random() * 3)];
                return resultEmojiRef.current;
              }
              if (!defeatEmojiRef.current) defeatEmojiRef.current = ['😢', '😭', '🥺'][Math.floor(Math.random() * 3)];
              return defeatEmojiRef.current;
            })()}
          </span>
          <h2>{(() => {
            // 象棋等游戏：区分绝杀/超时结果
            if (gameId === 'chinese-chess' && result?.reason) {
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
            <button className="back-btn" onClick={handleLeaveRoom}>
              <RiLogoutBoxLine size={16} style={{verticalAlign:'middle',marginRight:4}} />返回大厅
            </button>
            <button className="back-btn" onClick={handleReturnToRoom}>
              <RiArrowGoBackLine size={16} style={{verticalAlign:'middle',marginRight:4}} />返回房间
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 游戏进行中
  return (
    <>
      {noticeNode}
      <GameComponent
        socket={socket}
        roomId={roomId}
        playerId={playerId}
        gameState={gameState}
        onAction={handleAction}
        players={players}
        onLeaveRoom={confirmLeave}
        onReturnToRoom={handleReturnToRoom}
      />
      <EmotePanel
        socket={socket}
        roomId={roomId}
        playerId={playerId}
        players={players}
        gameId={gameId}
      />
      {leaveConfirm && (
        <div className="modal-overlay" onClick={handleCancelLeave}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-title">确认离开</div>
            <div className="modal-message">
              {playersRef.current.length <= 1
                ? '当前仅你一人，离开后将关闭。'
                : '确认离开房间？'}
            </div>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={handleCancelLeave}>取消</button>
              <button className="modal-btn modal-btn-confirm" onClick={handleConfirmLeave}>离开</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
