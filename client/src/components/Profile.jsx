import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './Profile.css';

const API_URL = '/api';
const MEDIA_URL = '/api/media';

function Profile() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const currentUser = JSON.parse(localStorage.getItem('user'));
  const isOwnProfile = currentUser?.username === username;

  useEffect(() => {
    fetchProfile();
    fetchUserVideos();
  }, [username]);

  const fetchProfile = async () => {
    try {
      const res = await axios.get(`${API_URL}/users/${username}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setProfile(res.data);
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const fetchUserVideos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/users/${username}/videos`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setVideos(res.data);
    } catch (err) {
      console.error('Error fetching user videos:', err);
    }
    setLoading(false);
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const res = await axios.post(`${API_URL}/user/avatar`, formData, {
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setProfile(prev => ({ ...prev, avatar_url: res.data.url }));
    } catch (err) {
      alert("Error al subir avatar");
    }
    setUploading(false);
  };

  const formatViews = (n) => {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  if (!profile && loading) return <div className="feed-loading"><div className="spinner"></div></div>;
  if (!profile) return <div className="feed-empty"><p>Usuario no encontrado</p></div>;

  return (
    <div className="profile-container">
      <div className="profile-header glass-panel">
        <div className="profile-avatar-wrapper">
          <div className="profile-avatar-large">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={username} className="avatar-img" />
            ) : (
              username.charAt(0).toUpperCase()
            )}
            {isOwnProfile && (
              <label className="avatar-edit-overlay">
                <input type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
                {uploading ? '...' : '📷'}
              </label>
            )}
          </div>
        </div>
        <div className="profile-info">
          <h2>{username}</h2>
          <p className="profile-stats">{videos.length} video{videos.length !== 1 ? 's' : ''}</p>
        </div>
      </div>


      <div className="profile-content">
        <h3 className="section-title">Videos</h3>

        {loading ? (
          <div className="feed-loading"><div className="spinner"></div></div>
        ) : videos.length === 0 ? (
          <div className="feed-empty">
            <p>Este usuario no ha subido videos aún.</p>
          </div>
        ) : (
          <div className="video-grid">
            {videos.map(video => (
              <Link to={`/video/${video.id}`} key={video.id} className="video-card glass-panel">
                <div className="video-thumbnail">
                  <video
                    src={`${MEDIA_URL}/${video.filename}`}
                    muted
                    preload="metadata"
                    onMouseEnter={(e) => { e.target.currentTime = 1; e.target.play().catch(() => {}); }}
                    onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                  />
                  <div className="play-overlay">▶</div>
                  <div className="video-views-badge">{formatViews(video.views)} views</div>
                </div>
                <div className="video-info">
                  <div className="video-meta" style={{ marginLeft: 0 }}>
                    <h3 className="video-title">{video.title}</h3>
                    <div className="video-stats">
                      <span>❤️ {video.like_count}</span>
                      <span>👁 {formatViews(video.views)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
