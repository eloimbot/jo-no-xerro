import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import Auth from './components/Auth';
import Chat from './components/Chat';
import Feed from './components/Feed';
import Upload from './components/Upload';
import VideoPlayer from './components/VideoPlayer';
import Profile from './components/Profile';
import Admin from './components/Admin';

import './App.css';

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLogin = (newToken, newUser) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  if (!token) {
    return (
      <Router>
        <Auth onLogin={handleLogin} />
      </Router>
    );
  }

  return (
    <Router>
      <div className="app-container">
        {/* Desktop Header */}
        <nav className="desktop-nav glass-panel">
          <div className="nav-brand">jo no xerro</div>
          <div className="nav-links">
            <Link to="/" className="nav-link">Descubrir</Link>
            <Link to="/chat" className="nav-link">Chat</Link>
            <Link to="/upload" className="nav-link">Subir</Link>
            <Link to={`/profile/${user.username}`} className="nav-link">Perfil</Link>
            {user?.role === 'admin' && <Link to="/admin" className="nav-link">Admin</Link>}
            <button onClick={handleLogout} className="logout-btn">Cerrar Sesión</button>
          </div>
        </nav>

        {/* Mobile Bottom Nav */}
        <nav className="mobile-nav glass-panel-dark">
          <Link to="/" className="mobile-nav-link">🏠</Link>
          <Link to="/chat" className="mobile-nav-link">💬</Link>
          <Link to="/upload" className="mobile-nav-link action">➕</Link>
          <Link to={`/profile/${user.username}`} className="mobile-nav-link">👤</Link>
          {user?.role === 'admin' && <Link to="/admin" className="mobile-nav-link">⚙️</Link>}
          <button onClick={handleLogout} className="mobile-nav-link">🚪</button>
        </nav>


        <main className="main-content">
          <Routes>
            <Route path="/" element={<Feed />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/upload" element={<Upload token={token} />} />
            <Route path="/video/:id" element={<VideoPlayer token={token} currentUser={user} />} />
            <Route path="/profile/:username" element={<Profile />} />
            <Route path="/admin" element={user?.role === 'admin' ? <Admin token={token} /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;


