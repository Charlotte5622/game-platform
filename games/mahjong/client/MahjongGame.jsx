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

// 风向
const WINDS = ['东', '南', '西', '北'];
const WIND_COLORS = { '东': '#dc2626', '南': '#2563eb', '西': '#16a34a', '北': '#7c3aed' };

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
 * 玩家面板 — 支持 normal / compact(side) 两种模式
 */
function OpponentPanel({ player, melds, isCurrent, wind, compact }) {
  if (compact) {
    // 竖屏侧边紧凑模式
    return (
      <div className={`mj-side-panel${isCurrent ? ' mj-side-active' : ''}`}>
        <div className="mj-side-wind" style={{ color: WIND_COLORS[wind] }}>{wind}</div>
        <div className="mj-side-name">{player.nickname}</div>
        <div className="mj-side-count">{player.cardCount}张</div>
        {melds && melds.length > 0 && (
          <div className="mj-side-melds">{melds.length}副</div>
        )}
      </div>
    );
  }

  // 正常模式（对面 / 桌面左右）
  return (
    <div className={`mj-opponent${isCurrent ? ' mj-opponent-active' : ''}`}>
      <div className="mj-opponent-header">
        <span className="mj-wind-badge" style={{ background: WIND_COLORS[wind] }}>{wind}</span>
        <span className="mj-opponent-name">{player.nickname}</span>
        <span className="mj-opponent-count">{player.cardCount}张</span>
      </div>
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
  const [responseData, setResponseData] = useState(null);
  const [showChowPicker, setShowChowPicker] = useState(false);

  // 监听 action_hint + action_required
  useEffect(() => {
    if (!socket) return;
    const handleHint = (data) => setActionHint(data);
    const handleActionRequired = (data) => {
      setResponseData({ actions: data.actions, chowOptions: data.chowOptions || null });
    };
    const handleError = (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 2500);
    };
    socket.on('action_hint', handleHint);
    socket.on('action_required', handleActionRequired);
    socket.on('error', handleError);
    return () => {
      socket.off('action_hint', handleHint);
      socket.off('action_required', handleActionRequired);
      socket.off('error', handleError);
    };
  }, [socket]);

  // 状态变化时重置选择
  useEffect(() => {
    setSelectedTile(null);
    setActionHint(null);
    setResponseData(null);
    setShowChowPicker(false);
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
    currentTurn, dealer, lastDiscard,
  } = gameState;

  const isMyTurn = gameState.players[currentTurn] === playerId;
  const myIndex = gameState.players.indexOf(playerId);

  // 获取相对位置的玩家 + 风向
  const getPlayer = (offset) => {
    const idx = (myIndex + offset) % 4;
    const pid = gameState.players[idx];
    const p = players.find((pl) => pl.id === pid);
    const wind = WINDS[(idx - dealer + 4) % 4];
    return {
      id: pid,
      nickname: p?.nickname || `玩家${idx + 1}`,
      cardCount: handCounts?.[pid] || 0,
      isDealer: idx === dealer,
      isCurrent: currentTurn === idx,
      wind,
    };
  };

  const right = getPlayer(1);   // 右边 → 下家
  const top = getPlayer(2);     // 对面 → 对家
  const left = getPlayer(3);    // 左边 → 上家
  const myWind = WINDS[(myIndex - dealer + 4) % 4];

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
      handleDiscard(tile);
    } else {
      setSelectedTile(tile);
    }
  }, [isMyTurn, selectedTile, handleDiscard]);

  // 响应操作
  const handleResponse = useCallback((type, extra = {}) => {
    onAction({ type, ...extra });
    setActionHint(null);
    setResponseData(null);
    setShowChowPicker(false);
  }, [onAction]);

  const responseActions = responseData?.actions || [];
  const hasResponse = responseActions.length > 0;
  const hasDrawAction = actionHint && actionHint.actions?.some(a => a !== 'discard');
  const showActions = hasResponse || hasDrawAction;

  return (
    <div className="mj">
      {/* 牌桌 */}
      <div className="mj-table">
        {/* 顶部信息栏 */}
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

        {/* 四方位牌桌 */}
        <div className="mj-board">
          {/* 对面 (北) */}
          <div className="mj-seat-top">
            <OpponentPanel
              player={top}
              melds={melds?.[top.id]}
              isCurrent={top.isCurrent}
              wind={top.wind}
            />
          </div>

          {/* 左边 (西) — 竖屏用compact */}
          <div className="mj-seat-left">
            <div className="mj-seat-left-normal">
              <OpponentPanel
                player={left}
                melds={melds?.[left.id]}
                isCurrent={left.isCurrent}
                wind={left.wind}
              />
            </div>
            <div className="mj-seat-left-compact">
              <OpponentPanel
                player={left}
                melds={melds?.[left.id]}
                isCurrent={left.isCurrent}
                wind={left.wind}
                compact
              />
            </div>
          </div>

          {/* 中央 — 弃牌池 */}
          <div className="mj-center">
            <div className="mj-discard-pool">
              {/* 北家弃牌 */}
              {discards?.[top.id] && discards[top.id].length > 0 && (
                <div className="mj-discard-row">
                  <span className="mj-discard-label" style={{ color: WIND_COLORS[top.wind] }}>{top.wind}</span>
                  {discards[top.id].slice(-8).map((t, i) => (
                    <MjTile key={t.id || i} tile={t} small />
                  ))}
                </div>
              )}
              {/* 西家弃牌 */}
              {discards?.[left.id] && discards[left.id].length > 0 && (
                <div className="mj-discard-row">
                  <span className="mj-discard-label" style={{ color: WIND_COLORS[left.wind] }}>{left.wind}</span>
                  {discards[left.id].slice(-8).map((t, i) => (
                    <MjTile key={t.id || i} tile={t} small />
                  ))}
                </div>
              )}
              {/* 东家弃牌 */}
              {discards?.[right.id] && discards[right.id].length > 0 && (
                <div className="mj-discard-row">
                  <span className="mj-discard-label" style={{ color: WIND_COLORS[right.wind] }}>{right.wind}</span>
                  {discards[right.id].slice(-8).map((t, i) => (
                    <MjTile key={t.id || i} tile={t} small />
                  ))}
                </div>
              )}
              {/* 南家弃牌(我) */}
              {discards?.[playerId] && discards[playerId].length > 0 && (
                <div className="mj-discard-row mj-discard-mine">
                  <span className="mj-discard-label" style={{ color: WIND_COLORS[myWind] }}>{myWind}</span>
                  {discards[playerId].slice(-8).map((t, i) => (
                    <MjTile key={t.id || i} tile={t} small />
                  ))}
                </div>
              )}
            </div>
            {error && <div className="mj-error">{error}</div>}
          </div>

          {/* 右边 (东) — 竖屏用compact */}
          <div className="mj-seat-right">
            <div className="mj-seat-right-normal">
              <OpponentPanel
                player={right}
                melds={melds?.[right.id]}
                isCurrent={right.isCurrent}
                wind={right.wind}
              />
            </div>
            <div className="mj-seat-right-compact">
              <OpponentPanel
                player={right}
                melds={melds?.[right.id]}
                isCurrent={right.isCurrent}
                wind={right.wind}
                compact
              />
            </div>
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
        {showActions && !showChowPicker && (
          <div className="mj-actions">
            {responseActions.includes('win') && (
              <button className="mj-action-btn mj-action-win" onClick={() => handleResponse('win')}>🏆 和牌</button>
            )}
            {responseActions.includes('pung') && (
              <button className="mj-action-btn mj-action-pung" onClick={() => handleResponse('pung')}>碰</button>
            )}
            {responseActions.includes('kong') && (
              <button className="mj-action-btn mj-action-kong" onClick={() => handleResponse('kong')}>杠</button>
            )}
            {responseActions.includes('chow') && (
              <button className="mj-action-btn mj-action-chow" onClick={() => setShowChowPicker(true)}>吃</button>
            )}
            {actionHint?.actions?.includes('win') && (
              <button className="mj-action-btn mj-action-win" onClick={() => handleResponse('win')}>🏆 自摸</button>
            )}
            {actionHint?.actions?.includes('kong') && (
              <button className="mj-action-btn mj-action-kong" onClick={() => handleResponse('kong', { concealed: true })}>暗杠</button>
            )}
            {hasResponse && (
              <button className="mj-action-btn mj-action-pass" onClick={() => handleResponse('pass')}>过</button>
            )}
          </div>
        )}

        {/* 吃牌选择器 */}
        {showChowPicker && responseData?.chowOptions && (
          <div className="mj-actions mj-chow-picker">
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>选择吃法：</span>
            {responseData.chowOptions.map((option, i) => (
              <button
                key={i}
                className="mj-action-btn mj-action-chow"
                onClick={() => handleResponse('chow', { tiles: option })}
              >
                {option.map(t => t.display).join(' ')}
              </button>
            ))}
            <button className="mj-action-btn mj-action-pass" onClick={() => { setShowChowPicker(false); handleResponse('pass'); }}>取消</button>
          </div>
        )}
      </div>

      {/* 我的手牌 */}
      <div className="mj-hand">
        <div className="mj-hand-bar">
          <span className="mj-my-wind" style={{ color: WIND_COLORS[myWind] }}>{myWind}</span>
          <span className="mj-my-label">我的手牌</span>
        </div>
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
