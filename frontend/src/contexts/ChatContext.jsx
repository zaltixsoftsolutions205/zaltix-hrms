import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import api from '../utils/api';

const ChatContext = createContext(null);

// Strip /api suffix — socket connects to base URL, not /api
const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api$/, '');

export const ChatProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [users, setUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [connected, setConnected] = useState(false);

  const chatKey = useCallback((chat) => {
    if (!chat) return null;
    return chat.type === 'group' ? `group:${chat.id}` : `direct:${chat.id}`;
  }, []);

  // Connect socket when user is logged in
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('token');
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['polling', 'websocket'],
      upgrade: true,
    });

    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('new_message', (msg) => {
      // For direct messages, only process if current user is sender or receiver
      if (msg.chatType === 'direct') {
        const isSender = String(msg.sender?._id) === String(user._id);
        const isReceiver = String(msg.receiverId) === String(user._id);
        if (!isSender && !isReceiver) return;
      }

      const key =
        msg.chatType === 'group'
          ? `group:${msg.group}`
          : String(msg.sender?._id) === String(user._id)
          ? `direct:${msg.receiverId}`
          : `direct:${msg.sender?._id}`;

      setMessages((prev) => {
        const existing = prev[key] || [];
        // Deduplicate: replace optimistic message (no _id) or skip if already exists
        const alreadyExists = existing.some(m => m._id && m._id === msg._id);
        if (alreadyExists) return prev;
        // Replace optimistic placeholder if present
        const withoutOptimistic = existing.filter(m => m._id || m._tempId !== msg._tempId);
        return { ...prev, [key]: [...withoutOptimistic, msg] };
      });

      // Increment unread if chat is not currently open
      setIsOpen((open) => {
        setActiveChat((active) => {
          const isActive = open && active && chatKey(active) === key;
          const isMine = String(msg.sender?._id) === String(user._id);
          if (!isActive && !isMine) {
            setUnreadCounts((prev) => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
            setTotalUnread((n) => n + 1);
          }
          return active;
        });
        return open;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user, chatKey]);

  // Fetch user list
  useEffect(() => {
    if (!user) return;
    api.get('/chat/users').then((r) => setUsers(r.data)).catch(() => {});
  }, [user]);

  // Fetch unread counts on mount
  useEffect(() => {
    if (!user) return;
    api.get('/chat/unread').then((r) => {
      const counts = {};
      let total = 0;
      (r.data.directUnread || []).forEach(({ _id, count }) => {
        counts[`direct:${_id}`] = count;
        total += count;
      });
      setUnreadCounts(counts);
      setTotalUnread(total);
    }).catch(() => {});
  }, [user]);

  const openChat = useCallback(async (chat) => {
    setActiveChat(chat);
    setIsOpen(true);
    const key = chatKey(chat);

    setUnreadCounts((prev) => {
      const cleared = prev[key] || 0;
      if (cleared > 0) {
        setTotalUnread((n) => Math.max(0, n - cleared));
        return { ...prev, [key]: 0 };
      }
      return prev;
    });

    // Always reload history when opening a chat
    try {
      let res;
      if (chat.type === 'group') {
        res = await api.get(`/chat/group/${chat.id}`);
      } else {
        res = await api.get(`/chat/direct/${chat.id}`);
        socketRef.current?.emit('mark_read', { fromUserId: chat.id });
      }
      setMessages((prev) => ({ ...prev, [key]: res.data }));
    } catch {
      setMessages((prev) => ({ ...prev, [key]: prev[key] || [] }));
    }
  }, [chatKey]);

  const sendMessage = useCallback((content) => {
    if (!activeChat || !content.trim() || !socketRef.current) return;

    const key = chatKey(activeChat);
    const tempId = `temp_${Date.now()}`;

    // Optimistic update — show immediately without waiting for server echo
    const optimisticMsg = {
      _tempId: tempId,
      _id: null,
      chatType: activeChat.type === 'group' ? 'group' : 'direct',
      group: activeChat.type === 'group' ? activeChat.id : null,
      receiverId: activeChat.type === 'direct' ? activeChat.id : null,
      sender: { _id: user._id, name: user.name, role: user.role, profilePicture: user.profilePicture },
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => ({ ...prev, [key]: [...(prev[key] || []), optimisticMsg] }));

    if (activeChat.type === 'group') {
      socketRef.current.emit('group_message', { group: activeChat.id, content });
    } else {
      socketRef.current.emit('direct_message', { receiverId: activeChat.id, content });
    }
  }, [activeChat, chatKey, user]);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    setActiveChat(null);
  }, []);

  const backToList = useCallback(() => {
    setActiveChat(null);
  }, []);

  return (
    <ChatContext.Provider value={{
      isOpen, setIsOpen,
      activeChat, openChat, closeChat, backToList,
      messages, users,
      unreadCounts, totalUnread,
      sendMessage, chatKey, connected,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
