/**
 * 四人麻将 React 组件
 *
 * Props (由 GameHost 注入):
 * - socket: Socket.IO 连接
 * - roomId: 房间 ID
 * - playerId: 当前玩家 ID
 * - gameState: 游戏状态
 * - onAction: 发送操作回调
 * - players: 房间内玩家列表
 *
 * 游戏状态 (gameState) 结构:
 * - myHand: 当前玩家手牌 (已排序)
 * - handCounts: 各玩家手牌数量
 * - melds: 各玩家明牌 [{ type, tiles }]
 * - discards: 各玩家弃牌
 * - wallCount: 墙牌剩余数
 * - currentTurn: 当前轮到谁 (玩家索引)
 * - dealer: 庄家索引
 * - lastDiscard: 最后打出的牌
 * - waitingAction: 等待响应动作
 *
 * 操作 (onAction):
 * - { type: 'discard', tile } - 打牌
 * - { type: 'chow', tiles } - 吃
 * - { type: 'pung' } - 碰
 * - { type: 'kong', concealed?: boolean } - 杠
 * - { type: 'win' } - 和
 * - { type: 'pass' } - 过
 */
export default function MahjongGame({ socket, roomId, playerId, gameState, onAction, players }) {
  if (!gameState) return <div>等待游戏数据...</div>;

  const {
    myHand,
    handCounts,
    melds,
    discards,
    wallCount,
    currentTurn,
    dealer,
    lastDiscard,
    waitingAction,
  } = gameState;

  const isMyTurn = gameState.players[currentTurn] === playerId;

  // TODO: UI agent 实现以下渲染
  return (
    <div className="mahjong-game">
      <div className="mahjong-info">
        <span>剩余: {wallCount} 张</span>
        <span>当前轮: {isMyTurn ? '你' : players.find(p => p.id === gameState.players[currentTurn])?.nickname}</span>
      </div>

      <div className="mahjong-board">
        {/* 其他玩家信息 */}
        {gameState.players.filter(pid => pid !== playerId).map(pid => (
          <div key={pid} className="mahjong-opponent">
            <span>{players.find(p => p.id === pid)?.nickname}</span>
            <span>手牌: {handCounts[pid]} 张</span>
            <div className="opponent-discards">
              {(discards[pid] || []).map(t => <span key={t.id}>{t.display}</span>)}
            </div>
          </div>
        ))}
      </div>

      <div className="mahjong-melds">
        {/* 自己的明牌 */}
        {(melds[playerId] || []).map((meld, i) => (
          <div key={i} className="mahjong-meld">
            {meld.tiles.map(t => <span key={t.id}>{t.display}</span>)}
          </div>
        ))}
      </div>

      <div className="mahjong-hand">
        {/* 自己的手牌 */}
        {myHand.map(tile => (
          <button
            key={tile.id}
            className="mahjong-tile"
            onClick={() => isMyTurn && onAction({ type: 'discard', tile })}
          >
            {tile.display}
          </button>
        ))}
      </div>

      {/* 响应操作按钮 */}
      {waitingAction && waitingAction.responders.some(r => r.pid === playerId) && (
        <div className="mahjong-actions">
          {waitingAction.actions?.includes('win') && (
            <button onClick={() => onAction({ type: 'win' })}>和</button>
          )}
          {waitingAction.actions?.includes('pung') && (
            <button onClick={() => onAction({ type: 'pung' })}>碰</button>
          )}
          {waitingAction.actions?.includes('kong') && (
            <button onClick={() => onAction({ type: 'kong' })}>杠</button>
          )}
          {waitingAction.actions?.includes('chow') && (
            <button onClick={() => onAction({ type: 'chow', tiles: [] })}>吃</button>
          )}
          <button onClick={() => onAction({ type: 'pass' })}>过</button>
        </div>
      )}
    </div>
  );
}
