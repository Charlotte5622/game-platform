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

  return (
    <div className="chess-board-outer">
      <svg
        className="chess-board-svg"
        viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
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
      </svg>
    </div>
  );
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

  useEffect(() => {
    if (!socket) return;
    const handleError = (data) => { setError(data.message); setTimeout(() => setError(''), 2500); };
    const handleRpsRecorded = (data) => setMyRpsChoice(data.choice);
    const handleRpsDraw = () => setMyRpsChoice(null);
    const handleRpsResult = () => setMyRpsChoice(null);
    const handleTurnTimer = (data) => setTurnDeadline(data.deadline);
    socket.on('error', handleError);
    socket.on('rps_recorded', handleRpsRecorded);
    socket.on('rps_draw', handleRpsDraw);
    socket.on('rps_result', handleRpsResult);
    socket.on('turn_timer', handleTurnTimer);
    return () => {
      socket.off('error', handleError);
      socket.off('rps_recorded', handleRpsRecorded);
      socket.off('rps_draw', handleRpsDraw);
      socket.off('rps_result', handleRpsResult);
      socket.off('turn_timer', handleTurnTimer);
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

  const { phase, colorMap, pieces, turnColor, check, moveHistory, rpsChoices, rpsRound, winner } = gameState;
  const myColor = colorMap?.[playerId];
  const isMyTurn = phase === 'playing' && myColor === turnColor;
  const opponent = players.find(p => p.id !== playerId);

  const emitAction = useCallback((action) => {
    if (socket && roomId) socket.emit('game_action', { roomId, action });
  }, [socket, roomId]);

  const handleCellClick = useCallback((col, row) => {
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
  }, [isMyTurn, selected, pieces, myColor, emitAction]);

  // 猜拳阶段
  if (phase === 'rps') {
    const myChoice = myRpsChoice || rpsChoices?.[playerId]?.choice;
    const opponentReady = rpsChoices && Object.keys(rpsChoices).length >= 1 && !myChoice;
    return (
      <div className="chess">
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
    const isWinner = winner === playerId;
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
      {/* 顶部信息 */}
      <div className="chess-top-bar">
        <span className="chess-info-tag">你: {myColor === 'red' ? '🔴 红方' : '⚫ 黑方'}</span>
        <span className="chess-info-tag">{isMyTurn ? '🟢 轮到你' : `⏳ ${opponent?.nickname || '对手'}走棋`}</span>
        {turnDeadline && <span className={`chess-timer${timeLeft <= 10 ? ' chess-timer-urgent' : ''}`}>⏱️ {timeLeft}s</span>}
        {check && <span className="chess-check-tag">⚠️ 将军!</span>}
      </div>

      {/* 棋盘 */}
      <ChessBoard pieces={pieces} flipped={flipped} selected={selected} onCellClick={handleCellClick} />

      {/* 走棋记录 */}
      {moveHistory && moveHistory.length > 0 && (
        <div className="chess-history">
          {moveHistory.slice(-6).map((m, i) => (
            <span key={i} className={`chess-history-item ${m.color}`}>
              {m.piece}{m.captured ? `吃${m.captured}` : ''} {m.from.col},{m.from.row}→{m.to.col},{m.to.row}
            </span>
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
  );
}
