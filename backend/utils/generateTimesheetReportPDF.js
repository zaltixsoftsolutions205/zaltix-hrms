const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Renders a flat row-based timesheet report to a PDF, following the same
// hand-rolled bordered-table layout used by generatePayslipPDF.js. An optional
// `summary` paragraph (the weekly report's plain-language intelligence blurb)
// is rendered above the table when provided.
const generateTimesheetReportPDF = ({ title, columns, rows, summary }) => {
  return new Promise((resolve, reject) => {
    try {
      const uploadsDir = path.join(__dirname, '../uploads/reports');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const filename = `Timesheet_Report_${Date.now()}.pdf`;
      const filepath = path.join(uploadsDir, filename);

      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const ML = 30;
      const MR = doc.page.width - 30;
      const CW = MR - ML;
      const RH = 20;
      const BORDER = '#aaaaaa';
      const HDR_BG = '#ede9fe';

      doc.fontSize(16).font('Helvetica-Bold').fillColor('#4c1d95').text(title, ML, 25);
      let y = 55;

      if (summary) {
        doc.fontSize(9).font('Helvetica').fillColor('#374151')
          .text(summary, ML, y, { width: CW });
        y = doc.y + 12;
      }

      const colWidth = CW / columns.length;

      function cell(text, x, rowY, w, h, opts = {}) {
        const { bold = false, fsize = 8, bg = null, align = 'left' } = opts;
        if (bg) doc.rect(x, rowY, w, h).fillColor(bg).fill();
        doc.rect(x, rowY, w, h).strokeColor(BORDER).lineWidth(0.4).stroke();
        doc.fillColor('#111111').fontSize(fsize).font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(String(text ?? ''), x + 4, rowY + 5, { width: w - 8, align, lineBreak: false });
      }

      function drawHeader() {
        columns.forEach((col, i) => cell(col.label, ML + i * colWidth, y, colWidth, RH, { bold: true, bg: HDR_BG }));
        y += RH;
      }

      drawHeader();
      for (const row of rows) {
        if (y + RH > doc.page.height - 30) {
          doc.addPage({ margin: 30, size: 'A4', layout: 'landscape' });
          y = 30;
          drawHeader();
        }
        columns.forEach((col, i) => cell(row[col.key], ML + i * colWidth, y, colWidth, RH));
        y += RH;
      }

      doc.end();
      stream.on('finish', () => resolve(filepath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = generateTimesheetReportPDF;
