import { useState, useEffect, useCallback } from 'react';

// 花色颜色
const SUIT_COLORS = {
  wan: '#dc2626',   // 万 - 红
  tiao: '#16a34a',  // 条 - 绿
  tong: '#2563eb',  // 筒 - 蓝
};

// 风牌/箭牌颜色
const SPECIAL_COLORS = {
  dong: '#1e40af',
  nan: '#dc2626',
  xi: '#374151',
  bei: '#16a34a',
  zhong: '#dc2626',
  fa: '#16a34a',
  bai: '#6b7280',
};

// 花色符号
const SUIT_SYMBOLS = {
  wan: '万',
  tiao: '条',
  tong: '筒',
};

// 数字转中文
const NUM_CN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 麻将牌组件
 */
function MjTile({ tile, onClick, selected, small, faceDown, highlight }) {
  if (faceDown) {
    return (
      <div className={`mj-tile${small ? ' mj-tile-sm' : ''} mj-tile-back`}>
        <div className="mj-tile-back-pattern" />
      </div>
    );
  }

  if (!tile) return null;

  const isNumber = tile.type === 'number';
  const isWind = tile.type === 'wind';
  const isDragon = tile.type === 'dragon';

  let color = '#1e293b';
  let line1 = '';
  let line2 = '';

  if (isNumber) {
    color = SUIT_COLORS[tile.suit] || '#1e293b';
    line1 = NUM_CN[tile.number];
    line2 = SUIT_SYMBOLS[tile.suit];
  } else if (isWind) {
    color = SPECIAL_COLORS[tile.wind] || '#1e293b';
    line1 = tile.display;
    line2 = '';
  } else if (isDragon) {
    color = SPECIAL_COLORS[tile.dragon] || '#1e293b';
    line1 = tile.display;
    line2 = '';
  }

  return (
    <div
      className={`mj-tile${small ? ' mj-tile-sm' : ''}${selected ? ' mj-tile-selected' : ''}${highlight ? ' mj-tile-highlight' : ''}`}
      onClick={onClick}
      style={{ color }}
    >
      <div className="mj-tile-inner">
        <span className="mj-tile-text">{line1}</span>
        {line2 && <span className="mj-tile-suit">{line2}</span>}
      </div>
    </div>
  );
}

/**
 * 玩家面板（对手）
 */
function OpponentPanel({ player, melds, discards, isCurrent, isDealer }) {
  return (
    <div className={`mj-opponent${isCurrent ? ' mj-opponent-active' : ''}`}>
      <div className="mj-opponent-header">
        <span className="mj-opponent-icon">{isDealer ? '🅰️' : '👤'}</span>
        <span className="mj-opponent-name">{player.nickname}</span>
        <span className="mj-opponent-count">{player.cardCount}张</span>
      </div>

      {/* 明牌 */}
      {melds && melds.length > 0 && (
        <div className="mj-opponent-melds">
          {melds.map((meld, i) => (
            <div key={i} className="mj-meld-group">
              {meld.tiles.map((t, j) => (
                <MjTile key={t.id || j} tile={t} small />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 弃牌 */}
      {discards && discards.length > 0 && (
        <div className="mj-opponent-discards">
          {discards.slice(-10).map((t, i) => (
            <MjTile key={t.id || i} tile={t} small />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 麻将游戏主组件
 */
export default function MahjongGame({ socket, roomId, playerId, gameState, onAction, players }) {
  const [selectedTile, setSelectedTile] = useState(null);
  const [error, setError] = useState('');
  const [actionHint, setActionHint] = useState(null);

  // 监听 action_hint
  useEffect(() => {
    if (!socket) return;
    const handleHint = (data) => setActionHint(data);
    const handleError = (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 2500);
    };
    socket.on('action_hint', handleHint);
    socket.on('error', handleError);
    return () => {
      socket.off('action_hint', handleHint);
      socket.off('error', handleError);
    };
  }, [socket]);

  // 状态变化时重置选择
  useEffect(() => {
    setSelectedTile(null);
    setActionHint(null);
  }, [gameState?.currentTurn]);

  if (!gameState) {
    return (
      <div className="mj-loading">
        <div className="mj-loading-spinner">🀄</div>
        <p>等待游戏数据...</p>
      </div>
    );
  }

  const {
    myHand, handCounts, melds, discards, wallCount,
    currentTurn, dealer, lastDiscard, waitingAction,
  } = gameState;

  const isMyTurn = gameState.players[currentTurn] === playerId;
  const myIndex = gameState.players.indexOf(playerId);

  // 获取相对位置的玩家
  const getPlayer = (offset) => {
    const idx = (myIndex + offset) % 4;
    const pid = gameState.players[idx];
    const p = players.find((pl) => pl.id === pid);
    return {
      id: pid,
      nickname: p?.nickname || `玩家${idx + 1}`,
      cardCount: handCounts?.[pid] || 0,
      isDealer: idx === dealer,
      isCurrent: currentTurn === idx,
    };
  };

  const right = getPlayer(1);
  const top = getPlayer(2);
  const left = getPlayer(3);

  // 打牌
  const handleDiscard = useCallback((tile) => {
    if (!isMyTurn) return;
    setSelectedTile(null);
    onAction({ type: 'discard', tile });
  }, [isMyTurn, onAction]);

  // 点击手牌
  const handleTileClick = useCallback((tile) => {
    if (!isMyTurn) return;
    if (selectedTile?.id === tile.id) {
      // 双击打出
      handleDiscard(tile);
    } else {
      setSelectedTile(tile);
    }
  }, [isMyTurn, selectedTile, handleDiscard]);

  // 响应操作
  const handleResponse = useCallback((type, extra = {}) => {
    onAction({ type, ...extra });
    setActionHint(null);
  }, [onAction]);

  // 是否有等待响应的操作
  const myWaitingAction = waitingAction?.responders?.find(r => r.pid === playerId);
  const showActions = myWaitingAction || actionHint;

  return (
    <div className="mj">
      {/* 牌桌 */}
      <div className="mj-table">
        {/* 顶部信息 */}
        <div className="mj-top-bar">
          <span className="mj-info-tag">剩余 {wallCount} 张</span>
          {lastDiscard && (
            <span className="mj-info-tag">
              最后打出: {lastDiscard.display}
            </span>
          )}
          <span className="mj-info-tag">
            {isMyTurn ? '🟢 轮到你' : `⏳ ${players.find(p => p.id === gameState.players[currentTurn])?.nickname || ''}`}
          </span>
        </div>

        {/* 牌桌主体 - 4个方位 */}
        <div className="mj-board">
          {/* 对面 */}
          <div className="mj-seat-top">
            <OpponentPanel
              player={top}
              melds={melds?.[top.id]}
              discards={discards?.[top.id]}
              isCurrent={top.isCurrent}
              isDealer={top.isDealer}
            />
          </div>

          {/* 左边 */}
          <div className="mj-seat-left">
            <OpponentPanel
              player={left}
              melds={melds?.[left.id]}
              discards={discards?.[left.id]}
              isCurrent={left.isCurrent}
              isDealer={left.isDealer}
            />
          </div>

          {/* 中央 - 弃牌池 */}
          <div className="mj-center">
            <div className="mj-discard-pool">
              {/* 自己的弃牌 */}
              {discards?.[playerId] && discards[playerId].length > 0 && (
                <div className="mj-my-discards">
                  {discards[playerId].slice(-10).map((t, i) => (
                    <MjTile key={t.id || i} tile={t} small />
                  ))}
                </div>
              )}
            </div>
            {error && <div className="mj-error">{error}</div>}
          </div>

          {/* 右边 */}
          <div className="mj-seat-right">
            <OpponentPanel
              player={right}
              melds={melds?.[right.id]}
              discards={discards?.[right.id]}
              isCurrent={right.isCurrent}
              isDealer={right.isDealer}
            />
          </div>
        </div>

        {/* 我的明牌 */}
        {melds?.[playerId] && melds[playerId].length > 0 && (
          <div className="mj-my-melds">
            <span className="mj-melds-label">副露:</span>
            {melds[playerId].map((meld, i) => (
              <div key={i} className="mj-meld-group">
                {meld.tiles.map((t, j) => (
                  <MjTile key={t.id || j} tile={t} small />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 操作按钮 */}
        {showActions && (
          <div className="mj-actions">
            {actionHint?.actions?.includes('win') && (
              <button className="mj-action-btn mj-action-win" onClick={() => handleResponse('win')}>
                🏆 自摸
              </button>
            )}
            {myWaitingAction?.actions?.includes('win') && (
              <button className="mj-action-btn mj-action-win" onClick={() => handleResponse('win')}>
                🏆 和牌
              </button>
            )}
            {myWaitingAction?.actions?.includes('pung') && (
              <button className="mj-action-btn mj-action-pung" onClick={() => handleResponse('pung')}>
               碰
              </button>
            )}
            {myWaitingAction?.actions?.includes('kong') && (
              <button className="mj-action-btn mj-action-kong" onClick={() => handleResponse('kong')}>
                杠
              </button>
            )}
            {actionHint?.actions?.includes('kong') && (
              <button className="mj-action-btn mj-action-kong" onClick={() => handleResponse('kong', { concealed: true })}>
                暗杠
              </button>
            )}
            {myWaitingAction?.actions?.includes('chow') && (
              <button className="mj-action-btn mj-action-chow" onClick={() => handleResponse('chow', { tiles: [] })}>
                吃
              </button>
            )}
            {(myWaitingAction || actionHint) && (
              <button className="mj-action-btn mj-action-pass" onClick={() => handleResponse('pass')}>
                过
              </button>
            )}
          </div>
        )}
      </div>

      {/* 我的手牌 */}
      <div className="mj-hand">
        <div className="mj-hand-tiles">
          {myHand?.map((tile, i) => (
            <div key={tile.id} className="mj-hand-wrap" style={{ zIndex: i }}>
              <MjTile
                tile={tile}
                selected={selectedTile?.id === tile.id}
                highlight={isMyTurn}
                onClick={() => handleTileClick(tile)}
              />
            </div>
          ))}
        </div>
        {isMyTurn && <p className="mj-hand-hint">点击选牌，双击打出</p>}
      </div>
    </div>
  );
}
