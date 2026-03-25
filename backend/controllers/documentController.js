const Document = require('../models/Document');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const path = require('path');
const fs = require('fs');

const FRESHER_DOCS = [
  'Aadhaar Card', 'PAN Card', '10th Marksheet', '12th Marksheet',
  'Graduation Certificate', 'Bank Passbook/Cheque', 'Passport Photo',
];

const EXPERIENCED_DOCS = [
  'Aadhaar Card', 'PAN Card', 'Previous Employment Letter',
  'Last Payslip', 'Experience Certificate', 'Bank Passbook/Cheque', 'Passport Photo',
];

const getRequiredDocs = (employeeType) =>
  employeeType === 'fresher' ? FRESHER_DOCS : EXPERIENCED_DOCS;

exports.FRESHER_DOCS = FRESHER_DOCS;
exports.EXPERIENCED_DOCS = EXPERIENCED_DOCS;
exports.getRequiredDocs = getRequiredDocs;

// Employee: get own documents (with required list structure)
exports.getMyDocuments = async (req, res) => {
  try {
    const employee = await User.findById(req.user._id);
    if (!employee.employeeType) return res.json({ employeeType: null, docs: [] });

    const required = getRequiredDocs(employee.employeeType);
    const uploaded = await Document.find({ employee: req.user._id }).populate('reviewedBy', 'name');

    // Build a full list with status for each required doc
    const docs = required.map(docType => {
      const found = uploaded.find(d => d.docType === docType);
      return found || { docType, status: 'pending_upload', filePath: null, rejectionReason: '' };
    });

    res.json({ employeeType: employee.employeeType, docs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: upload a document
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { docType } = req.body;
    if (!docType) return res.status(400).json({ message: 'Document type is required' });

    const employee = await User.findById(req.user._id);
    if (!employee.employeeType) return res.status(400).json({ message: 'No onboarding type set for this account' });

    const required = getRequiredDocs(employee.employeeType);
    if (!required.includes(docType)) return res.status(400).json({ message: 'Invalid document type' });

    const relPath = 'uploads/documents/' + req.file.filename;

    const doc = await Document.findOneAndUpdate(
      { employee: req.user._id, docType },
      { filePath: relPath, status: 'uploaded', uploadedAt: new Date(), rejectionReason: '', reviewedAt: null, reviewedBy: null },
      { upsert: true, new: true }
    );

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/Admin: get all documents for a specific employee
exports.getEmployeeDocuments = async (req, res) => {
  try {
    const employee = await User.findById(req.params.employeeId);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (!employee.employeeType) return res.json({ employeeType: null, docs: [] });

    const required = getRequiredDocs(employee.employeeType);
    const uploaded = await Document.find({ employee: req.params.employeeId }).populate('reviewedBy', 'name');

    const docs = required.map(docType => {
      const found = uploaded.find(d => d.docType === docType);
      return found || { docType, status: 'pending_upload', filePath: null, rejectionReason: '' };
    });

    res.json({ employeeType: employee.employeeType, docs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR/Admin: approve or reject a document
exports.reviewDocument = async (req, res) => {
  const { status, rejectionReason } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be approved or rejected' });
  }
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (doc.status === 'pending_upload') {
      return res.status(400).json({ message: 'Employee has not uploaded this document yet' });
    }

    doc.status = status;
    doc.rejectionReason = status === 'rejected' ? (rejectionReason || '') : '';
    doc.reviewedAt = new Date();
    doc.reviewedBy = req.user._id;
    await doc.save();

    // Notify the employee
    await notificationService.notify(doc.employee, {
      title: `Document ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message: `Your ${doc.docType} has been ${status}${status === 'rejected' && rejectionReason ? ': ' + rejectionReason : ''}.`,
      type: 'document',
    });

    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Helper: check if all docs are approved (used in payslip download lock)
exports.checkAllDocsApproved = async (employeeId) => {
  const employee = await User.findById(employeeId).lean();
  if (!employee || !employee.employeeType) return true; // no lock for employees without onboarding type

  const required = getRequiredDocs(employee.employeeType);
  const approvedCount = await Document.countDocuments({ employee: employeeId, status: 'approved' });
  return approvedCount >= required.length;
};
