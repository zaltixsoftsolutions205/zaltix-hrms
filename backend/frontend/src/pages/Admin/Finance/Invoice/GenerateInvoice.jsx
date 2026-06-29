import { useState } from 'react';
import html2pdf from 'html2pdf.js';

/* ── helpers ──────────────────────────────────────────────── */
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const ONES = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
  'Seventeen','Eighteen','Nineteen'];
const TENS = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];

function numToWords(n) {
  if (!n || n === 0) return 'Zero';
  n = Math.round(n);
  if (n >= 10000000) return numToWords(Math.floor(n / 10000000)) + ' Crore ' + numToWords(n % 10000000);
  if (n >= 100000)   return numToWords(Math.floor(n / 100000))   + ' Lakh '  + numToWords(n % 100000);
  if (n >= 1000)     return numToWords(Math.floor(n / 1000))     + ' Thousand ' + numToWords(n % 1000);
  if (n >= 100)      return ONES[Math.floor(n / 100)] + ' Hundred ' + numToWords(n % 100);
  if (n >= 20)       return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[n];
}

function toWords(amount) {
  if (!amount) return '';
  const n = Math.round(parseFloat(amount));
  const words = numToWords(n).trim().replace(/\s+/g, ' ');
  return '(' + words + ' Rupees Only)';
}

const now = new Date();

/* ── component ────────────────────────────────────────────── */
const GenerateInvoice = () => {
  const [form, setForm] = useState({
    invoiceMonth: MONTHS[now.getMonth()],
    invoiceYear:  now.getFullYear(),
    invoiceNo:    '018',
    invoiceDate:  `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`,
    billToName:   '',
    billToEmail:  '',
    billToPhone:  '',
    billToAddress:'',
    billToGSTIN:  '',
    description:  'Digital Marketing Services',
    amount:       '',
    gstRate:      18,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const amt      = parseFloat(form.amount) || 0;
  const gstAmt   = Math.round(amt * form.gstRate / 100);
  const total    = amt + gstAmt;
  const inWords  = toWords(total);

  const handleDownload = () => {
    const el = document.getElementById('invoice-print-area');
    const filename = `Invoice_${form.invoiceNo || 'draft'}_${form.invoiceMonth}_${form.invoiceYear}.pdf`;
    html2pdf().set({
      margin: 0,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    }).from(el).save();
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── FORM ──────────────────────────────────────────── */}
        <div className="lg:w-80 flex-shrink-0 space-y-4 print:hidden">

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Invoice Info</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Month</label>
                <select className="input-field mt-0.5 text-sm" value={form.invoiceMonth}
                  onChange={e => set('invoiceMonth', e.target.value)}>
                  {MONTHS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Year</label>
                <select className="input-field mt-0.5 text-sm" value={form.invoiceYear}
                  onChange={e => set('invoiceYear', parseInt(e.target.value))}>
                  {Array.from({length:5},(_,i)=>now.getFullYear()-i).map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Invoice No.</label>
                <input className="input-field mt-0.5 text-sm" value={form.invoiceNo}
                  onChange={e => set('invoiceNo', e.target.value)} placeholder="018" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Invoice Date</label>
                <input className="input-field mt-0.5 text-sm" value={form.invoiceDate}
                  onChange={e => set('invoiceDate', e.target.value)} placeholder="DD.MM.YYYY" />
              </div>
            </div>
          </div>

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Bill To</p>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Company Name</label>
              <input className="input-field mt-0.5 text-sm" value={form.billToName}
                onChange={e => set('billToName', e.target.value)} placeholder="Shubha Fertility" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Email</label>
              <input className="input-field mt-0.5 text-sm" value={form.billToEmail}
                onChange={e => set('billToEmail', e.target.value)} placeholder="info@client.com" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Phone</label>
              <input className="input-field mt-0.5 text-sm" value={form.billToPhone}
                onChange={e => set('billToPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Address</label>
              <textarea className="input-field mt-0.5 text-sm resize-none" rows={2} value={form.billToAddress}
                onChange={e => set('billToAddress', e.target.value)} placeholder="Full address..." />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">GSTIN (optional)</label>
              <input className="input-field mt-0.5 text-sm" value={form.billToGSTIN}
                onChange={e => set('billToGSTIN', e.target.value)} placeholder="36AACCZ6027D1ZF" />
            </div>
          </div>

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Service</p>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Description</label>
              <input className="input-field mt-0.5 text-sm" value={form.description}
                onChange={e => set('description', e.target.value)} placeholder="Digital Marketing Services" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Amount (₹)</label>
                <input className="input-field mt-0.5 text-sm" type="number" min="0" value={form.amount}
                  onChange={e => set('amount', e.target.value)} placeholder="40000" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">GST %</label>
                <input className="input-field mt-0.5 text-sm" type="number" min="0" max="100" value={form.gstRate}
                  onChange={e => set('gstRate', parseFloat(e.target.value)||0)} />
              </div>
            </div>
            {amt > 0 && (
              <div className="text-xs space-y-0.5 pt-1 border-t border-violet-200">
                <div className="flex justify-between"><span className="text-violet-500">GST ({form.gstRate}%)</span><span>₹{gstAmt.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between font-bold"><span className="text-violet-700">Total</span><span className="text-violet-900">₹{total.toLocaleString('en-IN')}</span></div>
              </div>
            )}
          </div>

          <button onClick={handleDownload}
            className="w-full btn-primary flex items-center justify-center gap-2">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download PDF
          </button>
        </div>

        {/* ── INVOICE PREVIEW ───────────────────────────────── */}
        <div className="flex-1 overflow-x-auto">
          <div id="invoice-print-area"
            style={{
              fontFamily: "'Arial', sans-serif",
              background: '#fff',
              minWidth: 595,
              maxWidth: 794,
              margin: '0 auto',
              boxShadow: '0 4px 24px rgba(80,0,160,0.10)',
              borderRadius: 8,
              overflow: 'hidden',
            }}>

            {/* ── Company name header (text + thick underline) ── */}
            <div style={{ padding: '18px 32px 0', background: '#fff' }}>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#111', letterSpacing: 1, textAlign: 'center', fontFamily: 'Georgia, serif' }}>
                Zaltix Soft Solutions Private Limited
              </div>
            </div>
            {/* Thick divider line */}
            <div style={{ height: 5, background: '#2D0A6B', margin: '10px 0 0' }} />

            {/* ── Invoice title ── */}
            <div style={{ textAlign: 'center', padding: '20px 32px 16px' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#111' }}>
                Invoice-{form.invoiceMonth} {form.invoiceYear}
              </div>
            </div>

            {/* ── Logo + Invoice meta ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 40px 20px' }}>
              {/* Logo */}
              <div>
                <img src="/logo.png" alt="Zaltix Soft Solutions" style={{ height: 60, width: 'auto', display: 'block' }} />
              </div>
              {/* Invoice no / date */}
              <div style={{ fontSize: 12, color: '#333' }}>
                <table style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#666', paddingRight: 16, paddingBottom: 4 }}>Invoice no.:</td>
                      <td style={{ fontWeight: 600, paddingBottom: 4 }}>{form.invoiceNo || '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#666', paddingRight: 16 }}>Invoice date:</td>
                      <td style={{ fontWeight: 600 }}>{form.invoiceDate || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── From / Bill to ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '16px 40px 20px', borderTop: '1px solid #ede9fe', borderBottom: '1px solid #ede9fe', gap: 32, background: '#faf8ff' }}>
              {/* From */}
              <div style={{ fontSize: 11, color: '#333', lineHeight: 1.75 }}>
                <div style={{ fontWeight: 700, color: '#111', fontSize: 11, marginBottom: 2 }}>From</div>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#111', marginBottom: 2 }}>Zaltix Soft Solutions Pvt Ltd</div>
                <div>info@zaltixsoftsolutions.com</div>
                <div>+91 99666 53131</div>
                <div>www.zaltixsoftsolutions.com</div>
                <div>Plot No 69, Greenhills colony, Road no 3,</div>
                <div>Kothapet, Hyderabad - 500035</div>
                <div style={{ fontWeight: 800, marginTop: 8, fontSize: 12, color: '#111' }}>
                  GSTIN&nbsp;&nbsp;: 36AACCZ6027D1ZF
                </div>
              </div>
              {/* Bill to — right aligned */}
              <div style={{ fontSize: 11, color: '#333', lineHeight: 1.75, textAlign: 'right' }}>
                <div style={{ color: '#111', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>Bill to</div>
                <div style={{ fontWeight: 900, fontSize: 20, color: '#111', lineHeight: 1.2, marginBottom: 4 }}>
                  {form.billToName || <span style={{ color: '#bbb' }}>Client Name</span>}
                </div>
                {form.billToEmail   && <div>{form.billToEmail}</div>}
                {form.billToPhone   && <div>{form.billToPhone}</div>}
                {form.billToAddress && <div style={{ whiteSpace: 'pre-line' }}>{form.billToAddress}</div>}
                {form.billToGSTIN  && (
                  <div style={{ fontWeight: 700, marginTop: 4, color: '#111' }}>
                    GSTIN : {form.billToGSTIN}
                  </div>
                )}
              </div>
            </div>

            {/* ── Table ── */}
            <div style={{ padding: '0 40px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1A0440', color: '#fff' }}>
                    <th style={{ padding: '11px 16px', textAlign: 'left', fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>DESCRIPTION</th>
                    <th style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, letterSpacing: 1, fontSize: 11 }}>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#faf8ff', borderBottom: '1px solid #ede9fe' }}>
                    <td style={{ padding: '13px 16px', color: '#333' }}>
                      {form.description || <span style={{ color: '#bbb' }}>Service description</span>}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', color: '#333' }}>
                      {amt > 0 ? amt.toLocaleString('en-IN') : <span style={{ color: '#bbb' }}>—</span>}
                    </td>
                  </tr>
                  {form.gstRate > 0 && (
                    <tr style={{ background: '#faf8ff', borderBottom: '1px solid #ede9fe' }}>
                      <td style={{ padding: '13px 16px', color: '#333' }}>GST ({form.gstRate}%)</td>
                      <td style={{ padding: '13px 16px', textAlign: 'right', color: '#333' }}>
                        {amt > 0 ? gstAmt.toLocaleString('en-IN') : '—'}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#ede9fe', borderTop: '2px solid #2D0A6B' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 900, fontSize: 13, color: '#2D0A6B' }}>Total</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 900, fontSize: 16, color: '#2D0A6B' }}>
                      {amt > 0 ? total.toLocaleString('en-IN') : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Amount in words ── */}
            <div style={{ padding: '12px 40px 8px', textAlign: 'right', fontSize: 11, color: '#2D0A6B', fontWeight: 700 }}>
              {amt > 0 ? inWords : <span style={{ color: '#bbb' }}>(Amount in words)</span>}
            </div>

            {/* ── Payment + Signature ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '20px 40px 28px', gap: 24 }}>
              {/* Bank details */}
              <div style={{ fontSize: 11, lineHeight: 2, color: '#333' }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: '#111', marginBottom: 6 }}>Please Make Payment To</div>
                <div><strong style={{ color: '#111' }}>Name of the A/C :</strong> Zaltix Soft Solutions Pvt Ltd</div>
                <div><strong style={{ color: '#111' }}>Bank :</strong> HDFC BANK</div>
                <div><strong style={{ color: '#111' }}>A/c Number:</strong> 50200107710889</div>
                <div><strong style={{ color: '#111' }}>IFSC Code:</strong> HDFC0004338</div>
              </div>
              {/* Signature */}
              <div style={{ textAlign: 'right', fontSize: 11, color: '#333' }}>
                <div style={{ height: 52 }} />
                <div style={{ fontWeight: 800, fontSize: 13, color: '#111' }}>Saikumar Dara</div>
                <div style={{ color: '#555', marginTop: 2 }}>CEO &amp; Managing Director</div>
              </div>
            </div>

            {/* ── Footer strip ── */}
            <div style={{ background: '#2D0A6B', padding: '12px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {/* Left: CIN + address */}
              <div style={{ fontSize: 9, color: '#ddd', lineHeight: 1.7 }}>
                <div style={{ marginBottom: 3 }}>CIN: U62013TS2025PTC196568</div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ marginTop: 1, flexShrink: 0, color: '#a78bca' }}>
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                  </svg>
                  <div>
                    <div>II-13-874/6, plot no 69, Rd No3, Ramakrishanapuram,</div>
                    <div>Saroornagar, K.V.Rangareddy- 500035, Telangana</div>
                  </div>
                </div>
              </div>
              {/* Right: phone + email */}
              <div style={{ fontSize: 9, color: '#ddd', textAlign: 'right', lineHeight: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#a78bca' }}>
                    <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.24 1.01l-2.21 2.21z"/>
                  </svg>
                  <span>+91 99666 53131</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#a78bca' }}>
                    <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                  </svg>
                  <span>info@zaltixsoftsolutions.com</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
};

export default GenerateInvoice;
