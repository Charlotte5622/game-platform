import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

// 预设头像
const AVATARS = ['😎', '🤠', '👻', '🦊', '🐱', '🐼', '🦁', '🐸', '👑', '🎭', '🤖', '👾'];

// 游戏名映射
const GAME_NAMES = {
  'doudizhu': '🃏 斗地主',
  'mahjong': '🀄 四人麻将',
  'chinese-chess': '♟️ 中国象棋',
  'uno': '🃏 UNO',
  'turtle-soup': '🐢 海龟汤',
  'gomoku': '⚫ 五子棋',
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
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const { user, setUser } = useAuthStore();

  const currentAvatar = user?.avatar || AVATARS[(user?.id || 0) % AVATARS.length];

  useEffect(() => {
    api.get('/api/auth/stats')
      .then(res => { setStats(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSelectAvatar = async (avatar) => {
    try {
      await api.put('/api/auth/avatar', { avatar });
      setUser({ ...user, avatar });
      setShowAvatarPicker(false);
    } catch {
      // 静默失败
    }
  };

  const handleSaveNickname = async () => {
    const nickname = nicknameInput.trim();
    if (!nickname || nickname.length < 2) {
      setNicknameError('昵称至少 2 个字符');
      return;
    }
    if (nickname.length > 20) {
      setNicknameError('昵称最多 20 个字符');
      return;
    }
    try {
      const res = await api.put('/api/auth/nickname', { nickname });
      setUser({ ...user, nickname: res.data.nickname, nicknameChangeCount: res.data.user?.nicknameChangeCount ?? (user?.nicknameChangeCount || 0) + 1 });
      setEditingNickname(false);
      setNicknameError('');
    } catch (err) {
      setNicknameError(err.response?.data?.error || '修改失败');
    }
  };

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
      {/* 头像 + 昵称 */}
      <div className="stats-avatar-section">
        <div className="stats-avatar-display" onClick={() => setShowAvatarPicker(!showAvatarPicker)}>
          <span className="stats-avatar-emoji">{currentAvatar}</span>
          <span className="stats-avatar-edit">✏️</span>
        </div>

        {/* 昵称显示/编辑 */}
        {editingNickname ? (
          <div className="stats-nickname-edit">
            <input
              className="stats-nickname-input"
              type="text"
              value={nicknameInput}
              onChange={(e) => { setNicknameInput(e.target.value); setNicknameError(''); }}
              maxLength={20}
              placeholder="输入新昵称"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSaveNickname()}
            />
            <div className="stats-nickname-actions">
              <button className="stats-nickname-save" onClick={handleSaveNickname}>保存</button>
              <button className="stats-nickname-cancel" onClick={() => { setEditingNickname(false); setNicknameError(''); }}>取消</button>
            </div>
            {nicknameError && <p className="stats-nickname-error">{nicknameError}</p>}
          </div>
        ) : (
          <div className="stats-nickname-display">
            <span className="stats-nickname-text">{user?.nickname}</span>
            {(() => { const rc = 5 - (user?.nicknameChangeCount || 0); return rc > 0 ? (
              <button className="stats-nickname-btn" onClick={() => { setNicknameInput(user?.nickname || ''); setEditingNickname(true); }}>
                ✏️ 改名（剩余 {rc} 次）
              </button>
            ) : (
              <span className="stats-nickname-limit">已达修改上限</span>
            ); })()}
          </div>
        )}

        {showAvatarPicker && (
          <div className="stats-avatar-picker">
            <p className="stats-avatar-picker-title">选择头像</p>
            <div className="stats-avatar-grid">
              {AVATARS.map(a => (
                <button
                  key={a}
                  className={`stats-avatar-option${a === currentAvatar ? ' stats-avatar-selected' : ''}`}
                  onClick={() => handleSelectAvatar(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
