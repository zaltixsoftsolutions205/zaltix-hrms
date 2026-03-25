const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const fmt2 = (n) => Number(n || 0).toFixed(2);

function numberToWords(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function convert(n) {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }
  const int = Math.floor(Math.abs(n));
  return int === 0 ? 'Zero only' : convert(int) + ' only';
}

const generatePayslipPDF = (payslipData) => {
  return new Promise((resolve, reject) => {
    try {
      const {
        employee, month, year,
        basicSalary, allowances, deductions,
        grossSalary, netSalary,
        workingDays, presentDays, lwpDays,
        accountNumber, ifscCode, uanNumber,
      } = payslipData;

      const uploadsDir = path.join(__dirname, '../uploads/payslips');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const filename = `Payslip_${MONTH_NAMES[month - 1]}_${year}_${employee.employeeId}.pdf`;
      const filepath = path.join(uploadsDir, filename);

      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const ML = 40;         // left margin
      const MR = 555;        // right margin
      const CW = MR - ML;    // 515
      const RH = 20;         // row height
      const BORDER  = '#aaaaaa';
      const HDR_BG  = '#d8d8d8';
      const SUB_BG  = '#efefef';
      const TOT_BG  = '#e2e2e2';

      /* ── draw one bordered cell with optional fill ── */
      function cell(text, x, y, w, h, opts = {}) {
        const {
          align  = 'left',
          bold   = false,
          fsize  = 9,
          color  = '#111111',
          bg     = null,
          pad    = 6,
        } = opts;

        if (bg) {
          doc.rect(x, y, w, h).fillColor(bg).fill();
        }
        doc.rect(x, y, w, h).strokeColor(BORDER).lineWidth(0.4).stroke();

        if (text !== null && text !== undefined && String(text).trim() !== '') {
          const textY = y + Math.max(2, (h - fsize) / 2);
          doc.fillColor(color)
             .fontSize(fsize)
             .font(bold ? 'Helvetica-Bold' : 'Helvetica')
             .text(String(text), x + pad, textY, {
               width: w - pad * 2,
               align,
               lineBreak: false,
             });
        }
      }

      let y = 30;

      /* ════════════════════════════════════════
         HEADER — logo + company info
      ════════════════════════════════════════ */
      // Try multiple locations so logo works in both local dev and production
      const logoCandidates = [
        process.env.LOGO_PATH,
        path.join(__dirname, '../public/logo.png'),             // backend/public/ — production-safe
        path.join(__dirname, '../../frontend/dist/logo.png'),   // built frontend
        path.join(__dirname, '../../frontend/public/logo.png'), // local dev
      ].filter(Boolean);
      const logoPath = logoCandidates.find(p => fs.existsSync(p)) || null;
      let logoW = 0;
      if (logoPath) {
        try {
          doc.image(logoPath, ML, y + 2, { width: 110, height: 46 });
          logoW = 118;
        } catch (_) {}
      }

      const infoX = ML + logoW;
      const infoW = MR - infoX;

      doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold')
         .text('Zaltix Soft Solutions Private Limited', infoX, y + 2, { width: infoW, align: 'center' });
      doc.fillColor('#333333').fontSize(7.5).font('Helvetica')
         .text('Swarnakanchi Road, Green Hills Colony Rd No.3, above Vajra Food Court,', infoX, y + 20, { width: infoW, align: 'center' });
      doc.text('Green Hills Colony, Kothapet, Hyderabad, Telangana - 500102', infoX, y + 30, { width: infoW, align: 'center' });
      doc.text('Email : hr@zaltixsoftsolutions.com   |   Phone : 9966653131', infoX, y + 40, { width: infoW, align: 'center' });

      y += 62;
      doc.moveTo(ML, y).lineTo(MR, y).strokeColor('#000000').lineWidth(1.2).stroke();
      y += 10;

      /* ════════════════════════════════════════
         TITLE
      ════════════════════════════════════════ */
      doc.fillColor('#000000').fontSize(11).font('Helvetica-Bold')
         .text(`Salary Slip for the Month of ${MONTH_NAMES[month - 1]} ${year}`, ML, y, {
           width: CW, align: 'center',
         });
      y += 18;
      doc.moveTo(ML, y).lineTo(MR, y).strokeColor('#000000').lineWidth(1.2).stroke();
      y += 10;

      /* ════════════════════════════════════════
         EMPLOYEE DETAILS — 4-col grid
         label | value | label | value
      ════════════════════════════════════════ */
      const wdDays  = Number(workingDays || 26);
      const prsDays = Number(presentDays != null ? presentDays : wdDays);
      const lopDays = Number(lwpDays || 0);

      // column widths: label=120, value=137, label=118, value=140 → 515
      const EC1 = 120, EC2 = 137, EC3 = 118, EC4 = CW - EC1 - EC2 - EC3;

      const empRows = [
        ['Employee Code', employee.employeeId,          'Employee Name', employee.name],
        ['Designation',   employee.designation || '—',  'Department',    employee.department?.name || '—'],
        ['Working Days',  String(wdDays),               'Present Days',  String(prsDays)],
        ['Loss of Pay',   String(lopDays),              '',              ''],
      ];

      empRows.forEach(([l1, v1, l2, v2]) => {
        cell(l1,  ML,               y, EC1, RH, { fsize: 8, color: '#555555', bg: SUB_BG });
        cell(v1,  ML + EC1,         y, EC2, RH, { fsize: 8.5, bold: true });
        if (l2) {
          cell(l2,  ML + EC1 + EC2,   y, EC3, RH, { fsize: 8, color: '#555555', bg: SUB_BG });
          cell(v2,  ML + EC1 + EC2 + EC3, y, EC4, RH, { fsize: 8.5, bold: true });
        } else {
          cell('',  ML + EC1 + EC2,   y, EC3 + EC4, RH, { bg: null });
        }
        y += RH;
      });

      y += 12;

      /* ════════════════════════════════════════
         ACCOUNT DETAILS
      ════════════════════════════════════════ */
      const AD1 = 120, AD2 = 137, AD3 = 118, AD4 = CW - AD1 - AD2 - AD3;
      cell('Account Details', ML, y, CW, RH, { bold: true, bg: HDR_BG, align: 'center' });
      y += RH;
      cell('Account Number', ML,             y, AD1, RH, { fsize: 8, color: '#555555', bg: SUB_BG });
      cell(accountNumber || '—',             ML + AD1,             y, AD2, RH, { fsize: 8.5, bold: true });
      cell('IFSC Code',      ML + AD1 + AD2, y, AD3, RH, { fsize: 8, color: '#555555', bg: SUB_BG });
      cell(ifscCode || '—',                  ML + AD1 + AD2 + AD3, y, AD4, RH, { fsize: 8.5, bold: true });
      y += RH;
      cell('UAN Number',     ML,             y, AD1, RH, { fsize: 8, color: '#555555', bg: SUB_BG });
      cell(uanNumber || '—',                 ML + AD1,             y, AD2, RH, { fsize: 8.5, bold: true });
      cell('',               ML + AD1 + AD2, y, AD3 + AD4, RH, { bg: null });
      y += RH + 12;

      /* ════════════════════════════════════════
         EARNINGS | DEDUCTIONS — side by side
         Left block  : Earnings  (2 cols: label | amount)
         Right block : Deductions (2 cols: label | amount)
      ════════════════════════════════════════ */
      const LB  = 258;          // left block total width
      const RB  = CW - LB;     // right block total width = 257
      const LA  = 92;           // amount column in left block
      const LL  = LB - LA;     // label column in left block  = 166
      const RA  = 92;           // amount column in right block
      const RL  = RB - RA;     // label column in right block = 165

      /* section header */
      cell('Earnings',   ML,      y, LB, RH, { bold: true, bg: HDR_BG, align: 'center' });
      cell('Deductions', ML + LB, y, RB, RH, { bold: true, bg: HDR_BG, align: 'center' });
      y += RH;

      /* sub-header */
      cell('Description',  ML,           y, LL, RH, { bold: true, fsize: 8, bg: SUB_BG });
      cell('Amount (Rs.)', ML + LL,       y, LA, RH, { bold: true, fsize: 8, bg: SUB_BG, align: 'right' });
      cell('Description',  ML + LB,       y, RL, RH, { bold: true, fsize: 8, bg: SUB_BG });
      cell('Amount (Rs.)', ML + LB + RL,  y, RA, RH, { bold: true, fsize: 8, bg: SUB_BG, align: 'right' });
      y += RH;

      /* data rows */
      const earningRows = [
        ['Basic Salary', Number(basicSalary || 0)],
        ...(allowances || []).map(a => [a.name, Number(a.amount || 0)]),
      ];
      const deductionRows = (deductions || []).map(d => [d.name, Number(d.amount || 0)]);

      const maxRows = Math.max(earningRows.length, deductionRows.length);
      for (let i = 0; i < maxRows; i++) {
        const [elabel, eamt] = earningRows[i]    || ['', null];
        const [dlabel, damt] = deductionRows[i]  || ['', null];

        cell(elabel,                       ML,          y, LL, RH, { fsize: 8.5 });
        cell(elabel ? fmt2(eamt) : '',     ML + LL,     y, LA, RH, { fsize: 8.5, align: 'right' });
        cell(dlabel,                       ML + LB,     y, RL, RH, { fsize: 8.5 });
        cell(dlabel ? fmt2(damt) : '',     ML + LB + RL, y, RA, RH, { fsize: 8.5, align: 'right' });
        y += RH;
      }

      /* totals row */
      const totalDed = deductionRows.reduce((s, [, amt]) => s + amt, 0);

      cell('Total Earnings',   ML,          y, LL, RH, { bold: true, bg: TOT_BG });
      cell(fmt2(grossSalary),  ML + LL,     y, LA, RH, { bold: true, bg: TOT_BG, align: 'right' });
      cell('Total Deductions', ML + LB,     y, RL, RH, { bold: true, bg: TOT_BG });
      cell(fmt2(totalDed),     ML + LB + RL, y, RA, RH, { bold: true, bg: TOT_BG, align: 'right' });
      y += RH + 10;

      /* ════════════════════════════════════════
         NET PAYABLE — right-aligned
      ════════════════════════════════════════ */
      const NW1 = 190, NW2 = 130;
      const NX  = MR - NW1 - NW2;

      cell('Net Payable :', NX,        y, NW1, RH + 2, { align: 'right', bold: true, fsize: 10, bg: '#e0daf5', color: '#2d1b69' });
      cell(fmt2(netSalary), NX + NW1, y, NW2, RH + 2, { align: 'right', bold: true, fsize: 10, bg: '#e0daf5', color: '#2d1b69' });
      y += RH + 16;

      /* ════════════════════════════════════════
         NET IN WORDS
      ════════════════════════════════════════ */
      doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold')
         .text(`Net Payable (In Words) : ${numberToWords(Math.round(netSalary))}`, ML, y, { width: CW });
      y += 24;

      /* ════════════════════════════════════════
         NOTE
      ════════════════════════════════════════ */
      doc.moveTo(ML, y).lineTo(MR, y).strokeColor('#cccccc').lineWidth(0.5).stroke();
      y += 8;
      doc.fillColor('#666666').fontSize(7.5).font('Helvetica-Oblique')
         .text(
           'Note : Private and Confidential. This is a computer generated payslip by Zaltix Soft Solutions and does not require a signature.',
           ML, y, { width: CW }
         );

      doc.end();
      stream.on('finish', () => resolve(`/uploads/payslips/${filename}`));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = generatePayslipPDF;
