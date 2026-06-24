import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

const GAMES = [
  { id: 'chinese-chess', name: '中国象棋', icon: '♟️' },
  { id: 'doudizhu', name: '斗地主', icon: '🃏' },
  { id: 'mahjong', name: '四人麻将', icon: '🀄' },
  { id: 'uno', name: 'UNO', icon: '🃏' },
  { id: 'turtle-soup', name: '海龟汤', icon: '🐢' },
  { id: 'gomoku', name: '五子棋', icon: '⚫' },
];

const PODIUM_COLORS = ['#ffd700', '#c0c0c0', '#cd7f33']; // 金 银 铜
const PODIUM_HEIGHTS = [140, 110, 80];
const PODIUM_ICONS = ['👑', '🥈', '🥉'];

// 预设头像列表
const AVATARS = ['😎', '🤠', '👻', '🦊', '🐱', '🐼', '🦁', '🐸', '👑', '🎭', '🤖', '👾'];

/**
 * 从用户 ID 生成一个稳定的默认头像
 */
function getDefaultAvatar(userId) {
  return AVATARS[(userId || 0) % AVATARS.length];
}

/**
 * 领奖台单项
 */
function PodiumSlot({ player, rank, isFirst, isScoreGame }) {
  const avatar = player?.avatar || getDefaultAvatar(player?.userId);
  return (
    <div className={`lb-podium-item${isFirst ? ' lb-podium-first' : ''}`}>
      <div className="lb-podium-avatar" style={{ borderColor: PODIUM_COLORS[rank] }}>
        {player ? avatar : '❓'}
      </div>
      <div className="lb-podium-name">{player?.nickname || '虚位以待'}</div>
      <div className="lb-podium-wins">{player ? (isScoreGame ? `${player.totalScore}分` : `${player.wins}胜`) : ''}</div>
      <div className="lb-podium-pillar" style={{ height: PODIUM_HEIGHTS[rank], background: PODIUM_COLORS[rank] }}>
        <span className="lb-podium-rank">{PODIUM_ICONS[rank]}</span>
      </div>
    </div>
  );
}

/**
 * 液体玻璃下拉选择框
 */
function GlassDropdown({ games, selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedGame = games.find(g => g.id === selected) || games[0];

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className={`lb-dropdown${open ? ' lb-dropdown-open' : ''}`} ref={ref}>
      <button className="lb-dropdown-trigger" onClick={() => setOpen(!open)}>
        <span className="lb-dropdown-icon">{selectedGame.icon}</span>
        <span className="lb-dropdown-text">{selectedGame.name}</span>
        <span className="lb-dropdown-arrow">▾</span>
      </button>
      {open && (
        <div className="lb-dropdown-menu">
          {games.map(g => (
            <button
              key={g.id}
              className={`lb-dropdown-item${g.id === selected ? ' lb-dropdown-active' : ''}`}
              onClick={() => { onSelect(g.id); setOpen(false); }}
            >
              <span className="lb-dropdown-item-icon">{g.icon}</span>
              <span className="lb-dropdown-item-text">{g.name}</span>
              {g.id === selected && <span className="lb-dropdown-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Leaderboard() {
  const { gameId: urlGameId } = useParams();
  const [selectedGame, setSelectedGame] = useState(urlGameId || 'chinese-chess');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/api/leaderboard/${selectedGame}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, [selectedGame]);

  const board = data?.leaderboard || [];
  const isScoreGame = data?.isScoreGame || false;
  const top3 = board.slice(0, 3);
  const rest = board.slice(3, 20);

  return (
    <div className="lb-page">
      <h1 className="lb-title">🏆 排行榜</h1>

      {/* 液体玻璃下拉选择 */}
      <div className="lb-selector-wrap">
        <GlassDropdown games={GAMES} selected={selectedGame} onSelect={setSelectedGame} />
      </div>

      {loading ? (
        <div className="lb-loading">加载中...</div>
      ) : board.length === 0 ? (
        <div className="lb-empty">
          <div className="lb-empty-icon">🏆</div>
          <p>暂无战绩记录</p>
          <p className="lb-empty-hint">快去玩一局吧！</p>
        </div>
      ) : (
        <>
          {/* 领奖台 — 奥林匹克顺序：银左、金中（最高）、铜右 */}
          <div className="lb-podium">
            {/* 第二名（左） */}
            <PodiumSlot player={top3[1]} rank={1} isScoreGame={isScoreGame} />

            {/* 第一名（中，最高） */}
            <PodiumSlot player={top3[0]} rank={0} isFirst isScoreGame={isScoreGame} />

            {/* 第三名（右） */}
            <PodiumSlot player={top3[2]} rank={2} isScoreGame={isScoreGame} />
          </div>

          {/* 4-20 名列表 */}
          {rest.length > 0 && (
            <div className="lb-list">
              <div className="lb-list-header">
                <span className="lb-list-rank">排名</span>
                <span className="lb-list-name">玩家</span>
                {isScoreGame ? (
                  <>
                    <span className="lb-list-stat">总分</span>
                    <span className="lb-list-stat">场次</span>
                    <span className="lb-list-stat">胜率</span>
                  </>
                ) : (
                  <>
                    <span className="lb-list-stat">胜</span>
                    <span className="lb-list-stat">负</span>
                    <span className="lb-list-stat">胜率</span>
                  </>
                )}
              </div>
              {rest.map(p => (
                <div key={p.userId} className="lb-list-row">
                  <span className="lb-list-rank">{p.rank}</span>
                  <span className="lb-list-name">{p.nickname}</span>
                  {isScoreGame ? (
                    <>
                      <span className="lb-list-stat lb-win">{p.totalScore}</span>
                      <span className="lb-list-stat">{p.total}</span>
                      <span className="lb-list-stat">{p.winRate}%</span>
                    </>
                  ) : (
                    <>
                      <span className="lb-list-stat lb-win">{p.wins}</span>
                      <span className="lb-list-stat lb-lose">{p.losses}</span>
                      <span className="lb-list-stat">{p.winRate}%</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
