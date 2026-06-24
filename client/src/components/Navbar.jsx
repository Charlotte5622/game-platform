import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { disconnectSocket } from '../services/socket';
import { setVolume, soundClick, playSound, getVoice, setVoice as saveVoice, getVolume, VOICE_OPTIONS } from '../services/sounds';
import { RiLogoutBoxLine, RiVolumeUpLine, RiVolumeMuteLine } from '@remixicon/react';

export default function Navbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [muted, setMuted] = useState(() => localStorage.getItem('muted') === 'true');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSoundMenu, setShowSoundMenu] = useState(false);
  const [voice, setVoiceState] = useState(() => getVoice());
  const soundMenuRef = useRef(null);

  useEffect(() => {
    setVolume(muted ? 0 : 0.5);
  }, []);

  // 点击外部关闭声音菜单
  useEffect(() => {
    if (!showSoundMenu) return;
    const handleClickOutside = (e) => {
      if (soundMenuRef.current && !soundMenuRef.current.contains(e.target)) {
        setShowSoundMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSoundMenu]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem('muted', String(next));
    setVolume(next ? 0 : 0.5);
    // 取消静音时播放提示音，静音时不播放
    if (!next) soundClick();
  };

  const handleVoiceChange = (voiceId) => {
    setVoiceState(voiceId);
    saveVoice(voiceId);
    soundClick();
  };

  const handleSoundBtnClick = () => {
    setShowSoundMenu(prev => !prev);
    soundClick();
  };

  const handleLogoutClick = () => {
    soundClick();
    playSound('common', 'logout_confirm');
    setShowLogoutConfirm(true);
  };

  const handleLogoutConfirm = async () => {
    setShowLogoutConfirm(false);
    soundClick();
    disconnectSocket();
    await logout();
    navigate('/login');
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
    soundClick();
  };

  const navClass = ({ isActive }) => `navbar-link${isActive ? ' active' : ''}`;

  return (
    <nav className="navbar" aria-label="主导航">
      <Link to="/lobby" className="navbar-logo" aria-label="返回游戏大厅">
        <span className="navbar-logo-mark">🎮</span>
        <span>联机游戏平台</span>
      </Link>

      <div className="navbar-right">
        {user ? (
          <>
            <NavLink to="/leaderboard" className={navClass}>排行榜</NavLink>
            <NavLink to="/stats" className={navClass}>战绩</NavLink>
            <NavLink to="/security" className={navClass}>安全</NavLink>
            <span className="navbar-nickname" title={user.nickname}>{user.nickname}</span>
            <span className="navbar-actions">
              {/* 声音设置下拉 */}
              <div className="sound-menu-wrapper" ref={soundMenuRef}>
                <button
                  onClick={handleSoundBtnClick}
                  className="navbar-icon-btn"
                  title="声音设置"
                  aria-label="声音设置"
                  aria-expanded={showSoundMenu}
                >
                  {muted ? <RiVolumeMuteLine size={20} /> : <RiVolumeUpLine size={20} />}
                </button>
                {showSoundMenu && (
                  <div className="sound-dropdown">
                    <div className="sound-dropdown-row">
                      <span className="sound-dropdown-label">音效</span>
                      <button
                        className={`sound-toggle${!muted ? ' on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                      >
                        {muted ? '关闭' : '开启'}
                      </button>
                    </div>
                    <div className="sound-dropdown-divider" />
                    <div className="sound-dropdown-section">音色</div>
                    <div className="sound-voice-grid">
                      {VOICE_OPTIONS.map(v => (
                        <button
                          key={v.id}
                          className={`sound-voice-btn${voice === v.id ? ' active' : ''}`}
                          onClick={(e) => { e.stopPropagation(); handleVoiceChange(v.id); }}
                          title={v.label}
                        >
                          <span className="sound-voice-icon">{v.icon}</span>
                          <span className="sound-voice-label">{v.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={handleLogoutClick} className="navbar-icon-btn" title="退出登录" aria-label="退出登录">
                <RiLogoutBoxLine size={20} />
              </button>
            </span>
          </>
        ) : (
          <Link to="/login" className="navbar-login">
            登录
          </Link>
        )}
      </div>

      {/* 退出确认弹窗 */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={handleLogoutCancel}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <p className="modal-text">确定要退出登录吗？</p>
            <div className="modal-actions">
              <button className="modal-btn modal-btn-cancel" onClick={handleLogoutCancel}>取消</button>
              <button className="modal-btn modal-btn-confirm" onClick={handleLogoutConfirm}>确定退出</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
