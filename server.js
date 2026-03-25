require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const employeeRoutes = require('./routes/employees');

const app = express();

// =======================
// 🔌 CONNECT DATABASE
// =======================
connectDB();

// =======================
// 🌍 CORS CONFIGURATION
// =======================
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173'
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
// 📦 MIDDLEWARE
// =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =======================
// 📁 STATIC FILES
// =======================
// Access files like:
// http://yourdomain.com/uploads/filename.pdf
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
app.use('/api/products',   require('./routes/products'));
app.use('/api/automation', require('./routes/automation'));

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

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  // Start automation scheduler after DB is ready
  const { startAutomation } = require('./services/automationService');
  startAutomation();
});