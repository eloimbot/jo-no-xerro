import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import './VideoPlayer.css';

const API_URL = '/api';
const MEDIA_URL = '/api/media';

function VideoPlayer({ token, currentUser }) {
  const { id } = useParams();
  const [video, setVideo] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVideo();
    if (token) checkLiked();
  }, [id]);

  const fetchVideo = async () => {
    try {
      const res = await axios.get(`${API_URL}/videos/${id}`);
      setVideo(res.data);
      setLikeCount(res.data.like_count);
      setLoading(false);
    } catch (err) {
      console.error('Error loading video:', err);
      setLoading(false);
    }
  };

  const checkLiked = async () => {
    try {
      const res = await axios.get(`${API_URL}/videos/${id}/liked`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLiked(res.data.liked);
    } catch (err) {}
  };

  const toggleLike = async () => {
    if (!token) return alert('Sign in to like videos');
    try {
      const res = await axios.post(`${API_URL}/videos/${id}/like`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLiked(res.data.liked);
      setLikeCount(prev => res.data.liked ? prev + 1 : prev - 1);
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this video permanently?')) return;
    try {
      await axios.delete(`${API_URL}/videos/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      window.location.href = '/';
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('es-ES', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  if (loading) return <div className="player-loading"><div className="spinner"></div></div>;
  if (!video) return <div className="player-loading"><h3>Video no encontrado</h3></div>;

  const isOwner = currentUser?.id === video.user_id;
  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="player-container">
      <div className="player-main">
        <div className="video-wrapper">
          <video
            src={`${MEDIA_URL}/${video.filename}`}
            controls
            autoPlay
            className="main-video"
          />
        </div>


        <div className="video-details glass-panel">
          <h1 className="video-detail-title">{video.title}</h1>

          <div className="video-detail-bar">
            <div className="detail-left">
              <Link to={`/profile/${video.username}`} className="author-link">
                <div className="author-avatar">{video.username.charAt(0).toUpperCase()}</div>
                <span className="author-name">{video.username}</span>
              </Link>
            </div>
            <div className="detail-right">
              <button onClick={toggleLike} className={`like-btn ${liked ? 'liked' : ''}`}>
                {liked ? '❤️' : '🤍'} {likeCount}
              </button>
              {(isOwner || isAdmin) && (
                <button onClick={handleDelete} className="delete-video-btn">🗑️ Delete</button>
              )}
            </div>
          </div>

          <div className="video-description glass-panel-dark">
            <div className="desc-meta">
              <span>{video.views} views</span>
              <span>{formatDate(video.created_at)}</span>
              <span>{formatSize(video.size)}</span>
            </div>
            {video.description && <p className="desc-text">{video.description}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default VideoPlayer;
