const fs = require('fs');
const path = require('path');
const _logoPath = path.join(__dirname, '../../frontend/public/logo.png');
const _logoB64 = fs.existsSync(_logoPath) ? fs.readFileSync(_logoPath).toString('base64') : '';
const LOGO_SRC = _logoB64 ? `data:image/png;base64,${_logoB64}` : `${process.env.FRONTEND_URL || ''}/logo.png`;

const logoHeader = `<div style="text-align:center;padding:20px 0 22px;border-bottom:2px solid #ede9fe;margin-bottom:24px;">
  <img src="${LOGO_SRC}" alt="Zaltix Soft Solutions" style="height:50px;object-fit:contain;" />
</div>`;

const offerLetterTemplate = ({ employeeName, position, department, joiningDate, salary, companyName = 'Zaltix Soft Solutions' }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; background: #f9f9f9; margin:0; padding:20px; }
.container { max-width:600px; margin:auto; background:#fff; border-radius:12px; padding:40px; border:1px solid #e0d7ff; }
h1 { color:#4C1D95; } h2 { color:#7C3AED; }
.highlight { color:#D97706; font-weight:bold; }
.footer { margin-top:30px; color:#888; font-size:12px; }
</style></head>
<body>
<div class="container">
  ${logoHeader}
  <h2>Offer Letter</h2>
  <p>Dear <strong>${employeeName}</strong>,</p>
  <p>We are pleased to offer you the position of <span class="highlight">${position}</span> in the <strong>${department}</strong> department.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">Joining Date</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;">${joiningDate}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">Basic Salary</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;color:#D97706;">₹${salary} / month</td></tr>
  </table>
  <p>Please confirm your acceptance by replying to this email.</p>
  <p>We look forward to having you on board!</p>
  <div class="footer">This is an automated message from ${companyName} HRMS</div>
</div>
</body></html>`;

const credentialsTemplate = ({ employeeName, employeeId, email, password, loginUrl }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; background: #f9f9f9; margin:0; padding:20px; }
.container { max-width:600px; margin:auto; background:#fff; border-radius:12px; padding:40px; border:1px solid #e0d7ff; }
h1 { color:#4C1D95; } h2 { color:#7C3AED; }
.cred-box { background: linear-gradient(135deg,#ede9fe,#fef3c7); border-radius:10px; padding:20px; margin:20px 0; }
.label { color:#888; font-size:12px; } .value { color:#4C1D95; font-weight:bold; font-size:16px; }
.btn { display:inline-block; background:#D97706; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:16px; }
.footer { margin-top:30px; color:#888; font-size:12px; }
</style></head>
<body>
<div class="container">
  ${logoHeader}
  <h2>Your Login Credentials</h2>
  <p>Dear <strong>${employeeName}</strong>, your account has been created. Here are your login details:</p>
  <div class="cred-box">
    <p><span class="label">EMPLOYEE ID</span><br><span class="value">${employeeId}</span></p>
    <p><span class="label">EMAIL</span><br><span class="value">${email}</span></p>
    <p><span class="label">TEMPORARY PASSWORD</span><br><span class="value">${password}</span></p>
  </div>
  <p style="color:#e11d48;font-size:13px;">⚠️ You will be required to change your password on first login.</p>
  <a class="btn" href="${loginUrl}">Login Now</a>
  <div class="footer">This is an automated message from Zaltix Soft Solutions. Do not share your credentials.</div>
</div>
</body></html>`;

const leaveStatusTemplate = ({ employeeName, leaveType, fromDate, toDate, status, comments }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; background: #f9f9f9; margin:0; padding:20px; }
.container { max-width:600px; margin:auto; background:#fff; border-radius:12px; padding:40px; border:1px solid #e0d7ff; }
h1 { color:#4C1D95; } h2 { color:#4C1D95; }
.status-approved { color:#16a34a; font-weight:bold; font-size:20px; }
.status-rejected { color:#dc2626; font-weight:bold; font-size:20px; }
.footer { margin-top:30px; color:#888; font-size:12px; }
</style></head>
<body>
<div class="container">
  ${logoHeader}
  <h2>Leave Request Update</h2>
  <p>Dear <strong>${employeeName}</strong>,</p>
  <p>Your leave request has been <span class="${status === 'approved' ? 'status-approved' : 'status-rejected'}">${status.toUpperCase()}</span>.</p>
  <table style="width:100%;border-collapse:collapse;margin:20px 0;">
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">Leave Type</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:bold;text-transform:capitalize;">${leaveType}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">From</td><td style="padding:8px;border-bottom:1px solid #eee;">${fromDate}</td></tr>
    <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#555;">To</td><td style="padding:8px;border-bottom:1px solid #eee;">${toDate}</td></tr>
    ${comments ? `<tr><td style="padding:8px;color:#555;">Comments</td><td style="padding:8px;">${comments}</td></tr>` : ''}
  </table>
  <div class="footer">This is an automated message from Zaltix Soft Solutions.</div>
</div>
</body></html>`;

const payslipNotificationTemplate = ({ employeeName, month, year, netSalary }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; background: #f9f9f9; margin:0; padding:20px; }
.container { max-width:600px; margin:auto; background:#fff; border-radius:12px; padding:40px; border:1px solid #e0d7ff; }
h1 { color:#4C1D95; } h2 { color:#4C1D95; } .amount { color:#D97706; font-size:28px; font-weight:bold; }
.footer { margin-top:30px; color:#888; font-size:12px; }
</style></head>
<body>
<div class="container">
  ${logoHeader}
  <h2>Payslip Published</h2>
  <p>Dear <strong>${employeeName}</strong>,</p>
  <p>Your payslip for <strong>${month}/${year}</strong> has been published.</p>
  <p>Net Salary: <span class="amount">₹${netSalary}</span></p>
  <p>Please login to your portal to view and download your payslip.</p>
  <div class="footer">This is an automated message from Zaltix Soft Solutions.</div>
</div>
</body></html>`;

const resetPasswordTemplate = ({ name, resetUrl }) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: Arial, sans-serif; background: #f9f9f9; margin:0; padding:20px; }
.container { max-width:600px; margin:auto; background:#fff; border-radius:12px; padding:40px; border:1px solid #e0d7ff; }
h1 { color:#4C1D95; } h2 { color:#4C1D95; }
.btn { display:inline-block; background:#D97706; color:#fff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold; margin-top:16px; }
.footer { margin-top:30px; color:#888; font-size:12px; }
</style></head>
<body>
<div class="container">
  ${logoHeader}
  <h2>Password Reset Request</h2>
  <p>Dear <strong>${name}</strong>,</p>
  <p>You requested a password reset. Click the button below to reset your password. This link expires in 1 hour.</p>
  <a class="btn" href="${resetUrl}">Reset Password</a>
  <p style="margin-top:20px;color:#888;font-size:12px;">If you did not request this, please ignore this email.</p>
  <div class="footer">This is an automated message from Zaltix Soft Solutions.</div>
</div>
</body></html>`;

module.exports = { offerLetterTemplate, credentialsTemplate, leaveStatusTemplate, payslipNotificationTemplate, resetPasswordTemplate };
