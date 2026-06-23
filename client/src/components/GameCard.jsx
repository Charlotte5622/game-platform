import { useNavigate } from 'react-router-dom';
import { soundClick } from '../services/sounds';

const GAME_ICONS = {
  doudizhu: '🃏',
  mahjong: '🀄',
  'chinese-chess': '♟️',
  uno: '🎴',
  'uno-demo': '🎴',
  'turtle-soup': '🐢',
  gomoku: '⚫',
  emulator: '🕹️',
};

// 与暗色电竞主题协调的横幅渐变(略降饱和 + 深色压底)
const GAME_GRADIENTS = [
  'linear-gradient(135deg, #2fe3cf 0%, #1c7fb0 100%)',
  'linear-gradient(135deg, #46e0a0 0%, #1f8f72 100%)',
  'linear-gradient(135deg, #ff8a5c 0%, #c0492f 100%)',
  'linear-gradient(135deg, #4d9bff 0%, #2748b8 100%)',
  'linear-gradient(135deg, #f3c87a 0%, #b07b25 100%)',
  'linear-gradient(135deg, #ff6fae 0%, #b8347a 100%)',
];

export default function GameCard({ game, index = 0 }) {
  const navigate = useNavigate();
  const icon = GAME_ICONS[game.id] || '🎮';
  const gradient = GAME_GRADIENTS[index % GAME_GRADIENTS.length];
  const isExternal = game.type === 'external';
  const isStatic = isExternal && game.proxyMode === 'static';
  const playerRange = game.minPlayers === game.maxPlayers ? `${game.minPlayers} 人` : `${game.minPlayers}-${game.maxPlayers} 人`;

  const handleClick = () => {
    soundClick();
    if (isStatic) navigate('/emulator');
    else if (isExternal) window.open(`/games/${game.id}/`, '_blank', 'noopener,noreferrer');
    else navigate(`/game/${game.id}`);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="game-card group rise-in relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface/70 cursor-pointer transition-all duration-300 hover:-translate-y-1.5 hover:border-line-strong hover:shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`开始${game.name}`}
      style={{ animationDelay: `${index * 0.07}s` }}
    >
      {/* hover 时的强调描边光晕 */}
      <span className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] opacity-0 transition-opacity duration-300 group-hover:opacity-100 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--c-accent)_45%,transparent)]" />

      {/* 横幅 */}
      <div className="relative h-28 overflow-hidden" style={{ background: gradient }}>
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_70%_120%,rgba(255,255,255,0.25),transparent_60%)]" />
        <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
        <span className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
        <span className="absolute bottom-2 right-3 text-[64px] leading-none drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)] transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6" aria-hidden="true">
          {icon}
        </span>
      </div>

      {/* 内容 */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-display text-lg font-semibold text-text">{game.name}</h3>
        <p className="mt-1 text-sm text-muted leading-relaxed line-clamp-2 min-h-[2.6em]">{game.description}</p>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="游戏信息">
          <span className="px-2 py-0.5 rounded-md text-xs bg-white/[0.04] border border-line text-muted">👥 {playerRange}</span>
          {game.allowBots === false && <span className="px-2 py-0.5 rounded-md text-xs bg-white/[0.04] border border-line text-muted">真人局</span>}
          {game.version && <span className="px-2 py-0.5 rounded-md text-xs bg-white/[0.04] border border-line text-dim tabular">v{game.version}</span>}
          {isExternal && <span className="px-2 py-0.5 rounded-md text-xs bg-gold/15 border border-gold/30 text-gold">外部</span>}
        </div>

        <div className="mt-4 flex items-center justify-between pt-3 border-t border-line">
          <span className="text-xs text-dim">点击进入</span>
          <span className="inline-flex items-center gap-1 text-sm font-display font-semibold text-accent transition-transform duration-300 group-hover:translate-x-0.5">
            开始游戏
            <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
          </span>
        </div>
      </div>
    </div>
  );
}
