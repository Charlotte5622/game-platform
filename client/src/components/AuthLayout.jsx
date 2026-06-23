/**
 * 认证页通用外壳 — 左侧品牌面板 + 右侧表单卡片
 * 桌面端双栏,移动端单栏(仅表单 + 顶部精简 logo)
 */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-[calc(100vh-64px)] grid place-items-center px-4 py-10">
      <div className="w-full max-w-4xl overflow-hidden rounded-[var(--radius-lg)] border border-line glass shadow-[var(--shadow-lg)] grid md:grid-cols-[1.05fr_1fr] rise-in">
        {/* 品牌面板(桌面端) */}
        <aside className="relative hidden md:flex flex-col justify-between p-9 overflow-hidden">
          <div
            className="absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(80% 60% at 20% 0%, color-mix(in srgb, var(--c-accent) 22%, transparent), transparent 70%), radial-gradient(70% 60% at 100% 100%, color-mix(in srgb, var(--c-accent-2) 20%, transparent), transparent 70%), linear-gradient(160deg, #0c1019, #0a0d14)',
            }}
          />
          <div className="absolute inset-0 -z-10 opacity-[0.06]"
            style={{
              backgroundImage:
                'linear-gradient(var(--c-line) 1px, transparent 1px), linear-gradient(90deg, var(--c-line) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <span className="ghost-word -z-10 text-[180px] -bottom-10 -left-4 opacity-60">A</span>
          <span className="scanline left-6 right-6 top-20" />
          <span className="hud-frame" />

          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-10 h-10 rounded-xl text-xl bg-raised border border-line-strong shadow-[0_0_22px_-4px_var(--c-accent)]">
              🎮
            </span>
            <span className="font-display font-bold tracking-tight text-text">
              联机<span className="text-accent">竞技场</span>
            </span>
          </div>

          <div>
            <div className="eyebrow mb-4">Arena OS</div>
            <h2 className="font-display text-[2.1rem] leading-[1.05] font-bold text-text">
              开局,<br />在牌桌上见。
            </h2>
            <p className="mt-4 text-sm text-muted leading-relaxed max-w-[34ch]">
              麻将 · 斗地主 · 象棋 · UNO · 五子棋 —— 与好友实时对战,或挑战 AI。
            </p>
          </div>

          <div className="flex items-center gap-5 text-2xl">
            {['🀄', '🃏', '♟️', '🎴', '⚫'].map((e) => (
              <span
                key={e}
                className="grid place-items-center w-11 h-11 rounded-xl bg-white/[0.03] border border-line transition-transform duration-300 hover:-translate-y-1 hover:border-line-strong"
              >
                {e}
              </span>
            ))}
          </div>
        </aside>

        {/* 表单区 */}
        <section className="p-7 sm:p-9 bg-surface/60">
          <div className="md:hidden flex items-center gap-2.5 mb-7">
            <span className="grid place-items-center w-9 h-9 rounded-xl text-lg bg-raised border border-line-strong">🎮</span>
            <span className="font-display font-bold text-text">联机<span className="text-accent">竞技场</span></span>
          </div>

          <h1 className="font-display text-2xl font-bold text-text">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 pt-5 border-t border-line text-sm">{footer}</div>}
        </section>
      </div>
    </div>
  );
}
