import { useState, useEffect, useCallback } from 'react';

/**
 * 斗地主游戏 React 组件
 *
 * Props:
 * - socket: Socket.IO 连接
 * - roomId: 房间 ID
 * - playerId: 当前玩家 ID
 * - gameState: 游戏状态
 * - onAction: 发送操作的回调
 * - players: 房间内玩家列表
 */
export default function DoudizhuGame({ socket, roomId, playerId, gameState, onAction, players }) {
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [message, setMessage] = useState('');

  // 重置选择（当游戏状态变化时）
  useEffect(() => {
    setSelectedCards(new Set());
  }, [gameState?.currentTurn]);

  if (!gameState) {
    return <div style={styles.loading}>等待游戏数据...</div>;
  }

  const { myHand, phase, landlord, currentTurn, lastPlay, playerCardCounts, kitty, highestBid } = gameState;
  const isMyTurn = gameState.players[currentTurn] === playerId;
  const isLandlord = landlord === playerId;

  // 切换选牌
  const toggleCard = useCallback((cardId) => {
    if (!isMyTurn || phase !== 'playing') return;
    setSelectedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, [isMyTurn, phase]);

  // 叫分
  const handleBid = useCallback((score) => {
    onAction({ type: 'bid', score });
  }, [onAction]);

  // 出牌
  const handlePlay = useCallback(() => {
    if (selectedCards.size === 0) {
      setMessage('请先选牌');
      setTimeout(() => setMessage(''), 2000);
      return;
    }
    const cards = myHand.filter(c => selectedCards.has(c.id));
    onAction({ type: 'play', cards });
  }, [selectedCards, myHand, onAction]);

  // 过牌
  const handlePass = useCallback(() => {
    onAction({ type: 'pass' });
  }, [onAction]);

  // 获取玩家位置信息
  const getPlayerInfo = (index) => {
    const pid = gameState.players[index];
    const player = players.find(p => p.id === pid);
    return {
      id: pid,
      nickname: player?.nickname || `玩家${index + 1}`,
      cardCount: playerCardCounts?.[pid] || 0,
      isLandlord: pid === landlord,
      isCurrent: currentTurn === index,
    };
  };

  // 找到当前玩家的索引
  const myIndex = gameState.players.indexOf(playerId);
  // 对面玩家（相对位置）
  const leftPlayer = getPlayerInfo((myIndex + 1) % 3);
  const rightPlayer = getPlayerInfo((myIndex + 2) % 3);

  return (
    <div style={styles.container}>
      {/* 顶部信息栏 */}
      <div style={styles.topBar}>
        <span>房间: {roomId}</span>
        {landlord && <span>地主: {getPlayerInfo(gameState.players.indexOf(landlord)).nickname}</span>}
        {highestBid > 0 && <span>叫分: {highestBid}</span>}
      </div>

      {/* 游戏主体 */}
      <div style={styles.gameArea}>
        {/* 左边玩家 */}
        <div style={styles.sidePlayer}>
          <div style={{
            ...styles.playerInfo,
            borderColor: leftPlayer.isCurrent ? 'var(--secondary)' : 'var(--border)',
          }}>
            <span style={styles.playerName}>
              {leftPlayer.nickname}
              {leftPlayer.isLandlord && ' 👑'}
            </span>
            <span style={styles.cardCount}>{leftPlayer.cardCount} 张</span>
          </div>
        </div>

        {/* 中央区域 */}
        <div style={styles.centerArea}>
          {/* 底牌 */}
          {phase === 'playing' && kitty && (
            <div style={styles.kittyArea}>
              <span style={styles.kittyLabel}>底牌: </span>
              {kitty.map(card => (
                <span key={card.id} style={styles.kittyCard}>{card.display}</span>
              ))}
            </div>
          )}

          {/* 叫分阶段 */}
          {phase === 'bidding' && (
            <div style={styles.bidArea}>
              <h3 style={styles.bidTitle}>叫地主</h3>
              {isMyTurn && !gameState.bids?.[playerId] ? (
                <div style={styles.bidButtons}>
                  <button style={styles.passBtn} onClick={() => handleBid(0)}>不叫</button>
                  {highestBid < 1 && <button style={styles.bidBtn} onClick={() => handleBid(1)}>1分</button>}
                  {highestBid < 2 && <button style={styles.bidBtn} onClick={() => handleBid(2)}>2分</button>}
                  {highestBid < 3 && <button style={styles.bidBtn} onClick={() => handleBid(3)}>3分</button>}
                </div>
              ) : (
                <p style={styles.waitText}>
                  {isMyTurn ? '等待其他玩家叫分...' : `等待 ${getPlayerInfo(currentTurn).nickname} 叫分`}
                </p>
              )}
            </div>
          )}

          {/* 上一手牌 */}
          {phase === 'playing' && lastPlay && (
            <div style={styles.lastPlayArea}>
              <span style={styles.lastPlayLabel}>
                {lastPlay.playerId === playerId ? '你出的:' : `${getPlayerInfo(gameState.players.indexOf(lastPlay.playerId)).nickname} 出的:`}
              </span>
              <div style={styles.playedCards}>
                {lastPlay.cards.map(card => (
                  <span key={card.id} style={styles.playedCard}>{card.display}</span>
                ))}
              </div>
            </div>
          )}

          {/* 消息提示 */}
          {message && <div style={styles.message}>{message}</div>}
        </div>

        {/* 右边玩家 */}
        <div style={styles.sidePlayer}>
          <div style={{
            ...styles.playerInfo,
            borderColor: rightPlayer.isCurrent ? 'var(--secondary)' : 'var(--border)',
          }}>
            <span style={styles.playerName}>
              {rightPlayer.nickname}
              {rightPlayer.isLandlord && ' 👑'}
            </span>
            <span style={styles.cardCount}>{rightPlayer.cardCount} 张</span>
          </div>
        </div>
      </div>

      {/* 手牌区域 */}
      <div style={styles.handArea}>
        <div style={styles.handCards}>
          {myHand?.map(card => (
            <div
              key={card.id}
              style={{
                ...styles.card,
                ...(selectedCards.has(card.id) ? styles.cardSelected : {}),
                background: card.suit === '♥' || card.suit === '♦' ? '#c0392b' : '#2c3e50',
              }}
              onClick={() => toggleCard(card.id)}
            >
              <span style={styles.cardRank}>{card.rank}</span>
              {card.suit && <span style={styles.cardSuit}>{card.suit}</span>}
              {card.rank === 'JOKER_S' && <span style={styles.jokerSmall}>小王</span>}
              {card.rank === 'JOKER_B' && <span style={styles.jokerBig}>大王</span>}
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      {phase === 'playing' && isMyTurn && (
        <div style={styles.actionBar}>
          {lastPlay && lastPlay.playerId !== playerId && (
            <button style={styles.passActionBtn} onClick={handlePass}>不出</button>
          )}
          <button style={styles.playActionBtn} onClick={handlePlay}>出牌</button>
        </div>
      )}

      {/* 角色标识 */}
      {isLandlord && <div style={styles.roleTag}>👑 地主</div>}
      {!isLandlord && landlord && <div style={styles.roleTag}>🌾 农民</div>}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    maxWidth: '900px',
    margin: '0 auto',
    position: 'relative',
    minHeight: 'calc(100vh - 64px)',
    display: 'flex',
    flexDirection: 'column',
  },
  loading: {
    textAlign: 'center',
    padding: '100px 20px',
    color: 'var(--text-muted)',
  },
  topBar: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '12px',
    background: 'var(--bg-card)',
    borderRadius: 'var(--radius)',
    marginBottom: '16px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  gameArea: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    minHeight: '200px',
  },
  sidePlayer: {
    width: '120px',
    textAlign: 'center',
  },
  playerInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    background: 'var(--bg-card)',
    border: '2px solid var(--border)',
    borderRadius: 'var(--radius)',
  },
  playerName: {
    fontWeight: '600',
    fontSize: '14px',
  },
  cardCount: {
    fontSize: '12px',
    color: 'var(--text-muted)',
  },
  centerArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
  },
  kittyArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
  },
  kittyLabel: {
    color: 'var(--text-muted)',
  },
  kittyCard: {
    padding: '4px 8px',
    background: 'var(--bg-input)',
    borderRadius: '6px',
    fontSize: '12px',
  },
  bidArea: {
    textAlign: 'center',
  },
  bidTitle: {
    marginBottom: '16px',
    fontSize: '20px',
  },
  bidButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  passBtn: {
    padding: '10px 24px',
    background: 'var(--bg-input)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    fontWeight: '600',
  },
  bidBtn: {
    padding: '10px 24px',
    background: 'var(--warning)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '14px',
    fontWeight: '600',
  },
  waitText: {
    color: 'var(--text-muted)',
    fontSize: '14px',
  },
  lastPlayArea: {
    textAlign: 'center',
  },
  lastPlayLabel: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    display: 'block',
    marginBottom: '8px',
  },
  playedCards: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  playedCard: {
    padding: '6px 10px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '600',
  },
  message: {
    padding: '8px 16px',
    background: 'rgba(231, 76, 60, 0.2)',
    color: 'var(--danger)',
    borderRadius: '8px',
    fontSize: '13px',
  },
  handArea: {
    padding: '16px 0',
    overflowX: 'auto',
  },
  handCards: {
    display: 'flex',
    gap: '6px',
    justifyContent: 'center',
    flexWrap: 'wrap',
    padding: '8px',
  },
  card: {
    width: '56px',
    height: '80px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.15s',
    color: 'white',
    fontWeight: '700',
    userSelect: 'none',
    border: '2px solid transparent',
  },
  cardSelected: {
    transform: 'translateY(-12px)',
    borderColor: 'var(--secondary)',
    boxShadow: '0 0 12px rgba(0, 206, 201, 0.5)',
  },
  cardRank: {
    fontSize: '18px',
    lineHeight: 1,
  },
  cardSuit: {
    fontSize: '14px',
    marginTop: '2px',
  },
  jokerSmall: {
    fontSize: '12px',
    color: '#2ecc71',
  },
  jokerBig: {
    fontSize: '12px',
    color: '#e74c3c',
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    padding: '16px',
  },
  passActionBtn: {
    padding: '12px 32px',
    background: 'var(--bg-input)',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    fontSize: '15px',
    fontWeight: '600',
  },
  playActionBtn: {
    padding: '12px 40px',
    background: 'var(--primary)',
    color: 'white',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: '15px',
    fontWeight: '700',
  },
  roleTag: {
    position: 'fixed',
    top: '80px',
    right: '20px',
    padding: '8px 16px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    fontSize: '14px',
    fontWeight: '600',
  },
};
