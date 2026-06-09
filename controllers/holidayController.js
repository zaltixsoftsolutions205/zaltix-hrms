const Holiday = require('../models/Holiday');

exports.getHolidays = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const holidays = await Holiday.find({ year }).sort({ date: 1 });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUpcoming = async (req, res) => {
  try {
    const now = new Date();
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    const holidays = await Holiday.find({
      date: { $gte: now, $lte: endOfYear },
    }).sort({ date: 1 }).limit(5);
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createHoliday = async (req, res) => {
  try {
    const { name, date, type } = req.body;
    if (!name || !date) return res.status(400).json({ message: 'Name and date are required' });
    const dateObj = new Date(date);
    const year = dateObj.getFullYear();
    const holiday = await Holiday.create({ name, date: dateObj, type: type || 'national', year });
    res.status(201).json(holiday);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A holiday with this name already exists on this date' });
    res.status(500).json({ message: err.message });
  }
};

exports.deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ message: 'Not found' });
    await holiday.deleteOne();
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
