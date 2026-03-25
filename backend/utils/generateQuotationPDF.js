const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Streams a quotation PDF directly to the HTTP response.
 * @param {Object} quotation  - populated Quotation document
 * @param {Object} res        - Express response object
 */
const generateQuotationPDF = (quotation, res) => {
  const doc = new PDFDocument({ margin: 0, size: 'A4' });

  const ML = 40;
  const MR = 555;
  const CW = MR - ML;
  const BORDER = '#cccccc';
  const VIOLET = '#4C1D95';
  const VIOLET_LIGHT = '#ede9fe';
  const GRAY = '#6b7280';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${quotation.quotationNumber}.pdf"`);
  doc.pipe(res);

  let y = 30;

  /* ── HEADER ── */
  const logoPath = path.join(__dirname, '../../frontend/public/logo.png');
  if (fs.existsSync(logoPath)) {
    try { doc.image(logoPath, ML, y + 2, { width: 110, height: 46 }); } catch (_) {}
  }

  doc.fillColor(VIOLET).fontSize(14).font('Helvetica-Bold')
     .text('Zaltix Soft Solutions', ML + 118, y + 2, { width: CW - 118, align: 'center' });
  doc.fillColor(GRAY).fontSize(7.5).font('Helvetica')
     .text('Swarnakanchi Road, Green Hills Colony Rd No.3, Kothapet, Hyderabad - 500102', ML + 118, y + 20, { width: CW - 118, align: 'center' })
     .text('Email: hr@zaltixsoftsolutions.com  |  Phone: 9966653131', ML + 118, y + 30, { width: CW - 118, align: 'center' });

  y += 62;
  doc.moveTo(ML, y).lineTo(MR, y).strokeColor(VIOLET).lineWidth(1.5).stroke();
  y += 12;

  /* ── TITLE ── */
  doc.fillColor(VIOLET).fontSize(13).font('Helvetica-Bold')
     .text('QUOTATION', ML, y, { width: CW, align: 'center' });
  y += 20;

  /* ── QT NUMBER + DATE BLOCK ── */
  const infoW = 230;
  doc.rect(MR - infoW, y, infoW, 52).fillColor(VIOLET_LIGHT).fill();
  doc.rect(MR - infoW, y, infoW, 52).strokeColor(BORDER).lineWidth(0.5).stroke();

  doc.fillColor(GRAY).fontSize(8).font('Helvetica')
     .text('Quotation No.', MR - infoW + 10, y + 8);
  doc.fillColor(VIOLET).fontSize(10).font('Helvetica-Bold')
     .text(quotation.quotationNumber, MR - infoW + 10, y + 20);
  doc.fillColor(GRAY).fontSize(8).font('Helvetica')
     .text('Date:', MR - infoW + 10, y + 36)
     .text(new Date(quotation.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }), MR - infoW + 45, y + 36);

  if (quotation.validUntil) {
    doc.text('Valid Until:', MR - infoW + 115, y + 36)
       .text(new Date(quotation.validUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }), MR - infoW + 160, y + 36);
  }

  /* ── CLIENT BLOCK ── */
  doc.fillColor('#111827').fontSize(9).font('Helvetica-Bold')
     .text('Bill To:', ML, y + 6);
  doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold')
     .text(quotation.clientName, ML, y + 18);
  doc.fillColor(GRAY).fontSize(8.5).font('Helvetica');
  let clientY = y + 30;
  if (quotation.clientCompany) { doc.text(quotation.clientCompany, ML, clientY); clientY += 12; }
  if (quotation.clientPhone)   { doc.text(quotation.clientPhone,   ML, clientY); clientY += 12; }
  if (quotation.clientEmail)   { doc.text(quotation.clientEmail,   ML, clientY); }

  y += 68;
  doc.moveTo(ML, y).lineTo(MR, y).strokeColor(BORDER).lineWidth(0.5).stroke();
  y += 12;

  /* ── ITEMS TABLE HEADER ── */
  const RH = 22;
  const COL = { no: 30, desc: 230, qty: 50, rate: 90, amount: 115 };
  const X = { no: ML, desc: ML + COL.no, qty: ML + COL.no + COL.desc, rate: ML + COL.no + COL.desc + COL.qty, amount: MR - COL.amount };

  // Header row
  doc.rect(ML, y, CW, RH).fillColor(VIOLET).fill();
  const hOpts = { lineBreak: false };
  const hY = y + 7;
  doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
  doc.text('#',           X.no     + 4,  hY, hOpts);
  doc.text('Description', X.desc   + 4,  hY, hOpts);
  doc.text('Qty',         X.qty    + 4,  hY, hOpts);
  doc.text('Rate',        X.rate   + 4,  hY, hOpts);
  doc.text('Amount',      X.amount + 4,  hY, hOpts);
  y += RH;

  /* ── ITEM ROWS ── */
  quotation.items.forEach((item, i) => {
    const rowBg = i % 2 === 0 ? '#ffffff' : '#f9f7ff';
    doc.rect(ML, y, CW, RH).fillColor(rowBg).fill();
    doc.rect(ML, y, CW, RH).strokeColor(BORDER).lineWidth(0.3).stroke();

    const rY = y + 7;
    doc.fillColor('#111827').fontSize(8.5).font('Helvetica');
    doc.text(String(i + 1),            X.no     + 4, rY, { lineBreak: false });
    doc.text(item.description,         X.desc   + 4, rY, { lineBreak: false, width: COL.desc - 8, ellipsis: true });
    doc.text(String(item.quantity),    X.qty    + 4, rY, { lineBreak: false });
    doc.text(fmt(item.rate).replace('Rs. ', ''), X.rate + 4, rY, { lineBreak: false });
    doc.fillColor(VIOLET).font('Helvetica-Bold')
       .text(fmt(item.amount).replace('Rs. ', ''), X.amount + 4, rY, { lineBreak: false });
    y += RH;
  });

  y += 10;

  /* ── TOTALS BLOCK ── */
  const TW1 = 130, TW2 = 110;
  const TX = MR - TW1 - TW2;

  function totRow(label, value, bold = false, bg = null, color = '#374151') {
    if (bg) doc.rect(TX, y, TW1 + TW2, 20).fillColor(bg).fill();
    doc.rect(TX, y, TW1, 20).strokeColor(BORDER).lineWidth(0.3).stroke();
    doc.rect(TX + TW1, y, TW2, 20).strokeColor(BORDER).lineWidth(0.3).stroke();
    doc.fillColor(color).fontSize(8.5).font(bold ? 'Helvetica-Bold' : 'Helvetica')
       .text(label, TX + 6, y + 6, { lineBreak: false, width: TW1 - 8 })
       .text(value, TX + TW1 + 4, y + 6, { lineBreak: false, width: TW2 - 8, align: 'right' });
    y += 20;
  }

  totRow('Subtotal', fmt(quotation.subtotal));
  if (quotation.discountAmount > 0) {
    totRow(`Discount (${quotation.discountPercent}%)`, `- ${fmt(quotation.discountAmount)}`, false, null, '#16a34a');
  }
  totRow(`Tax (${quotation.taxPercent}% GST)`, fmt(quotation.taxAmount));
  totRow('Total', fmt(quotation.total), true, VIOLET_LIGHT, VIOLET);

  y += 16;

  /* ── NOTES ── */
  if (quotation.notes) {
    doc.moveTo(ML, y).lineTo(MR, y).strokeColor(BORDER).lineWidth(0.5).stroke();
    y += 10;
    doc.fillColor('#374151').fontSize(8.5).font('Helvetica-Bold').text('Notes:', ML, y);
    y += 14;
    doc.fillColor(GRAY).fontSize(8.5).font('Helvetica').text(quotation.notes, ML, y, { width: CW });
    y += doc.heightOfString(quotation.notes, { width: CW }) + 10;
  }

  /* ── FOOTER ── */
  const pageH = 841;
  doc.moveTo(ML, pageH - 40).lineTo(MR, pageH - 40).strokeColor(BORDER).lineWidth(0.5).stroke();
  doc.fillColor(GRAY).fontSize(7.5).font('Helvetica-Oblique')
     .text('This is a computer-generated quotation from Zaltix Soft Solutions. Thank you for your business.', ML, pageH - 30, { width: CW, align: 'center' });

  doc.end();
};

module.exports = generateQuotationPDF;
