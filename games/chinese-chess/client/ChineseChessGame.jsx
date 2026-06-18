import { useState, useEffect, useCallback } from 'react';

// 猜拳图标
const RPS_ICONS = { rock: '✊', scissors: '✌️', paper: '🖐' };
const RPS_NAMES = { rock: '石头', scissors: '剪刀', paper: '布' };

/**
 * 中国象棋棋盘 — 纯 SVG 实现，精确对齐十字线交叉点
 *
 * 坐标系: col 0-8 (9列), row 0-9 (10行)
 * viewBox: "-50 -50 900 1000" (四周留 50px 给边缘棋子)
 * 格子间距: 100 单位
 */
function ChessBoard({ pieces, flipped, selected, onCellClick }) {
  const CELL = 100; // 格子间距
  const PAD = 50;   // 边缘留白
  const W = 8 * CELL; // 棋盘宽 800
  const H = 9 * CELL; // 棋盘高 900

  // 棋子 SVG 坐标
  const getPos = (col, row) => ({
    x: (flipped ? 8 - col : col) * CELL,
    y: (flipped ? 9 - row : row) * CELL,
  });

  // 棋子颜色
  const PIECE_COLORS = {
    red:   { bg: '#fef2f2', border: '#dc2626', text: '#dc2626' },
    black: { bg: '#f8fafc', border: '#1e293b', text: '#1e293b' },
  };

  // 坐标标注
  // 黑方视角（翻转）: 列号从左到右是 9 8 7 6 5 4 3 2 1
  // 红方视角（不翻转）: 列号从左到右是 1 2 3 4 5 6 7 8 9
  const colLabels = flipped
    ? ['9', '8', '7', '6', '5', '4', '3', '2', '1']
    : ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  // 行号: 红方视角从下到上是 0-9，黑方视角从下到上是 9-0
  const rowLabels = flipped
    ? ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
    : ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0'];

  return (
    <div className="chess-board-outer">
      <svg
        className="chess-board-svg"
        viewBox={`${-PAD - 20} ${-PAD} ${W + PAD * 2 + 40} ${H + PAD * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 背景 */}
        <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={H + PAD * 2} fill="#f5e6c8" rx="8" />

        {/* 横线 (10条) */}
        {Array.from({ length: 10 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * CELL} x2={W} y2={i * CELL} stroke="#5c4a32" strokeWidth="2.5" />
        ))}

        {/* 竖线 — 上半场 (row 0-4, 即 y 0-400) */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`vu${i}`} x1={i * CELL} y1="0" x2={i * CELL} y2={4 * CELL} stroke="#5c4a32" strokeWidth="2.5" />
        ))}
        {/* 竖线 — 下半场 (row 5-9, 即 y 500-900) */}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`vl${i}`} x1={i * CELL} y1={5 * CELL} x2={i * CELL} y2={H} stroke="#5c4a32" strokeWidth="2.5" />
        ))}

        {/* 边框 */}
        <rect x="0" y="0" width={W} height={H} fill="none" stroke="#5c4a32" strokeWidth="3.5" />

        {/* 九宫格斜线 — 上方 */}
        <line x1={3 * CELL} y1="0" x2={5 * CELL} y2={2 * CELL} stroke="#5c4a32" strokeWidth="2" />
        <line x1={5 * CELL} y1="0" x2={3 * CELL} y2={2 * CELL} stroke="#5c4a32" strokeWidth="2" />
        {/* 九宫格斜线 — 下方 */}
        <line x1={3 * CELL} y1={7 * CELL} x2={5 * CELL} y2={9 * CELL} stroke="#5c4a32" strokeWidth="2" />
        <line x1={5 * CELL} y1={7 * CELL} x2={3 * CELL} y2={9 * CELL} stroke="#5c4a32" strokeWidth="2" />

        {/* 楚河汉界 */}
        <text x={1.5 * CELL} y={4.55 * CELL} fontSize="42" fontWeight="800" fill="#8b7355" opacity="0.45" fontFamily="serif" textAnchor="middle">楚 河</text>
        <text x={6.5 * CELL} y={4.55 * CELL} fontSize="42" fontWeight="800" fill="#8b7355" opacity="0.45" fontFamily="serif" textAnchor="middle">汉 界</text>

        {/* 星位标记 (炮位 + 兵位) */}
        {[
          [1, 2], [7, 2], [1, 7], [7, 7], // 炮
          [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], // 黑兵
          [0, 6], [2, 6], [4, 6], [6, 6], [8, 6], // 红兵
        ].map(([c, r]) => {
          const cx = c * CELL;
          const cy = r * CELL;
          const s = 12; // 标记长度
          const g = 4;  // 标记间距
          return (
            <g key={`star-${c}-${r}`}>
              {c > 0 && <line x1={cx - s - g} y1={cy - s} x2={cx - g} y2={cy - s} stroke="#5c4a32" strokeWidth="1.8" />}
              {c > 0 && <line x1={cx - s - g} y1={cy - s} x2={cx - s - g} y2={cy - g} stroke="#5c4a32" strokeWidth="1.8" />}
              {c > 0 && <line x1={cx - s - g} y1={cy + s} x2={cx - g} y2={cy + s} stroke="#5c4a32" strokeWidth="1.8" />}
              {c > 0 && <line x1={cx - s - g} y1={cy + s} x2={cx - s - g} y2={cy + g} stroke="#5c4a32" strokeWidth="1.8" />}
              {c < 8 && <line x1={cx + g} y1={cy - s} x2={cx + s + g} y2={cy - s} stroke="#5c4a32" strokeWidth="1.8" />}
              {c < 8 && <line x1={cx + s + g} y1={cy - s} x2={cx + s + g} y2={cy - g} stroke="#5c4a32" strokeWidth="1.8" />}
              {c < 8 && <line x1={cx + g} y1={cy + s} x2={cx + s + g} y2={cy + s} stroke="#5c4a32" strokeWidth="1.8" />}
              {c < 8 && <line x1={cx + s + g} y1={cy + s} x2={cx + s + g} y2={cy + g} stroke="#5c4a32" strokeWidth="1.8" />}
            </g>
          );
        })}

        {/* 空白交叉点点击区域（透明圆，增大触摸范围） */}
        {Array.from({ length: 10 }, (_, row) =>
          Array.from({ length: 9 }, (_, col) => {
            const hasPiece = pieces?.some(p => p.col === col && p.row === row);
            if (hasPiece) return null;
            const { x, y } = getPos(col, row);
            return (
              <circle
                key={`c-${col}-${row}`}
                cx={x} cy={y} r={35}
                fill="transparent"
                cursor="pointer"
                onClick={() => onCellClick(col, row)}
              />
            );
          })
        )}

        {/* 棋子 */}
        {pieces?.map(piece => {
          const { x, y } = getPos(piece.col, piece.row);
          const colors = PIECE_COLORS[piece.color];
          const isSelected = selected?.col === piece.col && selected?.row === piece.row;
          const R = 38; // 棋子半径
          return (
            <g
              key={piece.id}
              cursor="pointer"
              onClick={() => onCellClick(piece.col, piece.row)}
            >
              {/* 阴影 */}
              <circle cx={x + 2} cy={y + 2} r={R} fill="rgba(0,0,0,0.15)" />
              {/* 棋子底色 */}
              <circle cx={x} cy={y} r={R} fill={colors.bg} stroke={colors.border} strokeWidth={isSelected ? 3.5 : 2.5} />
              {/* 选中光晕 */}
              {isSelected && (
                <circle cx={x} cy={y} r={R + 4} fill="none" stroke="#06b6d4" strokeWidth="2.5" opacity="0.8">
                  <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
              {/* 棋子文字 */}
              <text
                x={x} y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="28"
                fontWeight="800"
                fill={colors.text}
                fontFamily="serif"
                style={{ userSelect: 'none' }}
              >
                {piece.name}
              </text>
            </g>
          );
        })}

        {/* 列号标注（上方） */}
        {colLabels.map((label, i) => (
          <text
            key={`cl-${i}`}
            x={i * CELL}
            y={-PAD + 15}
            textAnchor="middle"
            fontSize="16"
            fill="#8b7355"
            fontFamily="sans-serif"
            fontWeight="600"
          >
            {label}
          </text>
        ))}

        {/* 行号标注（右侧） */}
        {rowLabels.map((label, i) => (
          <text
            key={`rl-${i}`}
            x={W + PAD - 10}
            y={i * CELL}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="14"
            fill="#8b7355"
            fontFamily="sans-serif"
            fontWeight="600"
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}

/**
 * 格式化毫秒为 mm:ss
 */
function formatTime(ms) {
  if (ms == null || ms <= 0) return '0:00';
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * 中国象棋主组件
 */
export default function ChineseChessGame({ socket, roomId, playerId, gameState, onAction, players }) {
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [myRpsChoice, setMyRpsChoice] = useState(null);
  const [turnDeadline, setTurnDeadline] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);
  const [drawRequestFrom, setDrawRequestFrom] = useState(null);
  const [drawRequestSent, setDrawRequestSent] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  // 计时器设置
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [totalMinutes, setTotalMinutes] = useState(15);
  const [stepSeconds, setStepSeconds] = useState(60);
  const [timerSettingsSent, setTimerSettingsSent] = useState(false);

  useEffect(() => {
    if (!socket) return;
    const handleError = (data) => { setError(data.message); setTimeout(() => setError(''), 2500); };
    const handleRpsRecorded = (data) => setMyRpsChoice(data.choice);
    const handleRpsDraw = () => setMyRpsChoice(null);
    const handleRpsResult = () => setMyRpsChoice(null);
    const handleTurnTimer = (data) => setTurnDeadline(data.deadline);
    const handleTurnTimeout = (data) => { setError(data.message); setTimeout(() => setError(''), 2500); };
    const handleDrawRequestReceived = (data) => setDrawRequestFrom(data.from);
    const handleDrawRequestSent = () => setDrawRequestSent(true);
    const handleDrawRejected = (data) => { setDrawRequestSent(false); setError(data.message); setTimeout(() => setError(''), 2500); };
    const handleOpponentDisconnected = (data) => { setOpponentDisconnected(true); setError(data.message); setTimeout(() => setError(''), 5000); };
    const handleOpponentReconnected = () => { setOpponentDisconnected(false); };
    const handleTimerSettingsUpdated = (data) => {
      if (data.settings) {
        setTimerEnabled(data.settings.enabled);
        setTotalMinutes(Math.round((data.settings.totalTime || 0) / 60000));
        setStepSeconds(Math.round((data.settings.stepTime || 0) / 1000));
        setTimerSettingsSent(true);
      }
    };
    socket.on('error', handleError);
    socket.on('rps_recorded', handleRpsRecorded);
    socket.on('rps_draw', handleRpsDraw);
    socket.on('rps_result', handleRpsResult);
    socket.on('turn_timer', handleTurnTimer);
    socket.on('turn_timeout', handleTurnTimeout);
    socket.on('draw_request_received', handleDrawRequestReceived);
    socket.on('draw_request_sent', handleDrawRequestSent);
    socket.on('draw_rejected', handleDrawRejected);
    socket.on('opponent_disconnected', handleOpponentDisconnected);
    socket.on('opponent_reconnected', handleOpponentReconnected);
    socket.on('timer_settings_updated', handleTimerSettingsUpdated);
    return () => {
      socket.off('error', handleError);
      socket.off('rps_recorded', handleRpsRecorded);
      socket.off('rps_draw', handleRpsDraw);
      socket.off('rps_result', handleRpsResult);
      socket.off('turn_timer', handleTurnTimer);
      socket.off('turn_timeout', handleTurnTimeout);
      socket.off('draw_request_received', handleDrawRequestReceived);
      socket.off('draw_request_sent', handleDrawRequestSent);
      socket.off('draw_rejected', handleDrawRejected);
      socket.off('opponent_disconnected', handleOpponentDisconnected);
      socket.off('opponent_reconnected', handleOpponentReconnected);
      socket.off('timer_settings_updated', handleTimerSettingsUpdated);
    };
  }, [socket]);

  useEffect(() => {
    if (!turnDeadline) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((turnDeadline - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [turnDeadline]);

  useEffect(() => { setMyRpsChoice(null); setSelected(null); }, [gameState?.phase]);
  useEffect(() => { setSelected(null); }, [gameState?.turnColor]);

  if (!gameState) {
    return (
      <div className="chess-loading">
        <div className="chess-loading-spinner">♟️</div>
        <p>等待游戏数据...</p>
      </div>
    );
  }

  const { phase, colorMap, pieces, turnColor, currentTurn, check, moveHistory, rpsChoices, rpsRound, winner } = gameState;

  // 防御：colorMap 可能尚未就绪（Object.keys 返回字符串，需要兼容比较）
  const myColor = colorMap
    ? (colorMap[playerId] ?? colorMap[String(playerId)] ?? colorMap[Number(playerId)])
    : undefined;
  const isMyTurn = phase === 'playing' && !!myColor && myColor === turnColor;
  const opponent = players.find(p => String(p.id) !== String(playerId));

  const emitAction = (action) => {
    if (socket && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  };

  const handleCellClick = (col, row) => {
    if (!isMyTurn) return;
    const clickedPiece = pieces?.find(p => p.col === col && p.row === row);
    if (selected) {
      if (clickedPiece && clickedPiece.color === myColor) {
        setSelected({ col, row });
        return;
      }
      emitAction({ type: 'move', from: selected, to: { col, row } });
      setSelected(null);
    } else {
      if (clickedPiece && clickedPiece.color === myColor) {
        setSelected({ col, row });
      }
    }
  };

  // playing 阶段但 colorMap 未就绪，显示加载
  if (phase === 'playing' && !myColor) {
    return (
      <div className="chess-loading">
        <div className="chess-loading-spinner">♟️</div>
        <p>正在同步游戏状态...</p>
      </div>
    );
  }

  // 猜拳阶段
  if (phase === 'rps') {
    const myChoice = myRpsChoice || rpsChoices?.[playerId]?.choice;
    const opponentReady = rpsChoices && Object.keys(rpsChoices).length >= 1 && !myChoice;

    const handleSendTimerSettings = () => {
      emitAction({
        type: 'set_timer',
        settings: {
          totalTime: timerEnabled ? totalMinutes * 60 * 1000 : 0,
          stepTime: timerEnabled ? stepSeconds * 1000 : 0,
        },
      });
    };

    return (
      <div className="chess">
        {/* 计时器设置 */}
        {!timerSettingsSent && (
          <div className="chess-timer-settings">
            <h3 className="chess-timer-settings-title">⏱️ 计时设置</h3>
            <label className="chess-timer-toggle">
              <input type="checkbox" checked={timerEnabled} onChange={(e) => setTimerEnabled(e.target.checked)} />
              <span>启用计时</span>
            </label>
            {timerEnabled && (
              <div className="chess-timer-inputs">
                <label>
                  总时间（分钟）
                  <input type="number" min="1" max="60" value={totalMinutes}
                    onChange={(e) => setTotalMinutes(Number(e.target.value) || 1)} />
                </label>
                <label>
                  每步时间（秒）
                  <input type="number" min="10" max="600" value={stepSeconds}
                    onChange={(e) => setStepSeconds(Number(e.target.value) || 10)} />
                </label>
              </div>
            )}
            <button className="chess-timer-confirm-btn" onClick={handleSendTimerSettings}>
              确认设置
            </button>
          </div>
        )}
        {timerSettingsSent && gameState?.timerSettings && (
          <div className="chess-timer-info">
            {gameState.timerSettings.enabled
              ? `⏱️ 总时间 ${Math.round(gameState.timerSettings.totalTime / 60000)} 分钟，每步 ${Math.round(gameState.timerSettings.stepTime / 1000)} 秒`
              : '⏱️ 不限时'}
          </div>
        )}

        <div className="chess-rps">
          <h2 className="chess-rps-title">✊✌️🖐 猜拳选色</h2>
          <p className="chess-rps-sub">胜者可选择执红或执黑</p>
          {rpsRound > 1 && <p className="chess-rps-round">第 {rpsRound} 轮</p>}
          <div className="chess-rps-buttons">
            {Object.entries(RPS_ICONS).map(([key, icon]) => (
              <button
                key={key}
                className={`chess-rps-btn${myChoice === key ? ' chess-rps-btn-active' : ''}`}
                onClick={() => { if (!myChoice) { setMyRpsChoice(key); emitAction({ type: 'rps', choice: key }); } }}
                disabled={!!myChoice}
              >
                <span className="chess-rps-icon">{icon}</span>
                <span className="chess-rps-name">{RPS_NAMES[key]}</span>
              </button>
            ))}
          </div>
          {myChoice && <p className="chess-rps-waiting">你出了 <strong>{RPS_NAMES[myChoice]}</strong>，等待对手...</p>}
          {opponentReady && <p className="chess-rps-waiting">对手已出拳，等你选择</p>}
        </div>
      </div>
    );
  }

  // 选色阶段
  if (phase === 'choosing') {
    const isWinner = String(winner) === String(playerId);
    return (
      <div className="chess">
        <div className="chess-choose">
          <h2 className="chess-choose-title">{isWinner ? '🎉 你赢了！请选择阵营' : '等待对手选色...'}</h2>
          {isWinner && (
            <div className="chess-choose-buttons">
              <button className="chess-choose-btn chess-choose-red" onClick={() => emitAction({ type: 'choose_color', color: 'red' })}>🔴 执红（先手）</button>
              <button className="chess-choose-btn chess-choose-black" onClick={() => emitAction({ type: 'choose_color', color: 'black' })}>⚫ 执黑（后手）</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 游戏中 / 结束
  const flipped = myColor === 'black';

  return (
    <div className="chess">
      {/* 对方断线提示 */}
      {opponentDisconnected && (
        <div className="chess-disconnect-banner">
          ⚠️ 对方已断线，正在等待重连...
          <button className="chess-claim-win-btn" onClick={() => emitAction({ type: 'resign' })}>
            对方认负，结束游戏
          </button>
        </div>
      )}

      {/* 顶部信息 */}
      <div className="chess-top-bar">
        <span className="chess-info-tag">你: {myColor === 'red' ? '🔴 红方' : '⚫ 黑方'}</span>
        <span className="chess-info-tag">{isMyTurn ? '🟢 轮到你' : `⏳ ${opponent?.nickname || '对手'}走棋`}</span>
        {turnDeadline && <span className={`chess-timer${timeLeft <= 10 ? ' chess-timer-urgent' : ''}`}>⏱️ {timeLeft}s</span>}
        {check && <span className="chess-check-tag">⚠️ 将军!</span>}
      </div>
      {/* 双方剩余总时间 */}
      {gameState.timerSettings?.enabled && gameState.timerSettings?.totalTime > 0 && (
        <div className="chess-time-remaining">
          <span className={`chess-time-tag ${isMyTurn ? 'chess-time-active' : ''}`}>
            你: {formatTime(gameState.timeRemaining?.[playerId])}
          </span>
          <span className={`chess-time-tag ${!isMyTurn ? 'chess-time-active' : ''}`}>
            对手: {formatTime(gameState.timeRemaining?.[gameState.players?.find(p => String(p) !== String(playerId))])}
          </span>
        </div>
      )}

      {/* 棋盘 */}
      <ChessBoard pieces={pieces} flipped={flipped} selected={selected} onCellClick={handleCellClick} />

      {/* 侧边面板（桌面端在棋盘右侧，移动端在棋盘下方） */}
      <div className="chess-side-panel">
        {/* 操作按钮 */}
        {phase === 'playing' && (
          <div className="chess-actions">
            <button className="chess-action-btn chess-action-draw" onClick={() => emitAction({ type: 'draw_request' })} disabled={drawRequestSent}>
              {drawRequestSent ? '已发送求和' : '🤝 求和'}
            </button>
            <button className="chess-action-btn chess-action-resign" onClick={() => { if (window.confirm('确定要投降吗？')) emitAction({ type: 'resign' }); }}>
              🏳️ 投降
            </button>
          </div>
        )}

        {/* 走棋记录 */}
        {moveHistory && moveHistory.length > 0 && (
          <div className="chess-history">
            <div className="chess-history-title">走棋记录</div>
            {moveHistory.slice(-12).map((m, i) => (
              <div key={i} className={`chess-history-item ${m.color}`}>
                <span className="chess-history-piece">{m.piece}</span>
                <span className="chess-history-move">
                  {m.from.col},{m.from.row}→{m.to.col},{m.to.row}
                </span>
                {m.captured && <span className="chess-history-capture">吃{m.captured}</span>}
              </div>
            ))}
          </div>
        )}

        {error && <div className="chess-error">{error}</div>}

        {phase === 'ended' && (
          <div className="chess-result">
            <h2>🏆 游戏结束</h2>
          </div>
        )}
      </div>

      {/* 求和请求弹窗 */}
      {drawRequestFrom && (
        <div className="chess-draw-modal">
          <div className="chess-draw-modal-content">
            <p>对方请求和棋，是否同意？</p>
            <div className="chess-draw-modal-buttons">
              <button className="chess-draw-accept" onClick={() => { emitAction({ type: 'draw_response', accept: true }); setDrawRequestFrom(null); }}>✅ 同意</button>
              <button className="chess-draw-reject" onClick={() => { emitAction({ type: 'draw_response', accept: false }); setDrawRequestFrom(null); }}>❌ 拒绝</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
