import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmulatorGame from '../components/EmulatorGame';
import api from '../services/api';
import { soundClick } from '../services/sounds';

const PLATFORM_NAMES = { nes: 'FC / NES' };

function getRomSearchText(rom) {
  return [
    rom.name,
    rom.description,
    rom.genre,
    rom.difficulty,
    rom.license,
    ...(rom.tags || []),
  ].join(' ').toLowerCase();
}

export default function EmulatorPage() {
  const [roms, setRoms] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [genre, setGenre] = useState('all');
  const [selectedRom, setSelectedRom] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    async function loadRoms() {
      try {
        const { data } = await api.get('/api/external-games/emulator/roms');
        if (cancelled) return;
        setRoms(data.roms || []);
        setMeta(data.meta || null);
        setError(null);
      } catch {
        if (cancelled) return;
        setError('加载游戏列表失败，请稍后重试');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRoms();
    return () => {
      cancelled = true;
    };
  }, []);

  const genres = useMemo(() => {
    const list = Array.from(new Set(roms.map((rom) => rom.genre).filter(Boolean)));
    return ['all', ...list];
  }, [roms]);

  const filteredRoms = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return roms.filter((rom) => {
      const matchGenre = genre === 'all' || rom.genre === genre;
      const matchQuery = !keyword || getRomSearchText(rom).includes(keyword);
      return matchGenre && matchQuery;
    });
  }, [roms, query, genre]);

  const handleSelectRom = (rom) => {
    if (!rom.available) return;
    soundClick();
    setSelectedRom(rom);
  };

  if (selectedRom) {
    return <EmulatorGame rom={selectedRom} onExit={() => setSelectedRom(null)} />;
  }

  return (
    <div className="emulator-page">
      <section className="emulator-library">
        <header className="emulator-hero">
          <div className="emulator-hero-main">
            <span className="emulator-kicker">外部游戏模块</span>
            <h1 className="emulator-title">经典 ROM 游戏库</h1>

          </div>

          <div className="emulator-hero-stats" aria-label="游戏库统计">
            <div>
              <strong>{meta?.available ?? 0}</strong>
              <span>可玩</span>
            </div>
            <div>
              <strong>{meta?.total ?? roms.length}</strong>
              <span>收录</span>
            </div>
            <div>
              <strong>NES</strong>
              <span>平台</span>
            </div>
          </div>

          <button className="emulator-back" type="button" onClick={() => { soundClick(); navigate('/lobby'); }}>
            返回大厅
          </button>
        </header>

        <div className="emulator-toolbar">
          <label className="emulator-search">
            <span>搜索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="按名称、玩法、标签筛选"
            />
          </label>

          <div className="emulator-filter" role="tablist" aria-label="玩法筛选">
            {genres.map((item) => (
              <button
                key={item}
                type="button"
                className={genre === item ? 'active' : ''}
                onClick={() => setGenre(item)}
              >
                {item === 'all' ? '全部' : item}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="emulator-state">
            <div className="emulator-state-spinner" />
            <p>正在加载游戏库...</p>
          </div>
        )}

        {!loading && error && (
          <div className="emulator-state emulator-state-error">
            <strong>{error}</strong>
            <button type="button" onClick={() => window.location.reload()}>重新加载</button>
          </div>
        )}

        {!loading && !error && roms.length === 0 && (
          <div className="emulator-state">
            <strong>暂无可用游戏</strong>
            <p>ROM 列表为空，请稍后再来。</p>
          </div>
        )}

        {!loading && !error && roms.length > 0 && filteredRoms.length === 0 && (
          <div className="emulator-state">
            <strong>没有匹配的游戏</strong>
            <p>换一个关键词或筛选条件。</p>
          </div>
        )}

        {!loading && !error && filteredRoms.length > 0 && (
          <div className="emulator-rom-grid">
            {filteredRoms.map((rom) => (
              <button
                key={rom.id}
                type="button"
                className={`emulator-rom-card${rom.available ? '' : ' unavailable'}`}
                onClick={() => handleSelectRom(rom)}
                disabled={!rom.available}
              >
                <div className="rom-card-top">
                  <span className="rom-chip">{PLATFORM_NAMES[rom.platform] || rom.platform}</span>
                  <span className="rom-chip">{rom.players > 1 ? `${rom.players} 人` : '单人'}</span>
                </div>
                <div className={`rom-card-art${rom.cover ? ' has-cover' : ''}`}>
                  {rom.cover ? (
                    <img
                      src={rom.cover}
                      alt={rom.coverAlt || `${rom.name} 游戏封面`}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  ) : (
                    <span aria-hidden="true">{rom.genre?.slice(0, 1) || '游'}</span>
                  )}
                </div>
                <div className="rom-card-body">
                  <h2>{rom.name}</h2>
                  <p>{rom.description}</p>
                </div>
                <div className="rom-card-tags">
                  {(rom.tags || []).slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <div className="rom-card-footer">
                  <span>{rom.genre || '经典'} / {rom.difficulty || '普通'}</span>
                  <strong>{rom.available ? '开始' : '文件缺失'}</strong>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
