import { useState, useRef } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './Upload.css';

const API_URL = '/api';

function Upload({ token }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleFile = (f) => {
    if (!f) return;
    if (!f.type.startsWith('video/')) {
      setError('Only video files are allowed');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Please select a video file');
    if (!title.trim()) return setError('Title is required');

    setUploading(true);
    setError('');

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', title.trim());
    formData.append('description', description.trim());

    try {
      const res = await axios.post(`${API_URL}/videos/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / e.total);
          setProgress(pct);
        }
      });
      navigate(`/video/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Try again.');
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
  };

  return (
    <div className="upload-container">
      <div className="upload-card glass-panel">
        <h2>Upload Video</h2>
        <p className="upload-subtitle">Share your video with the community</p>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={handleSubmit} className="upload-form">
          {!file ? (
            <div
              className={`dropzone ${dragOver ? 'drag-over' : ''}`}
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="dropzone-icon">📤</div>
              <p className="dropzone-title">Drop your video here</p>
              <p className="dropzone-hint">or click to browse · Max 2 GB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                hidden
                onChange={(e) => handleFile(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="file-preview">
              <video src={preview} controls className="preview-video" />
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-size">{formatSize(file.size)}</span>
                <button type="button" className="text-btn" onClick={() => { setFile(null); setPreview(null); }}>
                  Change file
                </button>
              </div>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="video-title">Title *</label>
            <input
              id="video-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give your video a title"
              required
              disabled={uploading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="video-desc">Description</label>
            <textarea
              id="video-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your video (optional)"
              rows={4}
              disabled={uploading}
            />
          </div>

          {uploading && (
            <div className="progress-container">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
              <span className="progress-text">{progress}%</span>
            </div>
          )}

          <button type="submit" className="primary-btn upload-btn" disabled={uploading || !file}>
            {uploading ? `Uploading... ${progress}%` : '🚀 Upload Video'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Upload;
