import { useEffect, useState } from 'react';

export default function SliderCaptcha({ challenge, disabled = false, onSolved, onReload }) {
  const [position, setPosition] = useState(0);

  useEffect(() => {
    setPosition(0);
    onSolved?.(null);
  }, [challenge?.challengeId]);

  if (!challenge) return null;

  const solved = Math.abs(Number(position) - Number(challenge.target)) <= Number(challenge.tolerance || 6);

  const handleChange = (event) => {
    const next = Number(event.target.value);
    setPosition(next);
    const ok = Math.abs(next - Number(challenge.target)) <= Number(challenge.tolerance || 6);
    onSolved?.(ok ? { token: challenge.token, position: next } : null);
  };

  return (
    <div className={`slider-captcha${solved ? ' solved' : ''}`}>
      <div className="slider-captcha-head">
        <span>滑动验证</span>
        <button type="button" onClick={onReload} disabled={disabled} className="slider-captcha-reload">
          换一题
        </button>
      </div>
      <div className="slider-captcha-track">
        <span className="slider-captcha-target" style={{ left: `${challenge.target}%` }} />
        <input
          type="range"
          min={challenge.min ?? 0}
          max={challenge.max ?? 100}
          value={position}
          disabled={disabled}
          onChange={handleChange}
          aria-label="滑动到高亮位置完成验证"
        />
      </div>
      <div className="slider-captcha-status">{solved ? '验证已完成' : '拖到高亮位置'}</div>
    </div>
  );
}
