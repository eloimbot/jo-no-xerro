import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import './Feed.css';

const API_URL = '/api';
const STREAM_URL = '/api/stream';

function Feed() {
  const [videos, setVideos] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeed();
  }, [page]);

  const fetchFeed = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/feed?page=${page}&limit=12`);
      setVideos(prev => page === 1 ? res.data.videos : [...prev, ...res.data.videos]);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error('Error loading feed:', err);
    }
    setLoading(false);
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const formatViews = (n) => {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  };

  return (
    <div className="feed-container">
      <div className="feed-header">
        <h1>Explore</h1>
        <p className="feed-subtitle">Discover videos from the community</p>
      </div>

      {loading && videos.length === 0 ? (
        <div className="feed-loading">
          <div className="spinner"></div>
          <p>Loading videos...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="feed-empty">
          <div className="empty-icon">🎬</div>
          <h3>No videos yet</h3>
          <p>Be the first to upload a video!</p>
          <Link to="/upload" className="primary-btn">Upload Video</Link>
        </div>
      ) : (
        <>
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
                  <div className="video-avatar">{video.username.charAt(0).toUpperCase()}</div>
                  <div className="video-meta">
                    <h3 className="video-title">{video.title}</h3>
                    <p className="video-author">
                      {video.username} · {formatDate(video.created_at)}
                    </p>
                    <div className="video-stats">
                      <span>❤️ {video.like_count}</span>
                      <span>👁 {formatViews(video.views)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {page < totalPages && (
            <div className="load-more">
              <button onClick={() => setPage(p => p + 1)} className="primary-btn">
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default Feed;
