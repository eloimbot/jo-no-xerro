import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import './Chat.css';

const API_URL = '/api';

function Chat({ config }) {
  const [socket, setSocket] = useState(null);
  const [users, setUsers] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  // Video recording state
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`${API_URL}/chat/users`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsers(res.data);
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    };
    fetchUsers();

    const token = localStorage.getItem('token');
    const newSocket = io('/', {
      auth: { token }
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    newSocket.on('user_status', (onlineUserIds) => {
      setOnlineUsers(onlineUserIds);
    });

    newSocket.on('receive_message', (message) => {
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (selectedUser) {
      loadMessages(selectedUser.id);
    }
  }, [selectedUser]);

  const loadMessages = async (userId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/messages/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessages(res.data);
      scrollToBottom();
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    socket.emit('send_message', {
      receiverId: selectedUser.id,
      content: newMessage,
      type: 'text'
    });

    setNewMessage('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        // Upload video logic (send to the API, then send message with URL)
        // Since we changed the uploads API to social videos, let's just 
        // simulate a message with the video file name for now.
        const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' });
        const formData = new FormData();
        formData.append('video', file);
        formData.append('title', 'Chat Video');
        
        try {
          const token = localStorage.getItem('token');
          const res = await axios.post(`${API_URL}/videos/upload`, formData, {
            headers: { 
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data'
            }
          });
          
          socket.emit('send_message', {
            receiverId: selectedUser.id,
            content: `Uploaded Video ID: ${res.data.id}`,
            type: 'video'
          });
        } catch (err) {
          console.error('Error uploading video message', err);
        }

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing media devices.", err);
      alert("Could not access camera/microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const user = JSON.parse(localStorage.getItem('user'));

  return (
    <div className="chat-container">
      <div className="users-sidebar glass-panel">
        <h3 className="sidebar-title">Contacts</h3>
        <div className="users-list">
          {users.map((u) => (
            <div 
              key={u.id} 
              className={`user-card ${selectedUser?.id === u.id ? 'active' : ''}`}
              onClick={() => setSelectedUser(u)}
            >
              <div className="avatar" style={{ backgroundColor: u.avatar_color || 'var(--primary)' }}>
                {u.username.charAt(0).toUpperCase()}
                {onlineUsers.includes(u.id) && <div className="online-indicator"></div>}
              </div>
              <span className="username">{u.username}</span>
            </div>
          ))}
          {users.length === 0 && <p className="no-users">No other users found.</p>}
        </div>
      </div>

      <div className="chat-main glass-panel">
        {selectedUser ? (
          <>
            <div className="chat-header">
              <div className="avatar" style={{ backgroundColor: selectedUser.avatar_color || 'var(--primary)' }}>
                {selectedUser.username.charAt(0).toUpperCase()}
              </div>
              <div className="user-details">
                <h3>{selectedUser.username}</h3>
                <span className="status">{onlineUsers.includes(selectedUser.id) ? 'Online' : 'Offline'}</span>
              </div>
            </div>
            
            <div className="messages-area">
              {messages.map((msg, index) => {
                const isMe = msg.sender_id === user.id;
                return (
                  <div key={index} className={`message-wrapper ${isMe ? 'sent' : 'received'}`}>
                    <div className="message-bubble">
                      {msg.type === 'video' ? (
                        <div className="video-message">
                          <span>🎥 {msg.content}</span>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      <span className="time">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input-area" onSubmit={handleSendMessage}>
              <button 
                type="button" 
                className={`record-btn ${isRecording ? 'recording pulse-glow' : ''}`}
                onClick={isRecording ? stopRecording : startRecording}
                title={isRecording ? "Stop Recording" : "Record Video Message"}
              >
                {isRecording ? '⏹' : '📹'}
              </button>
              <input 
                type="text" 
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
              />
              <button type="submit" className="send-btn primary-btn" disabled={!newMessage.trim()}>
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            <h2>Select a contact to start chatting</h2>
            <p>You can send text and video messages in real-time.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
