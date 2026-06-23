/**
 * 全局主题(明暗 + 配色)统一管理
 * - 单一存储键 lobby-theme(沿用旧键,兼容历史选择)
 * - 任意页面通过 setTheme 切换,派发 theme:change 事件让各组件同步
 */
const KEY = 'lobby-theme';
export const DARK_DEFAULT = 'midnight'; // 默认暗色(无 data-theme)
export const LIGHT = 'day';

export function getTheme() {
  return localStorage.getItem(KEY) || DARK_DEFAULT;
}

export function applyTheme(theme) {
  if (theme === DARK_DEFAULT) {
    document.body.removeAttribute('data-theme');
  } else {
    document.body.setAttribute('data-theme', theme);
  }
}

export function setTheme(theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
  window.dispatchEvent(new CustomEvent('theme:change', { detail: theme }));
}

export function isLight(theme = getTheme()) {
  return theme === LIGHT;
}

/** 在明暗之间切换:浅色 → 回默认暗色;其它(含各暗色配色)→ 浅色 */
export function toggleLight() {
  setTheme(isLight() ? DARK_DEFAULT : LIGHT);
}

/** 订阅主题变化,返回取消订阅函数 */
export function onThemeChange(cb) {
  const handler = (e) => cb(e.detail);
  window.addEventListener('theme:change', handler);
  return () => window.removeEventListener('theme:change', handler);
}
