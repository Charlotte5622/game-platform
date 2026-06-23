import { useEffect, useRef, useState } from 'react';

export default function EmulatorGame({ rom, onExit }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === 'emulator_exit') {
        onExit?.();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onExit]);

  const src = `/games/emulator/index.html?rom=${encodeURIComponent(rom.file)}&core=${encodeURIComponent(rom.core)}&name=${encodeURIComponent(rom.name)}`;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, zIndex: 10
        }}>
          <div>🎮 加载中...</div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        src={src}
        onLoad={() => setLoading(false)}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="gamepad"
        title={rom.name}
      />
    </div>
  );
}
