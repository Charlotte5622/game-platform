import { useParams, useNavigate } from 'react-router-dom';

/**
 * iframe 游戏页面
 * 用于加载大型外部游戏（如无名杀），完全解耦
 */
export default function IframeGame() {
  const { gameId } = useParams();
  const navigate = useNavigate();

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/lobby')}>
          ← 返回大厅
        </button>
        <span style={styles.title}>{gameId}</span>
        <button
          style={styles.fullscreenBtn}
          onClick={() => {
            const iframe = document.getElementById('game-iframe');
            if (iframe?.requestFullscreen) iframe.requestFullscreen();
          }}
        >
          ⛶ 全屏
        </button>
      </div>
      <iframe
        id="game-iframe"
        src={`/games/${gameId}/`}
        style={styles.iframe}
        allow="fullscreen; autoplay; clipboard-write"
      />
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 64px)',
    background: '#000',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 16px',
    background: 'rgba(0,0,0,0.8)',
    borderBottom: '1px solid #333',
  },
  backBtn: {
    background: 'transparent',
    border: '1px solid #555',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  title: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
  },
  fullscreenBtn: {
    background: 'transparent',
    border: '1px solid #555',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  iframe: {
    flex: 1,
    border: 'none',
    width: '100%',
  },
};
