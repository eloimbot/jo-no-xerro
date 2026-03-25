import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './Profile.css';

const API_URL = '/api';
const STREAM_URL = '/api/stream';

function Profile() {
  const { username } = useParams();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserVideos();
  }, [username]);

  const fetchUserVideos = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/users/${username}/videos`);
      setVideos(res.data);
    } catch (err) {
      console.error('Error fetching user videos:', err);
    }
    setLoading(false);
  };

  const formatViews = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="profile-container">
      <div className="profile-header glass-panel">
        <div className="profile-avatar-large">{username.charAt(0).toUpperCase()}</div>
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
            <p>This user hasn't uploaded any videos yet.</p>
          </div>
        ) : (
          <div className="video-grid">
            {videos.map(video => (
              <Link to={`/video/${video.id}`} key={video.id} className="video-card">
                <div className="video-thumbnail">
                  <video
                    src={`${STREAM_URL}/${video.filename}`}
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
