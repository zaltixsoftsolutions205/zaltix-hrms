import { useState, useEffect, useRef } from 'react';
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
const GenerateQuotation = () => {
  const [form, setForm] = useState({
    docType:        'Quotation',
    docTypeCustom:  '',
    quotationMonth: MONTHS[now.getMonth()],
    quotationYear:  now.getFullYear(),
    quotationNo:    '018',
    quotationDate:  `${String(now.getDate()).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`,
    billToName:   '',
    billToEmail:  '',
    billToPhone:  '',
    billToAddress:'',
    billToGSTIN:  '',
    gstRate:      18,
    // From (our company)
    fromName:    'Zaltix Soft Solutions Pvt Ltd',
    fromEmail:   'info@zaltixsoftsolutions.com',
    fromPhone:   '+91 99666 53131',
    fromWebsite: 'www.zaltixsoftsolutions.com',
    fromAddress: 'Plot No 69, Greenhills colony, Road no 3,\nKothapet, Hyderabad - 500035',
    fromGSTIN:   '36AACCZ6027D1ZF',
    // Bank
    bankName:    'Zaltix Soft Solutions Pvt Ltd',
    bankBank:    'HDFC BANK',
    bankAccount: '50200107710889',
    bankIFSC:    'HDFC0004338',
    // Notes
    notes:       '',
  });

  const [items, setItems] = useState([
    { description: 'Digital Marketing Services', notes: '', amount: '' },
  ]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const docLabel = form.docType === 'Other'
    ? (form.docTypeCustom.trim() || 'Document')
    : form.docType;

  const addItem = () => setItems(prev => [...prev, { description: '', notes: '', amount: '' }]);
  const removeItem = (i) => setItems(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  const updateItem = (i, field, val) => setItems(prev => prev.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const [history, setHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('quotation_history') || '[]'); } catch { return []; }
  });

  const previewWrapRef = useRef(null);
  const notesRef = useRef(null);
  const [scale, setScale] = useState(1);

  const execFormat = (cmd, value = null) => {
    document.execCommand(cmd, false, value);
    notesRef.current?.focus();
    if (notesRef.current) set('notes', notesRef.current.innerHTML);
  };

  useEffect(() => {
    const calc = () => {
      if (previewWrapRef.current) {
        const w = previewWrapRef.current.offsetWidth;
        setScale(w < 794 ? w / 794 : 1);
      }
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const subtotal  = items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
  const gstAmt    = Math.round(subtotal * form.gstRate / 100);
  const total     = subtotal + gstAmt;
  const inWords   = toWords(total);

  const handleDownload = () => {
    const el = document.getElementById('quotation-print-area');
    const filename = `${docLabel}_${form.quotationNo || 'draft'}_${form.quotationMonth}_${form.quotationYear}.pdf`;
    html2pdf().set({
      margin: [6, 6, 6, 6],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, letterRendering: true, width: 794 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: 'legacy' },
    }).from(el).save();
    const entry = {
      id: Date.now(),
      quotationNo: form.quotationNo,
      quotationMonth: form.quotationMonth,
      quotationYear: form.quotationYear,
      quotationDate: form.quotationDate,
      billToName: form.billToName,
      description: items.map(it => it.description).filter(Boolean).join(', '),
      total,
      downloadedAt: new Date().toLocaleString('en-IN'),
    };
    const updated = [entry, ...history].slice(0, 20);
    setHistory(updated);
    localStorage.setItem('quotation_history', JSON.stringify(updated));
  };

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6 px-3 sm:px-4 pb-6">

        {/* ── FORM ──────────────────────────────────────────── */}
        <div className="lg:w-72 flex-shrink-0 flex flex-col gap-4 print:hidden lg:sticky lg:top-4 lg:self-start">

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Document Type</p>
            <div>
              <select className="input-field text-sm font-semibold" value={form.docType}
                onChange={e => set('docType', e.target.value)}>
                <option value="Quotation">Quotation</option>
                <option value="Invoice">Invoice</option>
                <option value="Proforma Invoice">Proforma Invoice</option>
                <option value="Other">Other (Custom)</option>
              </select>
            </div>
            {form.docType === 'Other' && (
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Custom Document Name</label>
                <input className="input-field mt-0.5 text-sm" value={form.docTypeCustom}
                  onChange={e => set('docTypeCustom', e.target.value)}
                  placeholder="e.g. Purchase Order, Credit Note..." />
              </div>
            )}
          </div>

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">{docLabel} Info</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Month</label>
                <select className="input-field mt-0.5 text-sm" value={form.quotationMonth}
                  onChange={e => set('quotationMonth', e.target.value)}>
                  {MONTHS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">Year</label>
                <select className="input-field mt-0.5 text-sm" value={form.quotationYear}
                  onChange={e => set('quotationYear', parseInt(e.target.value))}>
                  {Array.from({length:5},(_,i)=>now.getFullYear()-i).map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">{docLabel} No.</label>
                <input className="input-field mt-0.5 text-sm" value={form.quotationNo}
                  onChange={e => set('quotationNo', e.target.value)} placeholder="018" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-violet-500 uppercase">{docLabel} Date</label>
                <input className="input-field mt-0.5 text-sm" value={form.quotationDate}
                  onChange={e => set('quotationDate', e.target.value)} placeholder="DD.MM.YYYY" />
              </div>
            </div>
          </div>

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">From (Your Company)</p>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Company Name</label>
              <input className="input-field mt-0.5 text-sm" value={form.fromName} onChange={e => set('fromName', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Email</label>
              <input className="input-field mt-0.5 text-sm" value={form.fromEmail} onChange={e => set('fromEmail', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Phone</label>
              <input className="input-field mt-0.5 text-sm" value={form.fromPhone} onChange={e => set('fromPhone', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Website</label>
              <input className="input-field mt-0.5 text-sm" value={form.fromWebsite} onChange={e => set('fromWebsite', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Address</label>
              <textarea className="input-field mt-0.5 text-sm resize-none" rows={2} value={form.fromAddress} onChange={e => set('fromAddress', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">GSTIN</label>
              <input className="input-field mt-0.5 text-sm" value={form.fromGSTIN} onChange={e => set('fromGSTIN', e.target.value)} />
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
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Service</p>
              <button
                onClick={addItem}
                className="flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-2.5 py-1 rounded-lg transition-colors"
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add
              </button>
            </div>

            {items.map((item, i) => (
              <div key={i} className="space-y-2 bg-white rounded-xl p-3 border border-violet-100">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-violet-400 uppercase">Item {i + 1}</span>
                  {items.length > 1 && (
                    <button
                      onClick={() => removeItem(i)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                      title="Remove"
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-violet-500 uppercase">Description</label>
                  <input className="input-field mt-0.5 text-sm" value={item.description}
                    onChange={e => updateItem(i, 'description', e.target.value)}
                    placeholder="Digital Marketing Services" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-violet-500 uppercase">Additional Info</label>
                  <textarea className="input-field mt-0.5 text-sm resize-none" rows={2} value={item.notes}
                    onChange={e => updateItem(i, 'notes', e.target.value)}
                    placeholder="e.g. 6 months plan, includes SEO + social media..." />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-violet-500 uppercase">Amount (₹)</label>
                  <input className="input-field mt-0.5 text-sm" type="number" min="0" value={item.amount}
                    onChange={e => updateItem(i, 'amount', e.target.value)} placeholder="40000" />
                </div>
              </div>
            ))}

            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">GST %</label>
              <input className="input-field mt-0.5 text-sm" type="number" min="0" max="100" value={form.gstRate}
                onChange={e => set('gstRate', parseFloat(e.target.value)||0)} />
            </div>

            {subtotal > 0 && (
              <div className="text-xs space-y-0.5 pt-1 border-t border-violet-200">
                <div className="flex justify-between"><span className="text-violet-500">Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between"><span className="text-violet-500">GST ({form.gstRate}%)</span><span>₹{gstAmt.toLocaleString('en-IN')}</span></div>
                <div className="flex justify-between font-bold"><span className="text-violet-700">Total</span><span className="text-violet-900">₹{total.toLocaleString('en-IN')}</span></div>
              </div>
            )}
          </div>

          <div className="bg-violet-50 rounded-2xl p-4 space-y-3">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Bank Details</p>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Account Name</label>
              <input className="input-field mt-0.5 text-sm" value={form.bankName} onChange={e => set('bankName', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Bank</label>
              <input className="input-field mt-0.5 text-sm" value={form.bankBank} onChange={e => set('bankBank', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">Account No.</label>
              <input className="input-field mt-0.5 text-sm" value={form.bankAccount} onChange={e => set('bankAccount', e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-violet-500 uppercase">IFSC Code</label>
              <input className="input-field mt-0.5 text-sm" value={form.bankIFSC} onChange={e => set('bankIFSC', e.target.value)} />
            </div>
          </div>

          <div className="bg-violet-50 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Notes / Terms</p>
            {/* Formatting toolbar */}
            <div className="flex flex-wrap gap-1 bg-white border border-violet-200 rounded-lg p-1">
              <button onMouseDown={e => { e.preventDefault(); execFormat('bold'); }}
                className="px-2 py-0.5 text-xs font-black border border-violet-200 rounded hover:bg-violet-100 transition-colors" title="Bold">B</button>
              <button onMouseDown={e => { e.preventDefault(); execFormat('italic'); }}
                className="px-2 py-0.5 text-xs italic border border-violet-200 rounded hover:bg-violet-100 transition-colors" title="Italic">I</button>
              <button onMouseDown={e => { e.preventDefault(); execFormat('underline'); }}
                className="px-2 py-0.5 text-xs underline border border-violet-200 rounded hover:bg-violet-100 transition-colors" title="Underline">U</button>
              <div className="w-px bg-violet-200 mx-0.5" />
              <button onMouseDown={e => { e.preventDefault(); execFormat('insertUnorderedList'); }}
                className="px-2 py-0.5 text-xs border border-violet-200 rounded hover:bg-violet-100 transition-colors" title="Bullet list">• List</button>
              <button onMouseDown={e => { e.preventDefault(); execFormat('insertOrderedList'); }}
                className="px-2 py-0.5 text-xs border border-violet-200 rounded hover:bg-violet-100 transition-colors" title="Numbered list">1. List</button>
              <div className="w-px bg-violet-200 mx-0.5" />
              <button onMouseDown={e => { e.preventDefault(); execFormat('removeFormat'); }}
                className="px-2 py-0.5 text-xs border border-violet-200 rounded hover:bg-violet-100 text-red-400 transition-colors" title="Clear formatting">✕</button>
            </div>
            <div
              ref={notesRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => { if (notesRef.current) set('notes', notesRef.current.innerHTML); }}
              className="input-field text-sm min-h-[80px] focus:outline-none"
              style={{ lineHeight: 1.6 }}
              data-placeholder="e.g. This quotation is valid for 30 days. 50% advance required."
            />
            <style>{`[data-placeholder]:empty:before { content: attr(data-placeholder); color: #aaa; pointer-events: none; }`}</style>
          </div>

          <button onClick={handleDownload}
            className="w-full btn-primary flex items-center justify-center gap-2 py-3 text-base font-bold shadow-lg">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download {docLabel}
          </button>

          {/* ── History ── */}
          {history.length > 0 && (
            <div className="bg-violet-50 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-violet-500 uppercase tracking-widest">Quotation History</p>
                <button onClick={() => { setHistory([]); localStorage.removeItem('quotation_history'); }}
                  className="text-[10px] text-violet-400 hover:text-red-500 transition-colors">Clear</button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map(h => (
                  <div key={h.id} className="bg-white rounded-xl p-3 border border-violet-100 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-violet-800">#{h.quotationNo}</span>
                      <span className="text-violet-400">{h.quotationMonth} {h.quotationYear}</span>
                    </div>
                    <div className="text-gray-600 truncate">{h.billToName || '—'}</div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-gray-400 truncate max-w-[120px]">{h.description}</span>
                      <span className="font-bold text-violet-700">₹{h.total?.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">{h.downloadedAt}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── QUOTATION PREVIEW ───────────────────────────────── */}
        <div className="flex-1 min-w-0" ref={previewWrapRef}>
          <div style={{ zoom: scale }}>
          <style>{`
            #quotation-print-area .notes-content * { border: none !important; border-bottom: none !important; border-top: none !important; box-shadow: none !important; outline: none !important; margin: 0 !important; padding: 0 !important; }
            #quotation-print-area .notes-content div, #quotation-print-area .notes-content p { line-height: 1.6; }
          `}</style>
          <div id="quotation-print-area"
            style={{
              fontFamily: "'Arial', sans-serif",
              background: '#fff',
              width: 794,
              boxShadow: '0 4px 32px rgba(80,0,160,0.13)',
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid #ede9fe',
            }}>

            {/* ── Quotation title ── */}
            <div style={{ textAlign: 'center', padding: '16px 36px 16px' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#111' }}>
                {docLabel} - {form.quotationMonth} {form.quotationYear}
              </div>
            </div>

            {/* ── Logo + Quotation meta ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 36px 16px' }}>
              <img src="/logo.png" alt="Zaltix" style={{ height: 52, width: 'auto', display: 'block' }} />
              <div style={{ fontSize: 12, color: '#333' }}>
                <table style={{ borderCollapse: 'collapse' }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#666', paddingRight: 16, paddingBottom: 3 }}>{docLabel} No.:</td>
                      <td style={{ fontWeight: 700, paddingBottom: 3 }}>{form.quotationNo || '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#666', paddingRight: 16 }}>{docLabel} Date:</td>
                      <td style={{ fontWeight: 700 }}>{form.quotationDate || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* ── From / Bill to ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '12px 36px', borderTop: '1.5px solid #ede9fe', borderBottom: '1.5px solid #ede9fe', gap: 32, background: '#faf8ff' }}>
              {/* From */}
              <div style={{ fontSize: 11, color: '#333', lineHeight: 1.65 }}>
                <div style={{ fontWeight: 700, color: '#555', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>From</div>
                <div style={{ fontWeight: 800, fontSize: 12, color: '#111', marginBottom: 2 }}>{form.fromName}</div>
                {form.fromEmail   && <div>{form.fromEmail}</div>}
                {form.fromPhone   && <div>{form.fromPhone}</div>}
                {form.fromWebsite && <div>{form.fromWebsite}</div>}
                {form.fromAddress && <div style={{ whiteSpace: 'pre-line' }}>{form.fromAddress}</div>}
                {form.fromGSTIN   && (
                  <div style={{ fontWeight: 800, marginTop: 6, fontSize: 11, color: '#111' }}>
                    GSTIN : {form.fromGSTIN}
                  </div>
                )}
              </div>
              {/* Bill to */}
              <div style={{ fontSize: 11, color: '#333', lineHeight: 1.65, textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: '#555', fontSize: 10, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 1 }}>Bill to</div>
                <div style={{ fontWeight: 900, fontSize: 16, color: '#111', lineHeight: 1.2, marginBottom: 4 }}>
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
            <div style={{ padding: '0 36px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1A0440', color: '#fff' }}>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, letterSpacing: 1.2, fontSize: 11 }}>DESCRIPTION</th>
                    <th style={{ padding: '9px 16px', textAlign: 'right', fontWeight: 700, letterSpacing: 1.2, fontSize: 11, width: 140 }}>AMOUNT (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const itemAmt = parseFloat(item.amount) || 0;
                    return (
                      <tr key={i} style={{ background: '#faf8ff', borderBottom: '1px solid #ede9fe', height: 38 }}>
                        <td style={{ padding: '0 16px', color: '#333' }}>
                          {item.description || <span style={{ color: '#bbb' }}>Service description</span>}
                        </td>
                        <td style={{ padding: '0 16px', textAlign: 'right', color: '#333' }}>
                          {itemAmt > 0 ? itemAmt.toLocaleString('en-IN') : <span style={{ color: '#bbb' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {form.gstRate > 0 && (
                    <tr style={{ background: '#faf8ff', borderBottom: '1px solid #ede9fe', height: 38 }}>
                      <td style={{ padding: '0 16px', color: '#555' }}>GST @ {form.gstRate}%</td>
                      <td style={{ padding: '0 16px', textAlign: 'right', color: '#555' }}>
                        {subtotal > 0 ? gstAmt.toLocaleString('en-IN') : '—'}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#ede9fe', borderTop: '2px solid #2D0A6B', height: 38 }}>
                    <td style={{ padding: '0 16px', fontWeight: 900, fontSize: 12, color: '#2D0A6B' }}>Total</td>
                    <td style={{ padding: '0 16px', textAlign: 'right', fontWeight: 900, fontSize: 12, color: '#2D0A6B' }}>
                      ₹ {subtotal > 0 ? total.toLocaleString('en-IN') : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ── Amount in words + Additional Info ── */}
            <div style={{ padding: '0 36px' }}>
              <div style={{ borderTop: '1px solid #ede9fe', paddingTop: 8, paddingBottom: 8 }}>
                <div style={{ fontSize: 11, color: '#2D0A6B', fontWeight: 700, fontStyle: 'italic' }}>
                  {subtotal > 0 ? inWords : <span style={{ color: '#bbb', fontStyle: 'italic' }}>(Amount in words)</span>}
                </div>
                {items.some(it => it.notes) && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 700, fontSize: 10, color: '#2D0A6B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Additional Info</div>
                    {items.filter(it => it.notes).map((it, i) => (
                      <div key={i} style={{ fontSize: 11, color: '#555', fontStyle: 'italic', lineHeight: 1.6 }}>
                        {items.filter(it2 => it2.notes).length > 1 && (
                          <span style={{ fontWeight: 700, fontStyle: 'normal', color: '#333', marginRight: 6 }}>{it.description}:</span>
                        )}
                        {it.notes}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Notes / Terms ── */}
            {form.notes && (
              <div style={{ padding: '0 36px 8px' }}>
                <div style={{ padding: '8px 0', fontSize: 11, color: '#444' }}>
                  <div style={{ fontWeight: 700, color: '#2D0A6B', fontSize: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1.5px solid #2D0A6B', paddingBottom: 4 }}>Notes / Terms</div>
                  <div className="notes-content" style={{ border: 'none', outline: 'none', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: form.notes }} />
                </div>
              </div>
            )}

            {/* ── Divider + Payment + Signature ── */}
            <div style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              <div style={{ height: 1, background: '#ede9fe', margin: '4px 36px 0' }} />

            {/* ── Payment + Signature ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '12px 36px 16px', gap: 24, alignItems: 'end' }}>
              {/* Bank details */}
              <div style={{ fontSize: 11, lineHeight: 1.75, color: '#333' }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: '#111', marginBottom: 5 }}>Please Make Payment To</div>
                <div><strong style={{ color: '#111' }}>Account Name :</strong> {form.bankName}</div>
                <div><strong style={{ color: '#111' }}>Bank :</strong> {form.bankBank}</div>
                <div><strong style={{ color: '#111' }}>Account No. :</strong> {form.bankAccount}</div>
                <div><strong style={{ color: '#111' }}>IFSC Code :</strong> {form.bankIFSC}</div>
              </div>
              {/* Signature */}
              <div style={{ textAlign: 'center', fontSize: 11, color: '#333' }}>
                <div style={{ display: 'inline-block' }}>
                  <img src="/signature.png" alt="Signature" style={{ height: 48, width: 'auto', display: 'block' }} />
                  <div style={{ borderTop: '1.5px solid #555', paddingTop: 6 }}>
                    <div style={{ fontWeight: 900, fontSize: 13, color: '#111' }}>Saikumar Dara</div>
                    <div style={{ color: '#555', marginTop: 2, fontSize: 11 }}>CEO &amp; Managing Director</div>
                  </div>
                </div>
              </div>
            </div>
            </div>{/* end pageBreakInside wrapper */}


          </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default GenerateQuotation;
