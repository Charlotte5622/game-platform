import { useState, useEffect } from 'react';
import api from '../services/api';

// 游戏名映射
const GAME_NAMES = {
  'doudizhu': '🃏 斗地主',
  'mahjong': '🀄 四人麻将',
  'chinese-chess': '♟️ 中国象棋',
  'uno': '🃏 UNO',
};

function formatDuration(seconds) {
  if (!seconds) return '0分钟';
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}小时${rm}分` : `${h}小时`;
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/auth/stats')
      .then(res => { setStats(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="stats-page">
        <div className="stats-loading">加载中...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="stats-page">
        <div className="stats-loading">加载失败</div>
      </div>
    );
  }

  const { summary, byGame } = stats;
  const gameIds = Object.keys(byGame);

  return (
    <div className="stats-page">
      {/* 总览 */}
      <div className="stats-hero">
        <h1 className="stats-title">📊 我的战绩</h1>
        <div className="stats-summary">
          <div className="stats-summary-item">
            <span className="stats-summary-num">{summary.totalGames}</span>
            <span className="stats-summary-label">总场次</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-num stats-win">{summary.totalWins}</span>
            <span className="stats-summary-label">胜</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-num stats-lose">{summary.totalLosses}</span>
            <span className="stats-summary-label">负</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-num stats-draw">{summary.totalDraws}</span>
            <span className="stats-summary-label">平</span>
          </div>
          <div className="stats-summary-item">
            <span className="stats-summary-num">{formatDuration(summary.totalDuration)}</span>
            <span className="stats-summary-label">总时长</span>
          </div>
        </div>
        {summary.totalGames > 0 && (
          <div className="stats-winrate">
            胜率: {Math.round((summary.totalWins / summary.totalGames) * 100)}%
          </div>
        )}
      </div>

      {/* 各游戏详情 */}
      {gameIds.length > 0 ? (
        <div className="stats-games">
          {gameIds.map(gameId => {
            const g = byGame[gameId];
            const winRate = g.games > 0 ? Math.round((g.wins / g.games) * 100) : 0;
            return (
              <div key={gameId} className="stats-game-card">
                <div className="stats-game-header">
                  <h3 className="stats-game-name">{GAME_NAMES[gameId] || gameId}</h3>
                  <span className="stats-game-rate">{winRate}% 胜率</span>
                </div>
                <div className="stats-game-bar">
                  <div className="stats-bar-win" style={{ width: `${winRate}%` }} />
                </div>
                <div className="stats-game-detail">
                  <span>🟢 {g.wins}胜</span>
                  <span>🔴 {g.losses}负</span>
                  <span>⚪ {g.draws}平</span>
                  <span>⏱️ {formatDuration(g.totalDuration)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="stats-empty">
          <p>还没有游戏记录，快去玩一局吧！</p>
        </div>
      )}
    </div>
  );
}
