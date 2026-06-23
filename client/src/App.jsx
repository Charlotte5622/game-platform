import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';
import Stats from './pages/Stats';
import Leaderboard from './pages/Leaderboard';

function ProtectedRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <Navbar />
      <main id="main-content" className="main-content">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/lobby"
            element={
              <ProtectedRoute>
                <Lobby />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stats"
            element={
              <ProtectedRoute>
                <Stats />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaderboard"
            element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leaderboard/:gameId"
            element={
              <ProtectedRoute>
                <Leaderboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/game/:gameId"
            element={
              <ProtectedRoute>
                <GameRoom />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/lobby" replace />} />
        </Routes>
      </main>
    </>
  );
}
