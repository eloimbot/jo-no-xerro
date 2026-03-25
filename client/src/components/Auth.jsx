import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Auth.css'; // We'll add some specific styles if needed

const API_URL = '/api';

function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    try {
      if (isLogin) {
        const response = await axios.post(`${API_URL}/login`, { username, password });
        const { token, user } = response.data;
        onLogin(token, user);
        navigate('/');
      } else {
        const response = await axios.post(`${API_URL}/register`, { username, password });
        setMessage(response.data.message || 'Registration successful. Please log in.');
        setIsLogin(true); // Switch to login view
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An error occurred');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card glass-panel">
        <div className="auth-header">
          <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <p>{isLogin ? 'Sign in to continue' : 'Join our secure chat'}</p>
        </div>
        
        {error && <div className="alert error">{error}</div>}
        {message && <div className="alert success">{message}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input 
              type="text" 
              id="username" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Enter your username"
              required 
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Enter your password"
              required 
            />
          </div>

          <button type="submit" className="primary-btn pulse-glow">
            {isLogin ? 'Sign In' : 'Register'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button className="text-btn" onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setMessage('');
            }}>
              {isLogin ? 'Register here' : 'Log in here'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Auth;
