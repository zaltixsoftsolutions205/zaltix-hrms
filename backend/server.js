require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const connectDB = require('./config/db');
const { Server } = require('socket.io');
const Message = require('./models/Message');

// Ensure upload directories exist on startup
['uploads', 'uploads/payslips', 'uploads/profiles', 'uploads/documents', 'uploads/receipts'].forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

const app = express();
const server = http.createServer(app);

// =======================
// 🔌 CONNECT DATABASE
// =======================
connectDB();

// =======================
// 🌍 CORS CONFIGURATION
// =======================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174'
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('CORS not allowed'));
      }
    },
    credentials: true,
    exposedHeaders: ['Content-Disposition'],
  })
);

// =======================
// 🔌 SOCKET.IO
// =======================
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// JWT auth middleware for socket
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication error'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = decoded;
    next();
  } catch {
    next(new Error('Authentication error'));
  }
});

// Role → group room mapping
const roleToRooms = {
  admin:      ['all', 'admin'],
  hr:         ['all', 'hr'],
  sales:      ['all', 'sales'],
  field_sales:['all', 'sales'],
  employee:   ['all'],
};

io.on('connection', (socket) => {
  const { id: _id, role, name } = socket.user;

  // Join role-based group rooms + personal room
  const rooms = roleToRooms[role] || ['all'];
  rooms.forEach(r => socket.join(`group:${r}`));
  socket.join(`user:${_id}`);

  // Send a group message
  socket.on('group_message', async ({ group, content }) => {
    const validGroups = ['all', 'admin', 'hr', 'sales', 'my_team'];
    if (!validGroups.includes(group) || !content?.trim()) return;

    try {
      const msg = await Message.create({
        sender: _id,
        chatType: 'group',
        group,
        content: content.trim(),
        readBy: [_id],
      });
      const populated = await msg.populate('sender', 'name role profilePicture employeeId');
      io.to(`group:${group}`).emit('new_message', populated);
    } catch (err) {
      console.error('group_message error:', err.message);
    }
  });

  // Send a direct message
  socket.on('direct_message', async ({ receiverId, content }) => {
    if (!receiverId || !content?.trim()) return;

    try {
      const msg = await Message.create({
        sender: _id,
        chatType: 'direct',
        receiverId,
        content: content.trim(),
        readBy: [_id],
      });
      const populated = await msg.populate('sender', 'name role profilePicture employeeId');

      // Send to receiver and sender
      io.to(`user:${receiverId}`).emit('new_message', populated);
      io.to(`user:${_id}`).emit('new_message', populated);
    } catch (err) {
      console.error('direct_message error:', err.message);
    }
  });

  // Mark direct messages as read
  socket.on('mark_read', async ({ fromUserId }) => {
    try {
      await Message.updateMany(
        { chatType: 'direct', sender: fromUserId, receiverId: _id, readBy: { $ne: _id } },
        { $addToSet: { readBy: _id } }
      );
    } catch (err) {
      console.error('mark_read error:', err.message);
    }
  });

  socket.on('disconnect', () => {});
});

// =======================
// 📦 MIDDLEWARE
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
// 📁 STATIC FILES
// =======================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// 🚀 ROUTES
// =======================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/userRoutes'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/payslips', require('./routes/payslips'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/deals', require('./routes/deals'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/announcements', require('./routes/announcements'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/quotations', require('./routes/quotations'));
app.use('/api/purchase-orders', require('./routes/purchaseOrders'));
app.use('/api/recruitment', require('./routes/recruitment'));
app.use('/api/products',    require('./routes/products'));
app.use('/api/field-leads', require('./routes/fieldLeads'));
app.use('/api/automation', require('./routes/automation'));
app.use('/api/kt',         require('./routes/kt'));
app.use('/api/chat',       require('./routes/chat'));

// =======================
// ❤️ HEALTH CHECK
// =======================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// =======================
// ❌ GLOBAL ERROR HANDLER
// =======================
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({
    success: false,
    message: err.message || 'Server Error',
  });
});

// =======================
// 🟢 START SERVER
// =======================
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  const { startAutomation } = require('./services/automationService');
  startAutomation();
});
