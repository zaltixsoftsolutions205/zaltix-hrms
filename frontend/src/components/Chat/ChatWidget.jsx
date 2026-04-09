import { useState, useRef, useEffect } from 'react';
import { useChat } from '../../contexts/ChatContext';
import { useAuth } from '../../contexts/AuthContext';

const GROUPS = [
  { id: 'all',   name: 'Everyone',   color: 'bg-violet-500', letter: 'E', desc: 'All employees' },
  { id: 'admin', name: 'Admin',      color: 'bg-rose-500',   letter: 'A', desc: 'Admin team' },
  { id: 'hr',    name: 'HR Team',    color: 'bg-blue-500',   letter: 'H', desc: 'HR department' },
  { id: 'sales', name: 'Sales Team', color: 'bg-emerald-500',letter: 'S', desc: 'Sales & Field Sales' },
];

const roleBadge = {
  admin:       'bg-rose-50 text-rose-600 border border-rose-200',
  hr:          'bg-blue-50 text-blue-600 border border-blue-200',
  sales:       'bg-emerald-50 text-emerald-600 border border-emerald-200',
  field_sales: 'bg-amber-50 text-amber-600 border border-amber-200',
  employee:    'bg-gray-50 text-gray-500 border border-gray-200',
};

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const Avatar = ({ name = '', src, size = 8, color = 'bg-violet-500' }) => {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const sz = `w-${size} h-${size}`;
  if (src) return (
    <img src={src.startsWith('/') ? `${API}${src}` : src}
      className={`${sz} rounded-full object-cover flex-shrink-0`} alt={name} />
  );
  return (
    <div className={`${sz} rounded-full ${color} text-white flex items-center justify-center text-xs font-semibold flex-shrink-0 select-none`}>
      {initials || '?'}
    </div>
  );
};

const MessageBubble = ({ msg, isMine }) => {
  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`flex gap-2 mb-4 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isMine && (
        <Avatar name={msg.sender?.name} src={msg.sender?.profilePicture} size={7} />
      )}
      <div className={`max-w-[75%] flex flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && (
          <div className="flex items-center gap-1.5 px-0.5">
            <span className="text-xs font-medium text-gray-700">{msg.sender?.name}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge[msg.sender?.role] || roleBadge.employee}`}>
              {msg.sender?.role?.replace('_', ' ')}
            </span>
          </div>
        )}
        <div className={`px-3.5 py-2 rounded-2xl text-[13px] leading-relaxed break-words
          ${isMine
            ? 'bg-violet-600 text-white rounded-tr-md shadow-sm shadow-violet-200'
            : 'bg-white text-gray-800 rounded-tl-md shadow-sm border border-gray-100'}`}>
          {msg.content}
        </div>
        <span className="text-[10px] text-gray-400 px-0.5">{time}</span>
      </div>
    </div>
  );
};

export default function ChatWidget() {
  const { user } = useAuth();
  const {
    isOpen, setIsOpen,
    activeChat, openChat, backToList,
    messages, users,
    unreadCounts, totalUnread,
    sendMessage, chatKey, connected,
  } = useChat();

  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef(null);

  const key = chatKey(activeChat);
  const currentMessages = (key && messages[key]) || [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-13 h-13 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-300 flex items-center justify-center transition-all hover:scale-105"
        style={{ width: 52, height: 52 }}
        title="Team Chat"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          className="fixed bottom-24 right-6 z-50 bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ width: 360, height: 560, maxHeight: 'calc(100vh - 110px)', border: '1px solid #ede9fe' }}
        >
          {/* ── CONVERSATION LIST ── */}
          {!activeChat && (
            <div className="flex flex-col h-full">
              {/* Header */}
              <div className="px-4 py-3.5 flex items-center justify-between border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">Team Chat</h2>
                    <div className="flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-400'}`} />
                      <p className="text-[11px] text-gray-400">{connected ? `${users.length + 1} members` : 'Connecting...'}</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Channels */}
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Channels</p>
                  <div className="grid grid-cols-2 gap-2">
                    {GROUPS.map(g => {
                      const gKey = `group:${g.id}`;
                      const unread = unreadCounts[gKey] || 0;
                      return (
                        <button
                          key={g.id}
                          onClick={() => openChat({ type: 'group', id: g.id, name: g.name })}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100 hover:border-violet-200 hover:bg-violet-50 text-left transition-all group relative"
                        >
                          <div className={`w-8 h-8 rounded-lg ${g.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                            {g.letter}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-800 truncate group-hover:text-violet-700">{g.name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{g.desc}</p>
                          </div>
                          {unread > 0 && (
                            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                              {unread}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Direct Messages */}
                <div className="px-4 pt-3 pb-3">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Direct Messages</p>
                  {/* Search */}
                  <div className="relative mb-2">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search people..."
                      className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-0.5">
                    {filteredUsers.map(u => {
                      const dKey = `direct:${u._id}`;
                      const unread = unreadCounts[dKey] || 0;
                      return (
                        <button
                          key={u._id}
                          onClick={() => openChat({ type: 'direct', id: u._id, name: u.name, role: u.role, pic: u.profilePicture })}
                          className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-gray-50 text-left transition-colors group"
                        >
                          <Avatar name={u.name} src={u.profilePicture} size={8} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate group-hover:text-violet-700">{u.name}</p>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge[u.role] || roleBadge.employee}`}>
                              {u.role?.replace('_', ' ')}
                            </span>
                          </div>
                          {unread > 0 ? (
                            <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {unread}
                            </span>
                          ) : (
                            <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MESSAGE THREAD ── */}
          {activeChat && (
            <div className="flex flex-col h-full">
              {/* Thread header */}
              <div className="flex items-center gap-3 px-3 py-3 border-b border-gray-100 flex-shrink-0">
                <button onClick={backToList}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-violet-600 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {activeChat.type === 'group' ? (
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold flex-shrink-0
                    ${GROUPS.find(g => g.id === activeChat.id)?.color || 'bg-violet-500'}`}>
                    {GROUPS.find(g => g.id === activeChat.id)?.letter || '#'}
                  </div>
                ) : (
                  <Avatar name={activeChat.name} src={activeChat.pic} size={8} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{activeChat.name}</p>
                  {activeChat.type === 'group'
                    ? <p className="text-[11px] text-gray-400">Group channel</p>
                    : <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge[activeChat.role] || roleBadge.employee}`}>
                        {activeChat.role?.replace('_', ' ')}
                      </span>
                  }
                </div>
                <button onClick={() => setIsOpen(false)}
                  className="w-7 h-7 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-gray-50/60">
                {currentMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-violet-100 flex items-center justify-center">
                      <svg className="w-6 h-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-gray-600">No messages yet</p>
                    <p className="text-xs text-gray-400">Start the conversation!</p>
                  </div>
                ) : (
                  currentMessages.map((msg) => (
                    <MessageBubble
                      key={msg._id}
                      msg={msg}
                      isMine={msg.sender?._id === user._id || msg.sender === user._id}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-3 py-3 bg-white border-t border-gray-100 flex-shrink-0">
                <div className="flex items-end gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100 transition-all">
                  <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder={`Message ${activeChat.name}...`}
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-sm text-gray-800 placeholder-gray-400 focus:outline-none max-h-24 overflow-y-auto"
                    style={{ minHeight: '22px' }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="w-7 h-7 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 text-white flex items-center justify-center flex-shrink-0 transition-colors mb-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
                <p className="text-[10px] text-gray-300 mt-1.5 pl-1">Enter to send · Shift+Enter for new line</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
