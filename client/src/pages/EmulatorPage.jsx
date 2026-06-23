import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import EmulatorGame from '../components/EmulatorGame';
import { soundClick } from '../services/sounds';

export default function EmulatorPage() {
  const [roms, setRoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRom, setSelectedRom] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/roms')
      .then(res => res.json())
      .then(data => { setRoms(data.roms || []); setLoading(false); })
      .catch(() => { setError('加载游戏列表失败'); setLoading(false); });
  }, []);

  // If a ROM is selected, show the emulator in fullscreen
  if (selectedRom) {
    return (
      <EmulatorGame 
        rom={selectedRom} 
        onExit={() => setSelectedRom(null)} 
      />
    );
  }

  // ROM selection UI
  const PLATFORM_ICONS = { nes: '🎮', snes: '🎮', gba: '🕹️', nds: '📱', n64: '🎮', psx: '🎮' };
  const PLATFORM_NAMES = { nes: 'FC/NES', snes: 'SFC/SNES', gba: 'GBA', nds: 'NDS', n64: 'N64', psx: 'PS1' };

  return (
    <div className="emulator-page">
      <div className="emulator-header">
        <button className="emulator-back" onClick={() => { soundClick(); navigate('/lobby'); }}>
          ← 返回大厅
        </button>
        <h1 className="emulator-title">🎮 经典游戏</h1>
        <p className="emulator-subtitle">选择一个游戏开始</p>
      </div>

      {loading && <div className="emulator-loading">加载中...</div>}
      {error && <div className="emulator-error">{error}</div>}
      {!loading && !error && roms.length === 0 && (
        <div className="emulator-empty">
          <div className="emulator-empty-icon">📦</div>
          <p>暂无可用游戏</p>
        </div>
      )}

      {!loading && !error && roms.length > 0 && (
        <div className="emulator-rom-grid">
          {roms.map(rom => (
            <div
              key={rom.id}
              className="emulator-rom-card"
              onClick={() => { soundClick(); setSelectedRom(rom); }}
            >
              <div className="rom-icon">{PLATFORM_ICONS[rom.platform] || '🎮'}</div>
              <div className="rom-name">{rom.name}</div>
              <div className="rom-platform">{PLATFORM_NAMES[rom.platform] || rom.platform}</div>
              {rom.players > 1 && <div className="rom-players">👥 {rom.players}人</div>}
              {rom.description && <div className="rom-desc">{rom.description}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
