const Payslip = require('../models/Payslip');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const notificationService = require('../services/notificationService');
const { sendMail } = require('../config/mail');
const { payslipNotificationTemplate } = require('../utils/emailTemplates');
const generatePayslipPDF = require('../utils/generatePayslipPDF');
const { checkAllDocsApproved } = require('./documentController');
const moment = require('moment');
const path = require('path');
const fs = require('fs');

const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// HR / Admin: Generate payslip
exports.generatePayslip = async (req, res) => {
  const { employeeId, month, year, basicSalary, allowances, deductions, workingDays, presentDays, lwpDays } = req.body;
  try {
    const existing = await Payslip.findOne({ employee: employeeId, month, year });
    if (existing) return res.status(400).json({ message: `Payslip for ${monthNames[month - 1]} ${year} already generated` });

    const employee = await User.findById(employeeId).populate('department');
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    // Pay period label for PDF (25th of previous month → 24th of current month)
    const periodStart = moment(`${year}-${String(month).padStart(2, '0')}-25`).subtract(1, 'month').format('YYYY-MM-DD');
    const periodEnd   = moment(`${year}-${String(month).padStart(2, '0')}-24`).format('YYYY-MM-DD');

    // Use entered values directly — no attendance pro-rating
    const actualBasic       = basicSalary || 0;
    const actualWorkingDays = workingDays || 26;
    const actualPresentDays = presentDays != null ? presentDays : actualWorkingDays;
    const actualLwpDays     = lwpDays || 0;

    const totalAllowances = (allowances || []).reduce((s, a) => s + (a.amount || 0), 0);
    const totalDeductions = (deductions || []).reduce((s, d) => s + (d.amount || 0), 0);
    const grossSalary = actualBasic + totalAllowances;
    const netSalary   = grossSalary - totalDeductions;

    const payslip = await Payslip.create({
      employee: employeeId,
      month, year,
      basicSalary: actualBasic,
      allowances: allowances || employee.allowances,
      deductions: deductions || employee.deductions,
      grossSalary, netSalary,
      generatedBy: req.user._id,
      workingDays: actualWorkingDays,
      presentDays: actualPresentDays,
      lwpDays: actualLwpDays,
      status: 'published',
    });

    // Generate PDF
    try {
      const pdfPath = await generatePayslipPDF({
        employee, month, year, basicSalary: payslip.basicSalary,
        allowances: payslip.allowances, deductions: payslip.deductions,
        grossSalary, netSalary, workingDays: payslip.workingDays, presentDays: actualPresentDays,
        lwpDays: actualLwpDays,
        periodStart, periodEnd,
        accountNumber: employee.accountNumber || '',
        ifscCode: employee.ifscCode || '',
        uanNumber: employee.uanNumber || '',
      });
      payslip.pdfPath = pdfPath;
      await payslip.save();
    } catch (pdfErr) {
      console.error('PDF generation failed:', pdfErr.message);
    }

    // Notification
    await notificationService.notify(employeeId, {
      title: 'Payslip Published',
      message: `Your payslip for ${monthNames[month - 1]} ${year} is now available.`,
      type: 'payslip',
      link: '/payslips',
    });

    // Email
    try {
      await sendMail({
        to: employee.email,
        subject: `Payslip for ${monthNames[month - 1]} ${year}`,
        html: payslipNotificationTemplate({ employeeName: employee.name, month: monthNames[month - 1], year, netSalary }),
      });
    } catch (_) {}

    const populated = await Payslip.findById(payslip._id).populate('employee', 'name employeeId department').populate('generatedBy', 'name');
    res.status(201).json(populated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Employee: Get own payslips
exports.getMyPayslips = async (req, res) => {
  try {
    const payslips = await Payslip.find({ employee: req.user._id, status: 'published' }).sort({ year: -1, month: -1 });
    res.json(payslips);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Get all payslips
exports.getAllPayslips = async (req, res) => {
  const { employeeId, month, year } = req.query;
  try {
    let filter = {};
    if (employeeId) filter.employee = employeeId;
    if (month) filter.month = parseInt(month);
    if (year) filter.year = parseInt(year);
    const payslips = await Payslip.find(filter).populate('employee', 'name employeeId department').populate('generatedBy', 'name').sort({ createdAt: -1 });
    res.json(payslips);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// HR / Admin: Delete payslip
exports.deletePayslip = async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id);
    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });

    // Delete PDF file from disk if it exists
    if (payslip.pdfPath) {
      const toAbs = (p) => path.join(__dirname, '..', (p || '').replace(/^[/\\]/, ''));
      const filePath = toAbs(payslip.pdfPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await payslip.deleteOne();
    res.json({ message: 'Payslip deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Download payslip PDF
exports.downloadPayslip = async (req, res) => {
  try {
    const payslip = await Payslip.findById(req.params.id).populate('employee');
    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });

    // Access check
    if (req.user.role === 'employee' || req.user.role === 'sales') {
      if (payslip.employee._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
      
      // Profile completion check for employees
      const employee = await User.findById(req.user._id).populate('department');
      if (!employee.profilePicture) {
        return res.status(403).json({ 
          message: 'Please upload your profile photo before downloading payslips.', 
          code: 'PHOTO_REQUIRED' 
        });
      }
      
      // Document lock: employees must have all required docs approved to download payslips
      const docsApproved = await checkAllDocsApproved(req.user._id);
      if (!docsApproved) {
        return res.status(403).json({ message: 'Your onboarding documents are not fully approved yet. Please upload all required documents and wait for HR approval before downloading payslips.', code: 'DOCS_PENDING' });
      }
    }

    const toAbs = (p) => path.join(__dirname, '..', (p || '').replace(/^[/\\]/, ''));
    // Always regenerate to pick up latest template + account details
    const employee = await User.findById(payslip.employee._id).populate('department');
    const ps = payslip.toObject();
    const pStart = moment(`${ps.year}-${String(ps.month).padStart(2, '0')}-25`).subtract(1, 'month').format('YYYY-MM-DD');
    const pEnd   = moment(`${ps.year}-${String(ps.month).padStart(2, '0')}-24`).format('YYYY-MM-DD');
    const pdfPath = await generatePayslipPDF({
      ...ps, employee, periodStart: pStart, periodEnd: pEnd,
      accountNumber: employee.accountNumber || '',
      ifscCode: employee.ifscCode || '',
      uanNumber: employee.uanNumber || '',
    });
    payslip.pdfPath = pdfPath;
    await payslip.save();
    const absolutePath = toAbs(payslip.pdfPath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(500).json({ message: 'PDF generation failed' });
    }
    const fullMonthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const filename = `Payslip_${fullMonthNames[payslip.month - 1]}_${payslip.year}_${payslip.employee.employeeId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Expose Content-Disposition so the browser JS can read the filename (required for cross-origin in production)
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    fs.createReadStream(absolutePath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
