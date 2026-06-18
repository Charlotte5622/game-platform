import { useState, useEffect, useCallback } from 'react';

// 猜拳图标
const RPS_ICONS = { rock: '✊', scissors: '✌️', paper: '🖐' };
const RPS_NAMES = { rock: '石头', scissors: '剪刀', paper: '布' };

/**
 * 棋子组件
 */
function Piece({ piece, isSelected, onClick }) {
  const isRed = piece.color === 'red';
  return (
    <div
      className={`chess-piece${isRed ? ' chess-piece-red' : ' chess-piece-black'}${isSelected ? ' chess-piece-selected' : ''}`}
      onClick={onClick}
    >
      {piece.name}
    </div>
  );
}

/**
 * 中国象棋主组件
 */
export default function ChineseChessGame({ socket, roomId, playerId, gameState, onAction, players }) {
  const [selected, setSelected] = useState(null); // {col, row}
  const [error, setError] = useState('');
  const [myRpsChoice, setMyRpsChoice] = useState(null); // 本地记录自己的猜拳选择

  useEffect(() => {
    if (!socket) return;
    const handleError = (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 2500);
    };
    // 监听猜拳确认（用于即时反馈）
    const handleRpsRecorded = (data) => {
      setMyRpsChoice(data.choice);
    };
    const handleRpsDraw = () => {
      setMyRpsChoice(null); // 平局重置
    };
    const handleRpsResult = () => {
      setMyRpsChoice(null); // 有结果后重置
    };
    socket.on('error', handleError);
    socket.on('rps_recorded', handleRpsRecorded);
    socket.on('rps_draw', handleRpsDraw);
    socket.on('rps_result', handleRpsResult);
    return () => {
      socket.off('error', handleError);
      socket.off('rps_recorded', handleRpsRecorded);
      socket.off('rps_draw', handleRpsDraw);
      socket.off('rps_result', handleRpsResult);
    };
  }, [socket]);

  // 阶段变化时重置本地状态
  useEffect(() => {
    setMyRpsChoice(null);
    setSelected(null);
  }, [gameState?.phase]);

  // 状态变化时重置选择
  useEffect(() => {
    setSelected(null);
  }, [gameState?.turnColor]);

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

  // 直接通过 socket 发送操作（绕过 onAction 链，避免 roomId 未设置的问题）
  const emitAction = useCallback((action) => {
    if (socket && roomId) {
      console.log(`[Chess] 发送动作: ${action.type}, roomId=${roomId}`);
      socket.emit('game_action', { roomId, action });
    } else {
      console.warn(`[Chess] 无法发送动作: socket=${!!socket}, roomId=${roomId}`);
    }
  }, [socket, roomId]);

  // 点击棋盘格子
  const handleCellClick = useCallback((col, row) => {
    if (!isMyTurn) return;

    const clickedPiece = pieces?.find(p => p.col === col && p.row === row);

    if (selected) {
      // 已选中棋子
      if (clickedPiece && clickedPiece.color === myColor) {
        // 点击己方棋子，切换选中
        setSelected({ col, row });
        return;
      }
      // 走棋
      emitAction({ type: 'move', from: selected, to: { col, row } });
      setSelected(null);
    } else {
      // 未选中，选中点击的棋子
      if (clickedPiece && clickedPiece.color === myColor) {
        setSelected({ col, row });
      }
    }
  }, [isMyTurn, selected, pieces, myColor, emitAction]);

  // 阶段渲染包装（防止 RPS→choosing 切换时崩溃）
  const renderContent = () => {
  // 猜拳阶段
  if (phase === 'rps') {
    // 本地优先，服务端兜底
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
                onClick={() => {
                  if (myChoice) return;
                  setMyRpsChoice(key); // 立即本地反馈
                  emitAction({ type: 'rps', choice: key });
                }}
                disabled={!!myChoice}
              >
                <span className="chess-rps-icon">{icon}</span>
                <span className="chess-rps-name">{RPS_NAMES[key]}</span>
              </button>
            ))}
          </div>

          {myChoice && (
            <p className="chess-rps-waiting">
              你出了 <strong>{RPS_NAMES[myChoice]}</strong>，等待对手...
            </p>
          )}
          {opponentReady && (
            <p className="chess-rps-waiting">对手已出拳，等你选择</p>
          )}
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
          <h2 className="chess-choose-title">
            {isWinner ? '🎉 你赢了！请选择阵营' : '等待对手选色...'}
          </h2>
          {isWinner && (
            <div className="chess-choose-buttons">
              <button
                className="chess-choose-btn chess-choose-red"
                onClick={() => emitAction({ type: 'choose_color', color: 'red' })}
              >
                🔴 执红（先手）
              </button>
              <button
                className="chess-choose-btn chess-choose-black"
                onClick={() => emitAction({ type: 'choose_color', color: 'black' })}
              >
                ⚫ 执黑（后手）
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 游戏中 / 结束
  const myPieces = pieces?.filter(p => p.color === myColor) || [];
  const opponentPieces = pieces?.filter(p => p.color !== myColor) || [];

  // 棋盘是否需要翻转（黑方在下）
  const flipped = myColor === 'black';

  return (
    <div className="chess">
      {/* 顶部信息 */}
      <div className="chess-top-bar">
        <span className="chess-info-tag">
          你: {myColor === 'red' ? '🔴 红方' : '⚫ 黑方'}
        </span>
        <span className="chess-info-tag">
          {isMyTurn ? '🟢 轮到你' : `⏳ ${opponent?.nickname || '对手'}走棋`}
        </span>
        {check && <span className="chess-check-tag">⚠️ 将军!</span>}
      </div>

      {/* 棋盘 */}
      <div className="chess-board-wrap">
        <div className="chess-board">
          {/* 绘制网格线 */}
          <svg className="chess-grid-svg" viewBox="0 0 8 9" preserveAspectRatio="none">
            {/* 横线 */}
            {Array.from({ length: 10 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={i} x2="8" y2={i} stroke="currentColor" strokeWidth="0.04" />
            ))}
            {/* 竖线 */}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={i} y1="0" x2={i} y2="9" stroke="currentColor" strokeWidth="0.04" />
            ))}
            {/* 中间断开（楚河汉界） */}
            <line x1="0" y1="4.5" x2="8" y2="4.5" stroke="none" />
            {/* 九宫格斜线 */}
            <line x1="3" y1="0" x2="5" y2="2" stroke="currentColor" strokeWidth="0.03" />
            <line x1="5" y1="0" x2="3" y2="2" stroke="currentColor" strokeWidth="0.03" />
            <line x1="3" y1="7" x2="5" y2="9" stroke="currentColor" strokeWidth="0.03" />
            <line x1="5" y1="7" x2="3" y2="9" stroke="currentColor" strokeWidth="0.03" />
          </svg>

          {/* 楚河汉界 */}
          <div className="chess-river">
            <span>楚 河</span>
            <span>汉 界</span>
          </div>

          {/* 棋子 */}
          {pieces?.map(piece => {
            const displayCol = flipped ? 8 - piece.col : piece.col;
            const displayRow = flipped ? 9 - piece.row : piece.row;
            return (
              <div
                key={piece.id}
                className="chess-piece-wrap"
                style={{
                  left: `${(displayCol / 8) * 100}%`,
                  top: `${(displayRow / 9) * 100}%`,
                }}
                onClick={() => handleCellClick(piece.col, piece.row)}
              >
                <Piece
                  piece={piece}
                  isSelected={selected?.col === piece.col && selected?.row === piece.row}
                  onClick={() => handleCellClick(piece.col, piece.row)}
                />
              </div>
            );
          })}

          {/* 空白格子点击区域 */}
          {Array.from({ length: 10 }, (_, row) =>
            Array.from({ length: 9 }, (_, col) => {
              const displayCol = flipped ? 8 - col : col;
              const displayRow = flipped ? 9 - row : row;
              const hasPiece = pieces?.some(p => p.col === col && p.row === row);
              if (hasPiece) return null;
              return (
                <div
                  key={`cell-${col}-${row}`}
                  className="chess-cell"
                  style={{
                    left: `${(displayCol / 8) * 100}%`,
                    top: `${(displayRow / 9) * 100}%`,
                  }}
                  onClick={() => handleCellClick(col, row)}
                />
              );
            })
          )}
        </div>
      </div>

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

      {/* 错误提示 */}
      {error && <div className="chess-error">{error}</div>}

      {/* 游戏结束 */}
      {phase === 'ended' && (
        <div className="chess-result">
          <h2>🏆 游戏结束</h2>
        </div>
      )}
    </div>
  );
  }; // end renderContent

  // 错误边界：防止阶段切换时崩溃
  try {
    return renderContent();
  } catch (e) {
    console.error('[Chess] 渲染出错:', e);
    return (
      <div className="chess">
        <div className="chess-loading">
          <p>加载中...</p>
        </div>
      </div>
    );
  }
}
