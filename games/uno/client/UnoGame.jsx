import { useState, useEffect } from 'react';
import { playSound } from '../../../client/src/services/sounds';

// 花色颜色
const COLORS = ['red', 'green', 'blue', 'yellow'];

const COLOR_CSS = {
  red: '#e74c3c',
  green: '#27ae60',
  blue: '#2980b9',
  yellow: '#f1c40f',
  black: '#2c3e50',
};

const COLOR_BG = {
  red: 'linear-gradient(135deg, #e74c3c, #c0392b)',
  green: 'linear-gradient(135deg, #27ae60, #1e8449)',
  blue: 'linear-gradient(135deg, #2980b9, #1a5276)',
  yellow: 'linear-gradient(135deg, #f1c40f, #d4ac0d)',
  black: 'linear-gradient(135deg, #2c3e50, #1a252f)',
};

const COLOR_NAMES = { red: '红', green: '绿', blue: '蓝', yellow: '黄' };

const VALUE_DISPLAY = {
  skip: '🚫', reverse: '🔄', '+2': '+2', wild: '🌈', 'wild+4': '+4',
};

function UnoCard({ card, onClick, small, selected }) {
  const bg = COLOR_BG[card.color] || COLOR_BG.black;
  const display = VALUE_DISPLAY[card.value] || card.value;
  const isYellow = card.color === 'yellow';
  const isBlack = card.color === 'black';

  return (
    <div
      className={`uno-card${small ? ' uno-card-sm' : ''}${selected ? ' uno-card-selected' : ''}${isBlack ? ' uno-card-wild' : ''}`}
      style={{
        background: bg,
        color: isYellow ? '#2c3e50' : '#fff',
      }}
      onClick={onClick}
    >
      <div className="uno-card-inner">
        <span className="uno-card-value">{display}</span>
        {!small && !isBlack && <span className="uno-card-color">{COLOR_NAMES[card.color] || ''}</span>}
      </div>
      {/* 卡牌椭圆装饰 */}
      {!small && (
        <div className="uno-card-oval" style={{ borderColor: isYellow ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.25)' }} />
      )}
    </div>
  );
}

/**
 * UNO 游戏主组件
 */
export default function UnoGame({ socket, roomId, playerId, gameState, onAction, players, onLeaveRoom, onReturnToRoom }) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [pendingWildIndex, setPendingWildIndex] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!socket) return;
    const handleError = (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 2500);
    };
    const handleDrewCard = () => {
      setSelectedCard(null);
    };
    const handleInfo = (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 2500);
    };
    const handleUnoCalled = (data) => {
      const p = players.find(pl => pl.id === data.playerId);
      setError(`${p?.nickname || '玩家'} 喊了 UNO!`);
      setTimeout(() => setError(''), 3000);
    };
    const handleUnoPenalty = (data) => {
      const p = players.find(pl => pl.id === data.playerId);
      setError(data.message || `${p?.nickname || '玩家'} 未喊 UNO，罚摸 ${data.count || 2} 张`);
      setTimeout(() => setError(''), 3000);
    };
    socket.on('error', handleError);
    socket.on('drew_card', handleDrewCard);
    socket.on('info', handleInfo);
    socket.on('uno_called', handleUnoCalled);
    socket.on('uno_penalty', handleUnoPenalty);
    return () => {
      socket.off('error', handleError);
      socket.off('drew_card', handleDrewCard);
      socket.off('info', handleInfo);
      socket.off('uno_called', handleUnoCalled);
      socket.off('uno_penalty', handleUnoPenalty);
    };
  }, [socket, players]);

  useEffect(() => {
    setSelectedCard(null);
    setShowColorPicker(false);
    setPendingWildIndex(null);
  }, [gameState?.currentTurn]);

  if (!gameState) {
    return (
      <div className="uno-loading">
        <div className="uno-loading-spinner">🃏</div>
        <p>等待游戏数据...</p>
      </div>
    );
  }

  const { myHand, handCounts, currentColor, currentTurn, drawStack, discard, deckCount, phase, winner, winners, finishedPlayers, players: playerIds } = gameState;
  const isMyTurn = playerIds[currentTurn] === playerId;
  const topCard = discard?.[discard.length - 1];
  const isFinished = finishedPlayers?.[playerId];
  const myPlacement = winners?.find(w => w.pid === playerId)?.placement;
  const hasCalledUno = !!gameState.calledUno?.[playerId];
  const canCallUno = isMyTurn && !isFinished && myHand?.length > 0 && myHand?.length <= 2 && !hasCalledUno;

  const emitAction = (action) => {
    if (socket && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  };

  const callUnoBeforeLastCard = () => {
    if (myHand?.length === 2 && !hasCalledUno) {
      emitAction({ type: 'uno' });
    }
  };

  const handleCardClick = (index) => {
    if (!isMyTurn) return;
    const card = myHand[index];

    if (card.color === 'black') {
      // 黑牌需要选色
      setPendingWildIndex(index);
      setShowColorPicker(true);
      return;
    }

    playSound('uno', 'play_card');
    callUnoBeforeLastCard();
    emitAction({ type: 'play_card', cardIndex: index });
    setSelectedCard(null);
  };

  const handleColorChoice = (color) => {
    if (pendingWildIndex !== null) {
      playSound('uno', 'play_card');
      callUnoBeforeLastCard();
      emitAction({ type: 'play_card', cardIndex: pendingWildIndex, chosenColor: color });
      setPendingWildIndex(null);
      setShowColorPicker(false);
      setSelectedCard(null);
    }
  };

  const handleDraw = () => {
    if (!isMyTurn) return;
    playSound('uno', 'draw_card');
    emitAction({ type: 'draw_card' });
  };

  const handleUno = () => {
    if (!canCallUno) return;
    playSound('uno', 'uno');
    emitAction({ type: 'uno' });
  };

  const handleLeaveRoom = () => {
    if (onLeaveRoom) {
      onLeaveRoom();
      return;
    }
    if (socket) socket.emit('leave_room');
  };

  const getNickname = (pid) => gameState.playerInfo?.[pid]?.nickname || players.find(p => p.id === pid)?.nickname || '玩家';
  const getAvatar = (pid) => gameState.playerInfo?.[pid]?.avatar || players.find(p => p.id === pid)?.avatar || null;
  const getIsBot = (pid) => players.find(p => p.id === pid)?.isBot || false;

  // 头像渲染组件（avatar是emoji，直接当文字渲染）
  const AvatarImg = ({ pid, size = 28 }) => {
    const avatar = getAvatar(pid);
    const isBot = getIsBot(pid);
    if (isBot) return <span className="uno-bot-avatar" style={{width:size,height:size,fontSize:size*0.57}}>🤖</span>;
    if (avatar) return <span style={{fontSize: size*0.7, lineHeight: 1}}>{avatar}</span>;
    return <span className="uno-user-avatar" style={{width:size,height:size,fontSize:size*0.43}}>{getNickname(pid).charAt(0)}</span>;
  };

  // 游戏结束
  if (phase === 'ended' || (winners && winners.length > 0 && phase === 'ended')) {
    const myWin = winners?.find(w => w.pid === playerId);
    const placementEmoji = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const placementFace = { 1: '🥳', 2: '😊', 3: '😌' };
    const myEmoji = myWin ? (placementEmoji[myWin.placement] || '😢') : '😢';
    const myFace = myWin ? (placementFace[myWin.placement] || '😶') : '😭';
    return (
      <div className="uno">
        <div className="uno-result">
          <div className="uno-result-icon">{myEmoji}</div>
          <div className="uno-result-face">{myFace}</div>
          <h2 className="uno-result-title">{myWin ? `第${myWin.placement}名！` : '游戏结束'}</h2>
          <div className="uno-result-standings">
            {winners?.map(w => {
              return (
                <div key={w.pid} className="uno-result-row">
                  <span className="uno-result-rank">{placementEmoji[w.placement] || `#${w.placement}`}</span>
                  <div className="uno-result-avatar">
                    <AvatarImg pid={w.pid} size={28} />
                  </div>
                  <span className="uno-result-name">{getNickname(w.pid)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="uno-back-btn" onClick={handleLeaveRoom}>返回大厅</button>
            <button className="uno-back-btn" onClick={onReturnToRoom}>返回房间</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="uno">
      {/* 顶部信息 */}
      <div className="uno-top-bar">
        <div className="uno-me-info">
          <AvatarImg pid={playerId} size={24} />
          <span className="uno-me-name">{getNickname(playerId)}</span>
          {isFinished && <span className="uno-me-done">✅ 已出完</span>}
        </div>
        <span className="uno-info-tag">剩余: {deckCount} 张</span>
        <span className={`uno-turn-tag ${isMyTurn ? 'uno-turn-mine' : ''}`}>
          {isMyTurn ? '🟢 轮到你' : `⏳ ${getNickname(playerIds[currentTurn])}`}
        </span>
        <span className={`uno-draw-stack${drawStack > 0 ? '' : ' uno-draw-stack-empty'}`}>
          ⚠️ 需摸 {drawStack > 0 ? drawStack : 0} 张
        </span>
      </div>

      {/* 对手信息 */}
      <div className="uno-opponents">
        {playerIds.map(pid => {
          const isDone = finishedPlayers?.[pid];
          const winInfo = winners?.find(w => w.pid === pid);
          const placementEmoji = { 1: '🥇', 2: '🥈', 3: '🥉' };
          if (pid === playerId) return null;
          const isActive = playerIds[currentTurn] === pid;
          return (
            <div key={pid} className={`uno-opponent${isActive ? ' uno-opponent-active' : ''}${isDone ? ' uno-opponent-done' : ''}`}>
              <div className="uno-opponent-avatar">
                <AvatarImg pid={pid} size={28} />
              </div>
              <div className="uno-opponent-info">
                <span className="uno-opponent-name">
                  {getNickname(pid)}
                  {winInfo && <span style={{marginLeft:4}}>{placementEmoji[winInfo.placement] || `#${winInfo.placement}`}</span>}
                  {isDone && !winInfo && <span style={{marginLeft:4}}>✅</span>}
                </span>
                <span className="uno-opponent-count">{isDone ? '已出完' : `${handCounts?.[pid] || 0} 张`}</span>
              </div>
              {isActive && <div className="uno-turn-indicator">⏳</div>}
            </div>
          );
        })}
      </div>

      {/* 出牌区域 */}
      <div className="uno-play-area">
        {/* 弃牌堆顶 */}
        {topCard && (
          <div className="uno-top-card">
            <UnoCard card={topCard} />
            <div className="uno-current-color" style={{ background: COLOR_CSS[currentColor] }}>
              {COLOR_NAMES[currentColor]}
            </div>
          </div>
        )}

        {/* 选色面板 */}
        {showColorPicker && (
          <div className="uno-color-picker">
            <p>选择颜色：</p>
            <div className="uno-color-buttons">
              {COLORS.map(c => (
                <button
                  key={c}
                  className="uno-color-btn"
                  style={{ background: COLOR_CSS[c] }}
                  onClick={() => handleColorChoice(c)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      {!isFinished && (
        <div className={`uno-actions${isMyTurn ? '' : ' uno-actions-waiting'}`}>
          {isMyTurn ? (
            <>
              <button className="uno-draw-btn" onClick={handleDraw}>
                摸牌{drawStack > 0 ? ` (${drawStack}张)` : ''}
              </button>
              <button
                className="uno-uno-btn"
                onClick={handleUno}
                disabled={!canCallUno}
                title={canCallUno ? '喊 UNO' : '手牌剩 2 张时会在出牌前自动喊 UNO'}
              >
                {hasCalledUno ? '已喊 UNO' : 'UNO!'}
              </button>
            </>
          ) : (
            <div className="uno-turn-waiting">等待 {getNickname(playerIds[currentTurn])} 出牌</div>
          )}
        </div>
      )}

      {/* 已获胜提示 */}
      {isFinished && (
        <div style={{textAlign:'center',padding:'12px',color:'var(--success)',fontWeight:'600'}}>
          {myPlacement ? `🎉 你已获得第${myPlacement}名！` : '✅ 你已出完所有牌'}
        </div>
      )}

      {/* 错误提示 */}
      <div className="uno-message-slot" aria-live="polite">
        {error && <div className="uno-error">{error}</div>}
      </div>

      {/* 手牌 */}
      {!isFinished && (
        <div className={`uno-hand${!isMyTurn ? ' uno-hand-disabled' : ''}`}>
          {myHand?.map((card, i) => (
            <div key={card.id || i} className="uno-hand-card-wrap" style={{ zIndex: i }}>
              <UnoCard
                card={card}
                selected={selectedCard === i}
                onClick={() => {
                  if (!isMyTurn) return;
                  if (selectedCard === i) {
                    handleCardClick(i);
                  } else {
                    setSelectedCard(i);
                  }
                }}
              />
            </div>
          ))}
        </div>
      )}

      {!isFinished && (
        <p className={`uno-hand-hint${isMyTurn ? '' : ' uno-hand-hint-hidden'}`}>
          点击选牌，再点击出牌
        </p>
      )}
    </div>
  );
}
