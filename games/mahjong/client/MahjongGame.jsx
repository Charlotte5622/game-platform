import { useState, useEffect, useCallback, useRef } from 'react';
import { RiCloseLine } from '@remixicon/react';
import { playSound } from '../../../client/src/services/sounds';

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
          <div className="mj-side-melds">
            {melds.map((meld, i) => (
              <div key={i} className="mj-side-meld-group">
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
 * 记牌器组件
 * 显示每种牌剩余未出现的数量
 */
function TileCounter({ allTileTypes, myHand, discards, melds, visible }) {
  if (!visible || !allTileTypes) return null;

  // 统计已出现的牌（手牌 + 弃牌 + 明牌）
  const seenCount = {};
  const addSeen = (tiles) => {
    if (!tiles) return;
    for (const t of tiles) {
      const key = t.display;
      seenCount[key] = (seenCount[key] || 0) + 1;
    }
  };

  addSeen(myHand);
  if (discards) {
    for (const pid of Object.keys(discards)) {
      addSeen(discards[pid]);
    }
  }
  if (melds) {
    for (const pid of Object.keys(melds)) {
      for (const meld of (melds[pid] || [])) {
        addSeen(meld.tiles);
      }
    }
  }

  // 按花色分组
  const groups = { wan: [], tiao: [], tong: [], wind: [], dragon: [] };
  for (const tileType of allTileTypes) {
    const key = tileType.display;
    const total = tileType.count || 4;
    const used = seenCount[key] || 0;
    const remaining = total - used;
    if (tileType.type === 'number') {
      groups[tileType.suit].push({ display: key, remaining, color: SUIT_COLORS[tileType.suit] });
    } else if (tileType.type === 'wind') {
      groups.wind.push({ display: key, remaining, color: SPECIAL_COLORS[tileType.wind] || '#1e293b' });
    } else if (tileType.type === 'dragon') {
      groups.dragon.push({ display: key, remaining, color: SPECIAL_COLORS[tileType.dragon] || '#1e293b' });
    }
  }

  const groupLabels = { wan: '万', tiao: '条', tong: '筒', wind: '风', dragon: '箭' };

  return (
    <div className="mj-tile-counter">
      <div className="mj-tile-counter-title">记牌器</div>
      {Object.entries(groups).map(([groupKey, tiles]) => (
        tiles.length > 0 && (
          <div key={groupKey} className="mj-tc-group">
            <span className="mj-tc-group-label">{groupLabels[groupKey]}</span>
            {tiles.map((t, i) => (
              <span key={i} className="mj-tc-item" style={{ color: t.remaining > 0 ? t.color : '#64748b' }}>
                <span className="mj-tc-name">{t.display}</span>
                <span className="mj-tc-count">{t.remaining}</span>
              </span>
            ))}
          </div>
        )
      ))}
    </div>
  );
}

/**
 * 麻将游戏主组件
 */
export default function MahjongGame({ socket, roomId, playerId, gameState, onAction, players, onLeaveRoom }) {
  const [selectedTile, setSelectedTile] = useState(null);
  const [error, setError] = useState('');
  const [actionHint, setActionHint] = useState(null);
  const [responseData, setResponseData] = useState(null);
  const [showChowPicker, setShowChowPicker] = useState(false);
  const [showTileCounter, setShowTileCounter] = useState(false);
  const [actionEffect, setActionEffect] = useState(null);
  const processedEvents = useRef(new Set());

  // 监听 action_hint + action_required
  useEffect(() => {
    if (!socket) return;
    const handleHint = (data) => {
      setActionHint(data);
      setResponseData(null); // 互斥：新提示清除旧响应
    };
    const handleActionRequired = (data) => {
      setResponseData({ actions: data.actions, chowOptions: data.chowOptions || null });
      setActionHint(null); // 互斥：新响应清除旧提示
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

  // 听碰/杠/吃动作，显示特效 + 播放语音
  useEffect(() => {
    if (!socket) return;
    const ACTION_LABELS = { pung: '碰！', kong: '杠！', chow: '吃！' };
    const handleAction = (data) => {
      if (!ACTION_LABELS[data.type]) return;
      const eventKey = `${data.type}_${data.playerId}_${gameState?.currentTurn}`;
      if (processedEvents.current.has(eventKey)) return;
      processedEvents.current.add(eventKey);
      setActionEffect(ACTION_LABELS[data.type]);
      playSound('mahjong', data.type);
      setTimeout(() => setActionEffect(null), 1500);
    };
    const handleWin = (data) => {
      const isSelf = String(data.playerId) === String(playerId);
      playSound('mahjong', isSelf ? 'zimo' : 'win');
    };
    socket.on('pung', handleAction);
    socket.on('kong', handleAction);
    socket.on('chow', handleAction);
    socket.on('win', handleWin);
    return () => {
      socket.off('pung', handleAction);
      socket.off('kong', handleAction);
      socket.off('chow', handleAction);
      socket.off('win', handleWin);
    };
  }, [socket, gameState?.currentTurn]);

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
    currentTurn, dealer, lastDiscard, allTileTypes,
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
      {/* 电脑端退出按钮 */}
      {onLeaveRoom && <button className="game-exit-btn" onClick={onLeaveRoom} title="退出游戏"><RiCloseLine size={18} /></button>}

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

          {/* 牌桌中央区域 — 每家最后一张弃牌 */}
          <div className="mj-table-area">
            {/* 北家弃牌 — 上方 */}
            {discards?.[top.id] && discards[top.id].length > 0 && (
              <div className="mj-table-north">
                <MjTile tile={discards[top.id][discards[top.id].length - 1]} small highlight />
              </div>
            )}
            {/* 西家弃牌 — 左侧 */}
            {discards?.[left.id] && discards[left.id].length > 0 && (
              <div className="mj-table-west">
                <MjTile tile={discards[left.id][discards[left.id].length - 1]} small highlight />
              </div>
            )}
            {/* 东家弃牌 — 右侧 */}
            {discards?.[right.id] && discards[right.id].length > 0 && (
              <div className="mj-table-east">
                <MjTile tile={discards[right.id][discards[right.id].length - 1]} small highlight />
              </div>
            )}
            {/* 南家弃牌（我）— 下方 */}
            {discards?.[playerId] && discards[playerId].length > 0 && (
              <div className="mj-table-south">
                <MjTile tile={discards[playerId][discards[playerId].length - 1]} small highlight />
              </div>
            )}
          </div>

          {/* 底部 (南/我) — 明牌 + 操作按钮 */}
          <div className="mj-seat-bottom">
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

            {/* 错误提示 */}
            {error && <div className="mj-error">{error}</div>}

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
        </div>
      </div>

      {/* 我的手牌 */}
      <div className={`mj-hand${!isMyTurn ? ' mj-hand-disabled' : ''}`}>
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

      {/* 吃碰杠特效 */}
      {actionEffect && (
        <div className="mj-action-effect">
          <span className="mj-action-effect-text">{actionEffect}</span>
        </div>
      )}

      {/* 记牌器切换按钮 */}
      <button
        className="mj-tc-toggle"
        onClick={() => setShowTileCounter(v => !v)}
        title="记牌器"
      >
        📊
      </button>

      {/* 记牌器 */}
      <TileCounter
        allTileTypes={allTileTypes}
        myHand={myHand}
        discards={discards}
        melds={melds}
        visible={showTileCounter}
      />
    </div>
  );
}
