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
  const [activeChat, setActiveChat] = useState(null); // { type: 'group'|'direct', id: string, name: string }
  const [messages, setMessages] = useState({}); // key -> messages[]
  const [users, setUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({}); // key -> count
  const [totalUnread, setTotalUnread] = useState(0);

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
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

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
          : String(msg.sender._id) === String(user._id)
          ? `direct:${msg.receiverId}`
          : `direct:${msg.sender._id}`;

      setMessages((prev) => ({
        ...prev,
        [key]: [...(prev[key] || []), msg],
      }));

      // Increment unread if chat is not currently open
      setIsOpen((open) => {
        setActiveChat((active) => {
          const currentKey =
            msg.chatType === 'group'
              ? `group:${msg.group}`
              : String(msg.sender._id) === String(user._id)
              ? `direct:${msg.receiverId}`
              : `direct:${msg.sender._id}`;

          const isActive = open && active && chatKey(active) === currentKey;
          const isMine = String(msg.sender._id) === String(user._id);

          if (!isActive && !isMine) {
            setUnreadCounts((prev) => ({
              ...prev,
              [currentKey]: (prev[currentKey] || 0) + 1,
            }));
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

    // Clear unread for this chat
    setUnreadCounts((prev) => {
      const cleared = prev[key] || 0;
      if (cleared > 0) {
        setTotalUnread((n) => Math.max(0, n - cleared));
        return { ...prev, [key]: 0 };
      }
      return prev;
    });

    // Load history if not loaded
    if (!messages[key]) {
      try {
        let res;
        if (chat.type === 'group') {
          res = await api.get(`/chat/group/${chat.id}`);
        } else {
          res = await api.get(`/chat/direct/${chat.id}`);
          // mark as read on socket too
          socketRef.current?.emit('mark_read', { fromUserId: chat.id });
        }
        setMessages((prev) => ({ ...prev, [key]: res.data }));
      } catch {
        setMessages((prev) => ({ ...prev, [key]: [] }));
      }
    } else if (chat.type === 'direct') {
      socketRef.current?.emit('mark_read', { fromUserId: chat.id });
    }
  }, [chatKey, messages]);

  const sendMessage = useCallback((content) => {
    if (!activeChat || !content.trim() || !socketRef.current) return;
    if (activeChat.type === 'group') {
      socketRef.current.emit('group_message', { group: activeChat.id, content });
    } else {
      socketRef.current.emit('direct_message', { receiverId: activeChat.id, content });
    }
  }, [activeChat]);

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
      sendMessage, chatKey,
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
