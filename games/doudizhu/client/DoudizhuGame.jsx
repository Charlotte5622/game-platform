import { useState, useEffect, useCallback } from 'react';

// 牌型中文名
const CARD_TYPE_NAMES = {
  single: '单张', pair: '对子', trio: '三条',
  trio_single: '三带一', trio_pair: '三带二',
  straight: '顺子', pair_straight: '连对', plane: '飞机',
  plane_single: '飞机带单', plane_pair: '飞机带对',
  bomb: '💣 炸弹', rocket: '🚀 火箭',
  four_two_single: '四带二', four_two_pair: '四带二对',
};

const isRedSuit = (suit) => suit === '♥' || suit === '♦';

/**
 * 单张牌组件
 */
function Card({ card, selected, onClick, small, faceDown }) {
  if (faceDown) {
    return (
      <div className={`dz-card${small ? ' dz-card-sm' : ''} dz-card-back`}>
        <div className="dz-card-back-pattern">🂠</div>
      </div>
    );
  }

  const isJoker = card.rank === 'JOKER_S' || card.rank === 'JOKER_B';
  const isRed = isRedSuit(card.suit) || card.rank === 'JOKER_B';

  return (
    <div
      className={`dz-card${small ? ' dz-card-sm' : ''}${selected ? ' dz-card-selected' : ''} ${isRed ? 'dz-card-red' : 'dz-card-black'}`}
      onClick={onClick}
    >
      {isJoker ? (
        <div className="dz-card-joker">
          <span className="dz-card-joker-icon">{card.rank === 'JOKER_B' ? '🃏' : '🂿'}</span>
          <span className="dz-card-joker-label">{card.rank === 'JOKER_B' ? '大' : '小'}</span>
        </div>
      ) : (
        <>
          <div className="dz-card-tl">
            <span className="dz-card-rank-text">{card.rank}</span>
            <span className="dz-card-suit-text">{card.suit}</span>
          </div>
          <div className="dz-card-center">
            {small ? card.suit : <span className="dz-card-center-suit">{card.suit}</span>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 玩家信息面板
 */
function PlayerPanel({ player, bid, isPassing }) {
  return (
    <div
      className={`dz-panel${player.isCurrent ? ' dz-panel-active' : ''}${player.isLandlord ? ' dz-panel-landlord' : ''}`}
    >
      <div className="dz-panel-avatar">{player.isLandlord ? '👑' : '👤'}</div>
      <div className="dz-panel-name">{player.nickname}</div>
      <div className="dz-panel-count">{player.cardCount} 张</div>
      {bid !== undefined && (
        <div className="dz-panel-bid">{bid.score === 0 ? '不叫' : `${bid.score}分`}</div>
      )}
      {player.isCurrent && <div className="dz-panel-turn">⏰</div>}
      {isPassing && <div className="dz-panel-pass">不出</div>}
    </div>
  );
}

/**
 * 叫分面板
 */
function BiddingPanel({ isMyTurn, highestBid, bids, players, getPlayer, onBid }) {
  return (
    <div className="dz-bid">
      <h3 className="dz-bid-title">🃏 叫地主</h3>
      <div className="dz-bid-history">
        {players.map((pid, i) => {
          const bid = bids?.[pid];
          const p = getPlayer(i);
          return (
            <div key={pid} className="dz-bid-history-item">
              <span className="dz-bid-history-name">{p.nickname}</span>
              <span className="dz-bid-history-score">
                {bid ? (bid.score === 0 ? '不叫' : `${bid.score}分`) : '...'}
              </span>
            </div>
          );
        })}
      </div>
      {isMyTurn ? (
        <div className="dz-bid-buttons">
          <button className="dz-bid-btn dz-bid-pass" onClick={() => onBid(0)}>不叫</button>
          {highestBid < 1 && <button className="dz-bid-btn dz-bid-score" onClick={() => onBid(1)}>1分</button>}
          {highestBid < 2 && <button className="dz-bid-btn dz-bid-score" onClick={() => onBid(2)}>2分</button>}
          {highestBid < 3 && <button className="dz-bid-btn dz-bid-score" onClick={() => onBid(3)}>3分</button>}
        </div>
      ) : (
        <p className="dz-bid-wait">等待其他玩家叫分...</p>
      )}
    </div>
  );
}

/**
 * 斗地主游戏主组件
 */
export default function DoudizhuGame({ socket, roomId, playerId, gameState, onAction, players }) {
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [error, setError] = useState('');
  const [passAnimation, setPassAnimation] = useState(null);

  useEffect(() => {
    if (!socket) return;
    const handleError = (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 2500);
    };
    socket.on('error', handleError);
    return () => socket.off('error', handleError);
  }, [socket]);

  useEffect(() => {
    if (!socket) return;
    const handlePass = (data) => {
      setPassAnimation(data.playerId);
      setTimeout(() => setPassAnimation(null), 1000);
    };
    socket.on('pass_update', handlePass);
    return () => socket.off('pass_update', handlePass);
  }, [socket]);

  useEffect(() => {
    setSelectedCards(new Set());
  }, [gameState?.currentTurn, gameState?.phase]);

  if (!gameState) {
    return (
      <div className="dz-loading">
        <div className="dz-loading-spinner">⏳</div>
        <p>等待游戏数据...</p>
      </div>
    );
  }

  const { myHand, phase, landlord, currentTurn, lastPlay, lastPlayedBy, playerCardCounts, kitty, highestBid, bids, playHistory } = gameState;
  const isMyTurn = gameState.players[currentTurn] === playerId;
  const isLandlord = landlord === playerId;

  const myIndex = gameState.players.indexOf(playerId);
  const getPlayer = (offset) => {
    const idx = (myIndex + offset) % 3;
    const pid = gameState.players[idx];
    const p = players.find((pl) => pl.id === pid);
    return {
      id: pid,
      nickname: p?.nickname || `玩家${idx + 1}`,
      cardCount: playerCardCounts?.[pid] || 0,
      isLandlord: pid === landlord,
      isCurrent: currentTurn === idx,
      isMe: pid === playerId,
    };
  };

  const me = getPlayer(0);
  const left = getPlayer(1);
  const right = getPlayer(2);

  const getRecentPlay = (pid) => {
    if (!playHistory) return null;
    for (let i = playHistory.length - 1; i >= 0; i--) {
      if (playHistory[i].playerId === pid) return playHistory[i];
    }
    return null;
  };

  const toggleCard = useCallback(
    (cardId) => {
      if (!isMyTurn || phase !== 'playing') return;
      setSelectedCards((prev) => {
        const next = new Set(prev);
        next.has(cardId) ? next.delete(cardId) : next.add(cardId);
        return next;
      });
    },
    [isMyTurn, phase]
  );

  const handleBid = useCallback((score) => onAction({ type: 'bid', score }), [onAction]);

  const handlePlay = useCallback(() => {
    if (selectedCards.size === 0) {
      setError('请先选牌');
      setTimeout(() => setError(''), 2000);
      return;
    }
    onAction({ type: 'play', cards: myHand.filter((c) => selectedCards.has(c.id)) });
  }, [selectedCards, myHand, onAction]);

  const handlePass = useCallback(() => onAction({ type: 'pass' }), [onAction]);

  const canPass = isMyTurn && lastPlayedBy && lastPlayedBy !== playerId;

  const renderPlayedCards = (pid) => {
    const rp = getRecentPlay(pid);
    if (!rp) return null;
    if (rp.action === 'play') {
      return (
        <div className="dz-played-row">
          {rp.cards.map((c) => <Card key={c.id} card={c} small />)}
        </div>
      );
    }
    if (rp.action === 'pass') return <span className="dz-pass-text">不出</span>;
    return null;
  };

  return (
    <div className="dz">
      {/* 牌桌 */}
      <div className="dz-table">
        {/* 顶部信息 */}
        <div className="dz-top-info">
          <span className="dz-room-tag">房间 {roomId?.slice(-6)}</span>
          {landlord && (
            <span className="dz-landlord-tag">
              👑 地主: {getPlayer(gameState.players.indexOf(landlord)).nickname}
            </span>
          )}
          {highestBid > 0 && <span className="dz-bid-tag">底分: {highestBid}</span>}
        </div>

        {/* 三个玩家区域 */}
        <div className="dz-table-body">
          <div className="dz-seat-left">
            <PlayerPanel player={left} bid={bids?.[left.id]} isPassing={passAnimation === left.id} />
          </div>

          <div className="dz-center">
            {/* 底牌 */}
            {phase === 'playing' && kitty && (
              <div className="dz-kitty-row">
                {kitty.map((c) => <Card key={c.id} card={c} small />)}
              </div>
            )}

            {/* 叫分阶段 */}
            {phase === 'bidding' && (
              <BiddingPanel
                isMyTurn={isMyTurn && bids?.[playerId] === undefined}
                highestBid={highestBid}
                bids={bids}
                players={gameState.players}
                getPlayer={getPlayer}
                onBid={handleBid}
              />
            )}

            {/* 出牌区域 */}
            {phase === 'playing' && (
              <div className="dz-play-zone">
                <div className="dz-play-side">{renderPlayedCards(left.id)}</div>
                {lastPlay && (
                  <div className="dz-play-info">
                    <span className="dz-card-type-name">
                      {CARD_TYPE_NAMES[lastPlay.cardType?.type] || ''}
                    </span>
                  </div>
                )}
                <div className="dz-play-side">{renderPlayedCards(right.id)}</div>
              </div>
            )}

            {error && <div className="dz-error">{error}</div>}
          </div>

          <div className="dz-seat-right">
            <PlayerPanel player={right} bid={bids?.[right.id]} isPassing={passAnimation === right.id} />
          </div>
        </div>

        {/* 底部 */}
        <div className="dz-bottom">
          {phase === 'playing' && renderPlayedCards(playerId) && (
            <div className="dz-my-played">{renderPlayedCards(playerId)}</div>
          )}

          {phase === 'playing' && isMyTurn && (
            <div className="dz-actions">
              {canPass && (
                <button className="dz-action-pass" onClick={handlePass}>不出</button>
              )}
              <button className="dz-action-play" onClick={handlePlay}>出牌</button>
            </div>
          )}

          {landlord && (
            <div className="dz-my-role">
              {isLandlord ? '👑 地主' : '🌾 农民'} · {me.cardCount} 张
            </div>
          )}
        </div>
      </div>

      {/* 手牌区域 */}
      <div className="dz-hand">
        <div className="dz-hand-cards">
          {myHand?.map((card, i) => (
            <div key={card.id} className="dz-hand-card-wrap" style={{ zIndex: i }}>
              <Card
                card={card}
                selected={selectedCards.has(card.id)}
                onClick={() => toggleCard(card.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
