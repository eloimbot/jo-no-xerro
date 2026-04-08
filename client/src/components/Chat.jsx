import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import './Chat.css';

const API_URL = '/api';

function Chat() {
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('contacts'); // 'contacts' or 'groups'
  const [contacts, setContacts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null); // { id, name, type: 'direct'|'group' }
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showStickers, setShowStickers] = useState(false);
  const [stickers, setStickers] = useState([]);
  const [isChatOpen, setIsChatOpen] = useState(false); // Mobile view toggle
  
  // Media recording state
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const messagesEndRef = useRef(null);

  const user = JSON.parse(localStorage.getItem('user'));
  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
    const newSocket = io('/', { auth: { token } });
    
    newSocket.on('receive_message', (message) => {
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    });

    newSocket.on('message_deleted', (payload) => {
      setMessages((prev) => prev.map(m => m.id === payload.messageId ? { ...m, is_deleted: 1, deleted_by_username: payload.deletedBy } : m));
    });


    setSocket(newSocket);
    return () => newSocket.close();
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadMessages();
    }
  }, [selectedChat]);

  const fetchData = async () => {
    try {
      const [contRes, groupRes, stickRes] = await Promise.all([
        axios.get(`${API_URL}/contacts`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/groups`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/stickers`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setContacts(contRes.data);
      setGroups(groupRes.data);
      setStickers(stickRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  const loadMessages = async () => {
    try {
      const res = await axios.get(`${API_URL}/messages/${selectedChat.type}/${selectedChat.id}`, {
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

  const handleSendMessage = (e, contentOverride = null, typeOverride = 'text') => {
    e?.preventDefault();
    const content = contentOverride || newMessage;
    if (!content || !selectedChat || !socket) return;

    socket.emit('send_message', {
      receiverId: selectedChat.id,
      chatType: selectedChat.type,
      content: content,
      type: typeOverride
    });

    if (!contentOverride) setNewMessage('');
  };

  const startMediaRecording = async (type) => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("El navegador no soporta grabación o necesita usar HTTPS / localhost.");
      }
      
      const constraints = type === 'video' ? { video: true, audio: true } : { audio: true };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: type === 'video' ? 'video/mp4' : 'audio/webm' });
        const formData = new FormData();
        formData.append('media', blob, `recording.${type === 'video' ? 'mp4' : 'webm'}`);
        
        try {
          const res = await axios.post(`${API_URL}/upload`, formData, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
          });
          handleSendMessage(null, res.data.url, type);
        } catch (err) {
          console.error('Upload failed', err);
          alert('Error subiendo el archivo: ' + err.message);
        }
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      if (type === 'video') setIsRecordingVideo(true);
      else setIsRecordingAudio(true);
    } catch (err) {
      console.error("Recording error:", err);
      alert(`No se pudo usar la grabadora:\n${err.message || err.name}`);
    }
  };

  const stopMediaRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecordingVideo(false);
    setIsRecordingAudio(false);
  };

  const deleteMessage = (id) => {
    if (window.confirm("¿Borrar mensaje?")) {
      socket.emit('delete_message', id);
    }
  };

  const addContact = async () => {
    const username = prompt("Nombre de usuario:");
    if (!username) return;
    try {
      await axios.post(`${API_URL}/contacts/add`, { username }, { headers: { Authorization: `Bearer ${token}` } });
      alert("Solicitud enviada");
      fetchData();
    } catch (err) {
      alert("Usuario no encontrado");
    }
  };

  const createGroup = async () => {
    const name = prompt("Nombre del grupo:");
    if (!name) return;
    
    // Simple member selection
    const memberNames = contacts
      .filter(c => c.status === 'accepted')
      .map(c => c.username);
    
    let selectedIds = [];
    if (memberNames.length > 0) {
        const added = prompt(`Añadir miembros (separados por coma): \nDisponibles: ${memberNames.join(', ')}`);
        if (added) {
            const names = added.split(',').map(n => n.trim());
            names.forEach(n => {
                const contact = contacts.find(c => c.username === n);
                if (contact) selectedIds.push(contact.id);
            });
        }
    }

    try {
      await axios.post(`${API_URL}/groups/create`, { name, memberIds: selectedIds }, { headers: { Authorization: `Bearer ${token}` } });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const addMemberToGroup = async () => {

    if (!selectedChat || selectedChat.type !== 'group') return;
    const username = prompt("Nombre del usuario a añadir:");
    if (!username) return;
    
    try {
      const contact = contacts.find(c => c.username === username);
      if (!contact) return alert("Usuario no encontrado en tus contactos");
      
      await axios.post(`${API_URL}/groups/${selectedChat.id}/add-member`, { userId: contact.id }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("Miembro añadido");
    } catch (err) {
      alert(err.response?.data?.error || "Error al añadir miembro");
    }
  };

  const deleteGroup = async () => {

    if (!selectedChat || selectedChat.type !== 'group') return;
    if (!window.confirm(`¿Seguro que quieres borrar el grupo "${selectedChat.name}"? Esta acción borrará todos los mensajes para todos.`)) return;
    
    try {
      await axios.delete(`${API_URL}/groups/${selectedChat.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("Grupo borrado");
      setSelectedChat(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || "Error al borrar grupo");
    }
  };


  return (

    <div className={`chat-container ${isChatOpen ? 'chat-open' : ''}`}>
      <div className="users-sidebar glass-panel">
        <div className="sidebar-header">
          <h2 className="sidebar-title">Chat App</h2>
          <button className="text-btn" onClick={activeTab === 'contacts' ? addContact : createGroup}>
            {activeTab === 'contacts' ? '➕ Contacto' : '👥 Nuevo Grupo'}
          </button>
        </div>
        
        <div className="sidebar-tabs">
          <button className={`tab-btn ${activeTab === 'contacts' ? 'active' : ''}`} onClick={() => setActiveTab('contacts')}>Chat</button>
          <button className={`tab-btn ${activeTab === 'groups' ? 'active' : ''}`} onClick={() => setActiveTab('groups')}>Grupos</button>
        </div>

        <div className="users-list">
          {activeTab === 'contacts' ? (
            contacts.map(c => (
              <div key={c.id} className={`user-card ${selectedChat?.id === c.id && selectedChat.type === 'direct' ? 'active' : ''}`} onClick={() => { setSelectedChat({ ...c, name: c.username, type: 'direct' }); setIsChatOpen(true); }}>
                <div className="avatar" style={{ background: 'var(--primary)' }}>
                  {c.avatar_url ? <img src={c.avatar_url} alt={c.username} className="avatar-img-small" /> : c.username[0].toUpperCase()}
                </div>
                <div className="user-info">
                  <span className="username">{c.username}</span>
                  <span className="last-msg">{c.status === 'pending' ? 'Pendiente...' : 'Toca para chatear'}</span>
                </div>
              </div>
            ))
          ) : (
            groups.map(g => (
              <div key={g.id} className={`user-card ${selectedChat?.id === g.id && selectedChat.type === 'group' ? 'active' : ''}`} onClick={() => { setSelectedChat({ ...g, type: 'group' }); setIsChatOpen(true); }}>
                <div className="avatar" style={{ background: '#10b981' }}>G</div>
                <div className="user-info">
                  <span className="username">{g.name}</span>
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      <div className="chat-main">
        {selectedChat ? (
          <>
            <div className="chat-header">
              <div className="header-left">
                <button className="back-btn" onClick={() => setIsChatOpen(false)}>←</button>
                <div className="avatar" style={{ background: selectedChat.type === 'group' ? '#10b981' : 'var(--primary)' }}>
                  {selectedChat.name[0].toUpperCase()}
                </div>
                <div className="user-details">
                  <h3>{selectedChat.name}</h3>
                  <span className="status">{selectedChat.type === 'group' ? 'Grupo' : 'Chat Privado'}</span>
                </div>
              </div>
              <div className="header-actions">
                {selectedChat.type === 'group' && (
                  <>
                    <button className="icon-btn" title="Añadir miembro" onClick={addMemberToGroup}>👤+</button>
                    <button className="icon-btn danger" title="Borrar grupo" onClick={deleteGroup}>🗑️</button>
                  </>
                )}
              </div>

            </div>


            <div className="messages-area">
              {messages.map((msg, i) => (
                <div key={i} className={`message-wrapper ${msg.sender_id === user.id ? 'sent' : 'received'}`}>
                  {msg.chat_type === 'group' && msg.sender_id !== user.id && (
                    <span className="sender-name">{msg.sender_username}</span>
                  )}
                  <div className={`message-bubble ${msg.is_deleted ? 'deleted' : ''}`}>

                    <div className="bubble-content">
                      {msg.is_deleted ? (
                        <p className="deleted-text">
                          <i>Mensaje borrado por {msg.deleted_by_username || 'el sistema'}</i>
                        </p>
                      ) : (
                        <>
                          {msg.type === 'text' && <p>{msg.content}</p>}
                          {msg.type === 'video' && <video src={`${msg.content}?token=${token}`} controls className="media-msg" />}
                          {msg.type === 'audio' && <audio src={`${msg.content}?token=${token}`} controls className="audio-msg" />}
                          {msg.type === 'sticker' && <img src={msg.content} className="sticker-img" style={{ maxWidth: 100 }} />}
                        </>
                      )}
                    </div>

                    <div className="message-info">
                      <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {msg.sender_id === user.id && <button className="delete-msg-btn" onClick={() => deleteMessage(msg.id)}>✕</button>}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="message-input-area" onSubmit={handleSendMessage}>
              <div className="input-actions">
                <button type="button" className={`action-btn ${isRecordingVideo ? 'recording' : ''}`} onClick={isRecordingVideo ? stopMediaRecording : () => startMediaRecording('video')}>📹</button>
                <button type="button" className={`action-btn ${isRecordingAudio ? 'recording' : ''}`} onClick={isRecordingAudio ? stopMediaRecording : () => startMediaRecording('audio')}>🎤</button>
                <button type="button" className="action-btn" onClick={() => setShowStickers(!showStickers)}>✨</button>
              </div>
              
              <div className="message-input-wrapper">
                {showStickers && (
                  <div className="sticker-panel glass-panel">
                    {stickers.map(s => (
                      <div key={s.id} className="sticker-item" onClick={() => { handleSendMessage(null, s.url, 'sticker'); setShowStickers(false); }}>
                        <img src={s.url} className="sticker-img" />
                      </div>
                    ))}
                    {stickers.length === 0 && <p style={{ fontSize: '0.8rem' }}>Sin stickers</p>}
                  </div>
                )}
                <input type="text" className="message-input" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Escribe algo..." />
              </div>
              
              <button type="submit" className="primary-btn send-btn" disabled={!newMessage.trim()}>➤</button>
            </form>
          </>
        ) : (
          <div className="no-chat-selected">
            <h2>Selecciona un chat</h2>
            <p>Agrega contactos y crea grupos para empezar.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Chat;
