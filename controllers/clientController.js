const Client = require('../models/Client');
const Deal = require('../models/Deal');

const ownerFilter = (user) => user.role === 'admin' || user.role === 'hr' ? {} : { assignedTo: user._id };

// List clients
exports.getClients = async (req, res) => {
  const { search } = req.query;
  try {
    let filter = ownerFilter(req.user);
    if (search) {
      const regex = new RegExp(search, 'i');
      filter.$or = [
        { name: regex },
        { company: regex },
        { tags: regex },
      ];
    }

    const clients = await Client.find(filter)
      .populate('lead', 'name phone email status serviceType')
      .populate('assignedTo', 'name employeeId')
      .sort({ convertedDate: -1 });

    res.json(clients);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get single client
exports.getClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .populate({ path: 'lead', populate: { path: 'activities.by', select: 'name' } })
      .populate('assignedTo', 'name employeeId');
    if (!client) return res.status(404).json({ message: 'Client not found' });
    if (req.user.role === 'sales' && client.assignedTo._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(client);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update client
exports.updateClient = async (req, res) => {
  const { company, notes, tags } = req.body;
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    if (req.user.role === 'sales' && client.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (company !== undefined) client.company = company;
    if (notes !== undefined) client.notes = notes;
    if (tags !== undefined) client.tags = tags;
    await client.save();

    const populated = await Client.findById(client._id)
      .populate('lead', 'name phone email status serviceType')
      .populate('assignedTo', 'name employeeId');
    res.json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete client (hr/admin only)
exports.deleteClient = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    await client.deleteOne();
    res.json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Client stats
exports.getClientStats = async (req, res) => {
  try {
    const base = ownerFilter(req.user);
    const [totalClients, agg] = await Promise.all([
      Client.countDocuments(base),
      Client.aggregate([
        { $match: base },
        { $group: { _id: null, totalDealValue: { $sum: '$dealValue' } } },
      ]),
    ]);
    const totalDealValue = agg[0]?.totalDealValue || 0;
    res.json({
      totalClients,
      totalDealValue,
      avgDealValue: totalClients > 0 ? Math.round(totalDealValue / totalClients) : 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
