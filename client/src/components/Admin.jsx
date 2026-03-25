import { useState, useEffect } from 'react';
import axios from 'axios';
import './Admin.css';

const API_URL = '/api';

function Admin({ token }) {
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [stats, setStats] = useState({ totalUsers: 0, totalVideos: 0, totalLikes: 0, totalViews: 0 });
  const [activeTab, setActiveTab] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const [usersRes, msgsRes, vidsRes, statsRes] = await Promise.all([
        axios.get(`${API_URL}/users`, authHeaders),
        axios.get(`${API_URL}/messages/all`, authHeaders),
        axios.get(`${API_URL}/admin/videos`, authHeaders),
        axios.get(`${API_URL}/admin/stats`, authHeaders)
      ]);
      setUsers(usersRes.data);
      setMessages(msgsRes.data);
      setVideos(vidsRes.data);
      setStats(statsRes.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load data. Make sure you are an admin.');
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_URL}/users/${userId}`, authHeaders);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Delete this video? This cannot be undone.')) return;
    try {
      await axios.delete(`${API_URL}/videos/${videoId}`, authHeaders);
      setVideos(prev => prev.filter(v => v.id !== videoId));
      fetchData(); // Refresh stats
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete video');
    }
  };

  if (loading) return <div className="admin-container glass-panel"><p>Loading dashboard...</p></div>;
  if (error) return <div className="admin-container glass-panel"><div className="alert error">{error}</div></div>;

  return (
    <div className="admin-container glass-panel">
      <div className="admin-header">
        <h2>Admin Dashboard</h2>
        <p>jo no xerro — Server Management</p>
      </div>

      <div className="stats-cards">
        <div className="stat-card">
          <h3>Total Users</h3>
          <div className="stat-value">{stats.totalUsers || users.length}</div>
        </div>
        <div className="stat-card">
          <h3>Total Videos</h3>
          <div className="stat-value">{stats.totalVideos || videos.length}</div>
        </div>
        <div className="stat-card">
          <h3>Total Likes</h3>
          <div className="stat-value">{stats.totalLikes}</div>
        </div>
        <div className="stat-card">
          <h3>Total Views</h3>
          <div className="stat-value">{stats.totalViews}</div>
        </div>
      </div>

      <div className="admin-tabs">
        <button 
          className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          👥 Users
        </button>
        <button 
          className={`tab-btn ${activeTab === 'videos' ? 'active' : ''}`}
          onClick={() => setActiveTab('videos')}
        >
          📹 Videos
        </button>
        <button 
          className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          💬 Chat Monitor
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'users' && (
          <div className="users-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>#{user.id}</td>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-mini">{user.username.charAt(0).toUpperCase()}</div>
                        {user.username}
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${user.role}`}>{user.role}</span>
                    </td>
                    <td>
                      {user.role !== 'admin' && (
                        <button 
                          className="text-btn action-btn danger"
                          onClick={() => handleDeleteUser(user.id, user.username)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'messages' && (
          <div className="messages-monitor">
            <p className="monitor-note">Showing last 100 messages across all conversations.</p>
            <table className="users-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Content</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(msg => (
                  <tr key={msg.id}>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-mini">{msg.sender_username.charAt(0).toUpperCase()}</div>
                        {msg.sender_username}
                      </div>
                    </td>
                    <td>
                      <div className="user-cell">
                        <div className="user-avatar-mini receiver">{msg.receiver_username.charAt(0).toUpperCase()}</div>
                        {msg.receiver_username}
                      </div>
                    </td>
                    <td>
                      <span className={`type-badge ${msg.type}`}>{msg.type}</span>
                    </td>
                    <td className="msg-content-cell">
                      {msg.type === 'text' ? msg.content : (
                        <a href={`${msg.content}`} target="_blank" rel="noreferrer" className="video-link">
                          📹 View video
                        </a>
                      )}
                    </td>
                    <td className="timestamp-cell">
                      {new Date(msg.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {messages.length === 0 && (
                  <tr><td colSpan="5" className="empty-row">No messages yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="videos-table-container">
            <table className="users-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Uploader</th>
                  <th>Title</th>
                  <th>Views/Likes</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map(vid => (
                  <tr key={vid.id}>
                    <td>#{vid.id}</td>
                    <td>{vid.username}</td>
                    <td>{vid.title}</td>
                    <td>👁 {vid.views} | ❤️ {vid.like_count}</td>
                    <td>{new Date(vid.created_at).toLocaleDateString()}</td>
                    <td>
                      <button 
                        className="text-btn action-btn danger"
                        onClick={() => handleDeleteVideo(vid.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {videos.length === 0 && (
                  <tr><td colSpan="6" className="empty-row">No videos uploaded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Admin;
