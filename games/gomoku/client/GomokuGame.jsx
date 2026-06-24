import { useState, useEffect, useCallback } from 'react';
import { RiCloseLine } from '@remixicon/react';
import { playSound } from '../../../client/src/services/sounds';

const SIZE = 15;
const CELL = 40;

// 猜拳图标
const RPS_ICONS = { rock: '✊', scissors: '✌️', paper: '🖐' };
const RPS_NAMES = { rock: '石头', scissors: '剪刀', paper: '布' };

/**
 * 五子棋棋盘 — 纯 SVG 实现
 *
 * viewBox: "-40 -40 620 620"
 * 格子间距: 40 单位
 */
function GomokuBoard({ board, lastMove, winLine, myColor, isMyTurn, onCellClick, hoverCell, setHoverCell }) {
  const PAD = 40;
  const W = (SIZE - 1) * CELL;
  const H = (SIZE - 1) * CELL;

  const getPos = (row, col) => ({
    x: col * CELL,
    y: row * CELL,
  });

  // 星位标记
  const starPoints = [
    [7, 7],   // 天元
    [3, 3], [3, 11], [11, 3], [11, 11], // 四角
  ];

  return (
    <div className="gomoku-board-outer">
      <svg
        className="gomoku-board-svg"
        viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* 木纹背景 */}
        <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={H + PAD * 2} fill="#f5e6c8" rx="8" />

        {/* 网格线 */}
        {Array.from({ length: SIZE }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * CELL} x2={W} y2={i * CELL} stroke="#5c4a32" strokeWidth="1.5" />
        ))}
        {Array.from({ length: SIZE }, (_, i) => (
          <line key={`v${i}`} x1={i * CELL} y1="0" x2={i * CELL} y2={H} stroke="#5c4a32" strokeWidth="1.5" />
        ))}

        {/* 边框 */}
        <rect x="0" y="0" width={W} height={H} fill="none" stroke="#5c4a32" strokeWidth="2.5" />

        {/* 星位标记 */}
        {starPoints.map(([r, c]) => {
          const { x, y } = getPos(r, c);
          return <circle key={`star-${r}-${c}`} cx={x} cy={y} r={4} fill="#5c4a32" />;
        })}

        {/* 获胜连线 */}
        {winLine && winLine.length > 0 && (() => {
          // 按坐标排序，取首尾连线
          const sorted = [...winLine].sort((a, b) => a.row - b.row || a.col - b.col);
          const first = getPos(sorted[0].row, sorted[0].col);
          const last = getPos(sorted[sorted.length - 1].row, sorted[sorted.length - 1].col);
          return (
            <g>
              <line
                x1={first.x} y1={first.y} x2={last.x} y2={last.y}
                stroke="rgba(239, 68, 68, 0.6)" strokeWidth="6" strokeLinecap="round"
                filter="url(#glow)"
              />
              <line
                x1={first.x} y1={first.y} x2={last.x} y2={last.y}
                stroke="#ef4444" strokeWidth="3" strokeLinecap="round"
              />
            </g>
          );
        })()}

        {/* 发光滤镜 */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 棋子 */}
        {board.map((rowArr, row) =>
          rowArr.map((cell, col) => {
            if (!cell) return null;
            const { x, y } = getPos(row, col);
            const isLast = lastMove && lastMove.row === row && lastMove.col === col;
            const isWinPiece = winLine?.some(w => w.row === row && w.col === col);
            return (
              <g key={`piece-${row}-${col}`}>
                {cell === 'black' ? (
                  <>
                    <circle cx={x + 1.5} cy={y + 1.5} r={17} fill="rgba(0,0,0,0.2)" />
                    <circle cx={x} cy={y} r={17} fill="url(#blackGrad)" stroke="#222" strokeWidth="1" />
                  </>
                ) : (
                  <>
                    <circle cx={x + 1.5} cy={y + 1.5} r={17} fill="rgba(0,0,0,0.12)" />
                    <circle cx={x} cy={y} r={17} fill="url(#whiteGrad)" stroke="#bbb" strokeWidth="1" />
                  </>
                )}
                {/* 最后落子金色脉冲 */}
                {isLast && !winLine && (
                  <circle cx={x} cy={y} r={20} fill="none" stroke="#fbbf24" strokeWidth="2.5" opacity="0.8">
                    <animate attributeName="opacity" values="0.8;0.3;0.8" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="r" values="18;22;18" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                {/* 获胜棋子高亮 */}
                {isWinPiece && (
                  <circle cx={x} cy={y} r={20} fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.7">
                    <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })
        )}

        {/* 棋子渐变定义 */}
        <defs>
          <radialGradient id="blackGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#555" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          <radialGradient id="whiteGrad" cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#ddd" />
          </radialGradient>
        </defs>

        {/* 空位点击 + hover 预览 */}
        {isMyTurn && board.map((rowArr, row) =>
          rowArr.map((cell, col) => {
            if (cell) return null;
            const { x, y } = getPos(row, col);
            const isHovered = hoverCell && hoverCell.row === row && hoverCell.col === col;
            return (
              <g key={`click-${row}-${col}`}>
                <circle
                  cx={x} cy={y} r={18}
                  fill="transparent"
                  cursor="pointer"
                  onClick={() => onCellClick(row, col)}
                  onMouseEnter={() => setHoverCell({ row, col })}
                  onMouseLeave={() => setHoverCell(null)}
                />
                {isHovered && (
                  <circle
                    cx={x} cy={y} r={17}
                    fill={myColor === 'black' ? 'rgba(30,30,30,0.3)' : 'rgba(220,220,220,0.4)'}
                    stroke={myColor === 'black' ? 'rgba(30,30,30,0.5)' : 'rgba(180,180,180,0.6)'}
                    strokeWidth="1"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })
        )}

        {/* 坐标标注 */}
        {Array.from({ length: SIZE }, (_, i) => (
          <text
            key={`cl-${i}`}
            x={i * CELL}
            y={-PAD + 14}
            textAnchor="middle"
            fontSize="11"
            fill="#8b7355"
            fontFamily="sans-serif"
            fontWeight="600"
          >
            {String.fromCharCode(65 + i)}
          </text>
        ))}
        {Array.from({ length: SIZE }, (_, i) => (
          <text
            key={`rl-${i}`}
            x={W + PAD - 8}
            y={i * CELL}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="11"
            fill="#8b7355"
            fontFamily="sans-serif"
            fontWeight="600"
          >
            {SIZE - i}
          </text>
        ))}
      </svg>
    </div>
  );
}

/**
 * 五子棋主组件
 */
export default function GomokuGame({ socket, roomId, playerId, gameState, onAction, players, onLeaveRoom, onReturnToRoom }) {
  const [hoverCell, setHoverCell] = useState(null);
  const [error, setError] = useState('');
  const [myRpsChoice, setMyRpsChoice] = useState(null);
  const [drawRequestFrom, setDrawRequestFrom] = useState(null);
  const [drawRequestSent, setDrawRequestSent] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [showDrawConfirmModal, setShowDrawConfirmModal] = useState(false);
  const [gameResult, setGameResult] = useState(null);

  useEffect(() => {
    if (!socket) return;

    const handleError = (data) => { setError(data.message); setTimeout(() => setError(''), 2500); };
    const handleRpsRecorded = (data) => setMyRpsChoice(data.choice);
    const handleRpsDraw = () => setMyRpsChoice(null);
    const handleRpsResult = () => setMyRpsChoice(null);
    const handleDrawRequestReceived = (data) => setDrawRequestFrom(data.from);
    const handleDrawRequestSent = () => setDrawRequestSent(true);
    const handleDrawRejected = (data) => { setDrawRequestSent(false); setError(data.message); setTimeout(() => setError(''), 2500); };
    const handleGameOver = (data) => {
      setGameResult({
        type: data.reason || 'game_over',
        winner: data.winner,
        loser: data.loser,
        message: data.message,
        reason: data.reason,
        winLine: data.winLine,
      });
    };

    socket.on('error', handleError);
    socket.on('rps_recorded', handleRpsRecorded);
    socket.on('rps_draw', handleRpsDraw);
    socket.on('rps_result', handleRpsResult);
    socket.on('draw_request', handleDrawRequestReceived);
    socket.on('draw_request_sent', handleDrawRequestSent);
    socket.on('draw_rejected', handleDrawRejected);
    socket.on('game_over', handleGameOver);

    return () => {
      socket.off('error', handleError);
      socket.off('rps_recorded', handleRpsRecorded);
      socket.off('rps_draw', handleRpsDraw);
      socket.off('rps_result', handleRpsResult);
      socket.off('draw_request', handleDrawRequestReceived);
      socket.off('draw_request_sent', handleDrawRequestSent);
      socket.off('draw_rejected', handleDrawRejected);
      socket.off('game_over', handleGameOver);
    };
  }, [socket]);

  // 重置状态（新游戏）
  useEffect(() => {
    setGameResult(null);
    setDrawRequestFrom(null);
    setDrawRequestSent(false);
    setError('');
    setMyRpsChoice(null);
  }, [gameState?.phase]);

  if (!gameState) {
    return (
      <div className="gomoku-loading">
        <div className="gomoku-loading-spinner">⚫</div>
        <p>等待游戏数据...</p>
      </div>
    );
  }

  const { phase, board, blackId, whiteId, currentTurn, moves, winner, winLine, rpsChoices, rpsRound, rpsWinner } = gameState;

  // 当前玩家颜色（playing 阶段才有效）
  const myColor = blackId ? (String(playerId) === String(blackId) ? 'black' : 'white') : undefined;
  const isMyTurn = phase === 'playing' && !!myColor && String(gameState.players[currentTurn]) === String(playerId);
  const opponent = players?.find(p => String(p.id) !== String(playerId));

  const emitAction = (action) => {
    if (socket && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  };

  const handleCellClick = (row, col) => {
    if (!isMyTurn) return;
    playSound('gomoku', 'place');
    emitAction({ type: 'place', row, col });
    setHoverCell(null);
  };

  const getColorLabel = (color) => color === 'black' ? '⚫ 黑棋' : '⚪ 白棋';
  const getCurrentTurnLabel = () => {
    if (phase !== 'playing') return '';
    const turnColor = currentTurn === 0 ? 'black' : 'white';
    const turnPid = gameState.players[currentTurn];
    const isMe = String(turnPid) === String(playerId);
    return isMe ? '轮到你了' : '等待对手';
  };

  // ========== 猜拳阶段 ==========
  if (phase === 'rps') {
    const myChoice = myRpsChoice || rpsChoices?.[String(playerId)]?.choice;
    const opponentId = Object.keys(rpsChoices || {}).find(k => String(k) !== String(playerId));
    const opponentReady = !!opponentId;

    return (
      <div className="gomoku">
        {/* 电脑端退出按钮 */}
        <button className="game-exit-btn" onClick={onLeaveRoom} title="退出游戏"><RiCloseLine size={18} /></button>

        <div className="gomoku-rps">
          <h2 className="gomoku-rps-title">✊✌️🖐 猜拳选先手</h2>
          <p className="gomoku-rps-sub">胜者可选择执黑或执白</p>
          {(rpsRound || 1) > 1 && <p className="gomoku-rps-round">第 {rpsRound} 轮（上轮平局）</p>}

          <div className="gomoku-rps-buttons">
            {Object.entries(RPS_ICONS).map(([key, icon]) => (
              <button
                key={key}
                className={`gomoku-rps-btn${myChoice === key ? ' gomoku-rps-btn-active' : ''}`}
                onClick={() => {
                  if (!myChoice) {
                    setMyRpsChoice(key);
                    playSound('click');
                    emitAction({ type: 'rps', choice: key });
                  }
                }}
                disabled={!!myChoice}
              >
                <span className="gomoku-rps-icon">{icon}</span>
                <span className="gomoku-rps-name">{RPS_NAMES[key]}</span>
              </button>
            ))}
          </div>

          {/* 状态提示 */}
          <div className="gomoku-rps-status">
            {myChoice && !opponentReady && (
              <p className="gomoku-rps-waiting">
                你出了 <strong>{RPS_ICONS[myChoice]} {RPS_NAMES[myChoice]}</strong>，等待对手出拳...
              </p>
            )}
            {!myChoice && opponentReady && (
              <p className="gomoku-rps-waiting">
                对手已出拳，请选择你的出拳
              </p>
            )}
            {myChoice && opponentReady && (
              <p className="gomoku-rps-waiting">
                双方已出拳，等待结果...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== 选色阶段 ==========
  if (phase === 'choosing') {
    const isWinner = String(rpsWinner) === String(playerId);
    return (
      <div className="gomoku">
        {/* 电脑端退出按钮 */}
        <button className="game-exit-btn" onClick={onLeaveRoom} title="退出游戏"><RiCloseLine size={18} /></button>

        <div className="gomoku-choose">
          <h2 className="gomoku-choose-title">{isWinner ? '🎉 你赢了！请选择阵营' : '等待对手选色...'}</h2>
          {isWinner && (
            <div className="gomoku-choose-buttons">
              <button className="gomoku-choose-btn gomoku-choose-black" onClick={() => { playSound('click'); emitAction({ type: 'choose_color', color: 'black' }); }}>⚫ 执黑（先手）</button>
              <button className="gomoku-choose-btn gomoku-choose-white" onClick={() => { playSound('click'); emitAction({ type: 'choose_color', color: 'white' }); }}>⚪ 执白（后手）</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ========== 游戏中 / 结束 ==========

  return (
    <div className="gomoku">
      {/* 电脑端退出按钮 */}
      <button className="game-exit-btn" onClick={onLeaveRoom} title="退出游戏"><RiCloseLine size={18} /></button>

      {/* 顶部信息栏 */}
      <div className="gomoku-top-bar">
        <span className="gomoku-info-tag">
          {myColor ? getColorLabel(myColor) : ''}
        </span>
        <span className={`gomoku-info-tag ${isMyTurn ? 'gomoku-turn-active' : ''}`}>
          {getCurrentTurnLabel()}
        </span>
        <span className="gomoku-info-tag">
          第 {moves.length} 手
        </span>
      </div>

      {/* 主体：棋盘 + 侧边面板 */}
      <div className="gomoku-main">
        <GomokuBoard
          board={board}
          lastMove={moves.length > 0 ? moves[moves.length - 1] : null}
          winLine={winLine}
          myColor={myColor || 'black'}
          isMyTurn={isMyTurn}
          onCellClick={handleCellClick}
          hoverCell={hoverCell}
          setHoverCell={setHoverCell}
        />

        {/* 侧边面板 */}
        <div className="gomoku-side-panel">
          <div className="gomoku-side-actions">
            <button
              className="gomoku-btn gomoku-btn-draw"
              disabled={phase !== 'playing' || drawRequestSent}
              onClick={() => setShowDrawConfirmModal(true)}
            >
              🤝 {drawRequestSent ? '已发送' : '求和'}
            </button>
            <button
              className="gomoku-btn gomoku-btn-resign"
              disabled={phase !== 'playing'}
              onClick={() => setShowResignModal(true)}
            >
              🏳️ 投降
            </button>
          </div>

          <div className="gomoku-move-list">
            <div className="gomoku-side-title">落子记录</div>
            {moves.length === 0 && (
              <div className="gomoku-move-empty">暂无落子</div>
            )}
            {moves.map((m, i) => (
              <div key={i} className={`gomoku-move-item ${m.color}`}>
                <span className="gomoku-move-num">#{i + 1}</span>
                <span className="gomoku-move-dot">{m.color === 'black' ? '⚫' : '⚪'}</span>
                <span className="gomoku-move-pos">
                  {String.fromCharCode(65 + m.col)}{SIZE - m.row}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && <div className="gomoku-error">{error}</div>}

      {/* 胜负弹窗 */}
      {gameResult && (
        <div className="gomoku-result-modal">
          <div className={`gomoku-result-modal-content ${
            gameResult.reason === 'draw_agreed' || gameResult.reason === 'draw_full'
              ? 'gomoku-result-draw'
              : String(gameResult.winner) === String(playerId)
                ? 'gomoku-result-win'
                : 'gomoku-result-lose'
          }`}>
            <div className="gomoku-result-icon">
              {gameResult.reason === 'draw_agreed' || gameResult.reason === 'draw_full'
                ? '🤝'
                : String(gameResult.winner) === String(playerId)
                  ? '🎉'
                  : '😢'}
            </div>
            <h2 className="gomoku-result-title">
              {gameResult.reason === 'draw_agreed' || gameResult.reason === 'draw_full'
                ? '平局'
                : String(gameResult.winner) === String(playerId)
                  ? '你赢了！'
                  : '你输了'}
            </h2>
            <p className="gomoku-result-reason">
              {gameResult.reason === 'resign'
                ? (String(gameResult.winner) === String(playerId) ? '对手投降认负' : '你选择了投降')
                : gameResult.message}
            </p>
            <div className="gomoku-result-details">
              {gameResult.reason === 'win' && (
                <span>{String(gameResult.winner) === String(playerId) ? '你五连珠获胜' : '对手五连珠获胜'}</span>
              )}
              {gameResult.reason === 'resign' && (
                <span>{String(gameResult.winner) === String(playerId) ? '对手投降认负' : '你选择了投降'}</span>
              )}
              {(gameResult.reason === 'draw_agreed' || gameResult.reason === 'draw_full') && (
                <span>{gameResult.reason === 'draw_full' ? '棋盘已满' : '双方同意和棋'}</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="gomoku-result-back-btn" onClick={onLeaveRoom}>
                返回大厅
              </button>
              <button className="gomoku-result-back-btn" onClick={onReturnToRoom}>
                返回房间
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 投降确认弹窗 */}
      {showResignModal && (
        <div className="gomoku-result-modal" onClick={() => setShowResignModal(false)}>
          <div className="gomoku-result-modal-content gomoku-result-lose" onClick={e => e.stopPropagation()}>
            <div className="gomoku-result-icon">🏳️</div>
            <h2 className="gomoku-result-title">确认投降？</h2>
            <p className="gomoku-result-reason">投降将判你负，确定要放弃这局吗？</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="gomoku-result-back-btn" style={{ background: 'var(--danger)' }} onClick={() => { emitAction({ type: 'resign' }); setShowResignModal(false); }}>
                确认投降
              </button>
              <button className="gomoku-result-back-btn" style={{ background: 'var(--bg-input)', color: 'var(--text)' }} onClick={() => setShowResignModal(false)}>
                继续下棋
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 求和确认弹窗 */}
      {showDrawConfirmModal && (
        <div className="gomoku-result-modal" onClick={() => setShowDrawConfirmModal(false)}>
          <div className="gomoku-result-modal-content gomoku-result-draw" onClick={e => e.stopPropagation()}>
            <div className="gomoku-result-icon">🤝</div>
            <h2 className="gomoku-result-title">请求和棋？</h2>
            <p className="gomoku-result-reason">将向对手发送和棋请求，等待对方回应</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button className="gomoku-result-back-btn" style={{ background: 'var(--secondary)' }} onClick={() => { emitAction({ type: 'draw_request' }); setShowDrawConfirmModal(false); }}>
                发送请求
              </button>
              <button className="gomoku-result-back-btn" style={{ background: 'var(--bg-input)', color: 'var(--text)' }} onClick={() => setShowDrawConfirmModal(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 求和请求弹窗 */}
      {drawRequestFrom && (
        <div className="gomoku-draw-modal">
          <div className="gomoku-draw-modal-content">
            <p>对方请求和棋，是否同意？</p>
            <div className="gomoku-draw-modal-buttons">
              <button className="gomoku-draw-accept" onClick={() => { emitAction({ type: 'draw_response', accept: true }); setDrawRequestFrom(null); }}>✅ 同意</button>
              <button className="gomoku-draw-reject" onClick={() => { emitAction({ type: 'draw_response', accept: false }); setDrawRequestFrom(null); }}>❌ 拒绝</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
