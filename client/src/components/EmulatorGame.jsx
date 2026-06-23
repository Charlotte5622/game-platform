import { useEffect, useRef, useState } from 'react';

export default function EmulatorGame({ rom, onExit }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'emulator_exit') {
        onExit?.();
      } else if (e.data?.type === 'emulator_error') {
        setLoadError(true);
        setLoading(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onExit]);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
  }, [rom?.id]);

  const src = `/games/emulator/index.html?rom=${encodeURIComponent(rom.file)}&core=${encodeURIComponent(rom.core)}&name=${encodeURIComponent(rom.name)}`;

  return (
    <div className="emulator-frame-shell">
      {loading && (
        <div className="emulator-frame-loading">
          <div className="emulator-frame-spinner" />
          <div>正在启动 {rom.name}...</div>
        </div>
      )}
      {loadError && (
        <div className="emulator-frame-error">
          <strong>模拟器加载失败</strong>
          <span>请返回列表后重试，或换一个 ROM。</span>
          <button type="button" onClick={onExit}>返回游戏库</button>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={() => setLoading(false)}
        className="emulator-frame"
        allow="fullscreen; gamepad; autoplay"
        title={rom.name}
      />
    </div>
  );
}
