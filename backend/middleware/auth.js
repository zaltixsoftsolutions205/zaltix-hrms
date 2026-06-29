const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password').populate('department');
    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    // Block deactivated accounts even if they hold a valid token.
    if (req.user.isActive === false) {
      return res.status(403).json({ message: 'Your account is inactive. Please contact HR.' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

module.exports = { protect };
