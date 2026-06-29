// import { useState, useEffect } from 'react';
// import toast from 'react-hot-toast';
// import api from '../../utils/api';
// import Card from '../../components/UI/Card';
// import Modal from '../../components/UI/Modal';
// import EmptyState from '../../components/UI/EmptyState';
// import { formatCurrency, monthName } from '../../utils/helpers';

// const SI = ({ d, d2, size = 16, color }) => (
//   <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
//     <path d={d} />{d2 && <path d={d2} />}
//   </svg>
// );

// const HRPayslips = () => {
//   const [payslips, setPayslips] = useState([]);
//   const [employees, setEmployees] = useState([]);
//   const [showModal, setShowModal] = useState(false);
//   const [loading, setLoading] = useState(false);
//   const [downloading, setDownloading] = useState(null);
//   const [deleting, setDeleting] = useState(null);
//   const now = new Date();
//   const [filterMonth, setFilterMonth] = useState('');
//   const [filterYear, setFilterYear] = useState('');
//   const [form, setForm] = useState({
//     employeeId: '', month: now.getMonth() + 1, year: now.getFullYear(),
//     basicSalary: '', workingDays: 26, presentDays: 26,
//     allowances: [{ name: 'HRA', amount: 0 }, { name: 'Travel Allowance', amount: 0 }],
//     deductions: [{ name: 'PF', amount: 0 }, { name: 'ESI', amount: 0 }, { name: 'Tax', amount: 0 }],
//   });
//   const [selectedEmpSalary, setSelectedEmpSalary] = useState(null);

//   const fetch = async () => {
//     const params = new URLSearchParams();
//     if (filterMonth) params.append('month', filterMonth);
//     if (filterYear) params.append('year', filterYear);
//     api.get(`/payslips?${params}`).then(r => setPayslips(r.data)).catch(() => {});
//   };

//   useEffect(() => {
//     api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
//     fetch();
//   }, [filterMonth, filterYear]);

//   const handleEmpSelect = (id) => {
//     const emp = employees.find(e => e._id === id);
//     if (emp) {
//       setSelectedEmpSalary(emp);
//       setForm(f => ({
//         ...f, employeeId: id,
//         basicSalary: emp.basicSalary || '',
//         allowances: emp.allowances?.length ? emp.allowances : [{ name: 'HRA', amount: 0 }],
//         deductions: emp.deductions?.length ? emp.deductions : [{ name: 'PF', amount: 0 }, { name: 'ESI', amount: 0 }],
//       }));
//     } else {
//       setForm(f => ({ ...f, employeeId: id }));
//     }
//   };

//   const basicVal = parseFloat(form.basicSalary || 0);
//   const totalAllowances = form.allowances.reduce((s, a) => s + parseFloat(a.amount || 0), 0);
//   const grossSalary = basicVal + totalAllowances;
//   const totalDeductions = form.deductions.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
//   const netSalary = grossSalary - totalDeductions;

//   const handleGenerate = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     try {
//       await api.post('/payslips', {
//         ...form,
//         basicSalary: parseFloat(form.basicSalary),
//         allowances: form.allowances.map(a => ({ ...a, amount: parseFloat(a.amount || 0) })),
//         deductions: form.deductions.map(d => ({ ...d, amount: parseFloat(d.amount || 0) })),
//       });
//       toast.success('Payslip generated and published!');
//       setShowModal(false);
//       fetch();
//     } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
//     finally { setLoading(false); }
//   };

//   const handleDelete = async (id) => {
//     if (!window.confirm('Delete this payslip? This cannot be undone.')) return;
//     setDeleting(id);
//     try {
//       await api.delete(`/payslips/${id}`);
//       setPayslips(p => p.filter(ps => ps._id !== id));
//       toast.success('Payslip deleted');
//     } catch { toast.error('Delete failed'); }
//     finally { setDeleting(null); }
//   };

//   const handleDownload = async (id, emp, month, year) => {
//     setDownloading(id);
//     try {
//       const res = await api.get(`/payslips/${id}/download`, { responseType: 'blob' });
//       const url = URL.createObjectURL(res.data);
//       const a = document.createElement('a'); a.href = url; a.download = `Payslip_${emp?.name?.replace(/ /g, '_')}_${monthName(month)}_${year}.pdf`; a.click();
//       URL.revokeObjectURL(url); toast.success('Downloaded!');
//     } catch (err) {
//       const msg = err.response?.data?.message || err.message || 'Download failed';
//       toast.error(msg);
//       console.error('Download error:', err);
//     }
//     finally { setDownloading(null); }
//   };

//   const updateAllowance = (i, field, value) => {
//     setForm(f => { const arr = [...f.allowances]; arr[i] = { ...arr[i], [field]: value }; return { ...f, allowances: arr }; });
//   };
//   const updateDeduction = (i, field, value) => {
//     setForm(f => { const arr = [...f.deductions]; arr[i] = { ...arr[i], [field]: value }; return { ...f, deductions: arr }; });
//   };
//   const addAllowance = () => setForm(f => ({ ...f, allowances: [...f.allowances, { name: '', amount: 0 }] }));
//   const addDeduction = () => setForm(f => ({ ...f, deductions: [...f.deductions, { name: '', amount: 0 }] }));

//   return (
//     <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 sm:space-y-5 animate-fade-in">
//       <div className="page-header">
//         <div><h2 className="page-title">Payroll Management</h2><p className="page-subtitle">{payslips.length} payslips generated</p></div>
//         <button onClick={() => setShowModal(true)} className="btn-primary">+ Generate Payslip</button>
//       </div>

//       <Card>
//         <div className="flex flex-wrap gap-3 mb-4">
//           <select className="input-field w-auto" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
//             <option value="">All Months</option>
//             {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
//           </select>
//           <select className="input-field w-auto" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
//             <option value="">All Years</option>
//             {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
//           </select>
//         </div>

//         {payslips.length === 0 ? (
//           <EmptyState icon={<SI d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" size={40} color="text-violet-400" />} title="No payslips" message="Generate payslips for employees."
//             action={{ label: 'Generate', onClick: () => setShowModal(true) }} />
//         ) : (
//           <div className="overflow-x-auto">
//             <table className="data-table">
//               <thead>
//                 <tr><th>Employee</th><th>Period</th><th>Basic</th><th>Gross</th><th>Net Pay</th><th>Actions</th></tr>
//               </thead>
//               <tbody>
//                 {payslips.map(ps => (
//                   <tr key={ps._id}>
//                     <td>
//                       <p className="font-medium text-violet-900">{ps.employee?.name}</p>
//                       <p className="text-xs text-violet-400">{ps.employee?.employeeId}</p>
//                     </td>
//                     <td>{monthName(ps.month)} {ps.year}</td>
//                     <td>{formatCurrency(ps.basicSalary)}</td>
//                     <td>{formatCurrency(ps.grossSalary)}</td>
//                     <td className="font-bold text-golden-600">{formatCurrency(ps.netSalary)}</td>
//                     <td>
//                       <div className="flex items-center gap-2">
//                         <button onClick={() => handleDownload(ps._id, ps.employee, ps.month, ps.year)}
//                           disabled={downloading === ps._id}
//                           className="btn-primary btn-sm flex items-center gap-1">
//                           {downloading === ps._id ? '...' : <><SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={13} color="text-white" /> PDF</>}
//                         </button>
//                         <button onClick={() => handleDelete(ps._id)}
//                           disabled={deleting === ps._id}
//                           className="btn-danger btn-sm flex items-center justify-center aspect-square">
//                           {deleting === ps._id ? '…' : <SI d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" size={14} color="text-white" />}
//                         </button>
//                       </div>
//                     </td>
//                   </tr>
//                 ))}
//               </tbody>
//             </table>
//           </div>
//         )}
//       </Card>

//       {/* Generate Payslip Modal */}
//       <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Generate Payslip" size="lg">
//         <form onSubmit={handleGenerate} className="space-y-4">
//           <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
//             <div>
//               <label className="input-label">Employee *</label>
//               <select className="input-field" required value={form.employeeId} onChange={e => handleEmpSelect(e.target.value)}>
//                 <option value="">Select employee</option>
//                 {employees.map(e => <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>)}
//               </select>
//             </div>
//             <div>
//               <label className="input-label">Month *</label>
//               <select className="input-field" value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))}>
//                 {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>)}
//               </select>
//             </div>
//             <div>
//               <label className="input-label">Year *</label>
//               <select className="input-field" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}>
//                 {[now.getFullYear(), now.getFullYear() - 1].map(y => <option key={y} value={y}>{y}</option>)}
//               </select>
//             </div>
//           </div>

//           <div className="grid grid-cols-3 gap-3">
//             <div>
//               <label className="input-label">Basic Salary (₹) *</label>
//               <input type="number" className="input-field" required value={form.basicSalary}
//                 onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} placeholder="0" />
//             </div>
//             <div>
//               <label className="input-label">Working Days</label>
//               <input type="number" className="input-field" value={form.workingDays}
//                 onChange={e => setForm(f => ({ ...f, workingDays: parseInt(e.target.value) }))} />
//             </div>
//             <div>
//               <label className="input-label">Present Days</label>
//               <input type="number" className="input-field" value={form.presentDays}
//                 onChange={e => setForm(f => ({ ...f, presentDays: parseInt(e.target.value) }))} />
//             </div>
//           </div>

//           {/* Allowances */}
//           <div>
//             <div className="flex items-center justify-between mb-2">
//               <label className="input-label mb-0">Allowances</label>
//               <button type="button" onClick={addAllowance} className="text-xs text-violet-600 hover:text-violet-700 font-medium">+ Add</button>
//             </div>
//             {form.allowances.map((a, i) => (
//               <div key={i} className="flex gap-2 mb-2">
//                 <input className="input-field" value={a.name} onChange={e => updateAllowance(i, 'name', e.target.value)} placeholder="Name" />
//                 <input type="number" className="input-field w-32" value={a.amount} onChange={e => updateAllowance(i, 'amount', e.target.value)} placeholder="₹0" />
//               </div>
//             ))}
//           </div>

//           {/* Deductions */}
//           <div>
//             <div className="flex items-center justify-between mb-2">
//               <label className="input-label mb-0">Deductions</label>
//               <button type="button" onClick={addDeduction} className="text-xs text-violet-600 hover:text-violet-700 font-medium">+ Add</button>
//             </div>
//             {form.deductions.map((d, i) => (
//               <div key={i} className="flex gap-2 mb-2">
//                 <input className="input-field" value={d.name} onChange={e => updateDeduction(i, 'name', e.target.value)} placeholder="Name" />
//                 <input type="number" className="input-field w-32" value={d.amount} onChange={e => updateDeduction(i, 'amount', e.target.value)} placeholder="₹0" />
//               </div>
//             ))}
//           </div>

//           {/* Summary */}
//           <div className="bg-gradient-to-r from-violet-50 to-golden-50 rounded-xl p-4 space-y-2 text-sm">
//             <p className="text-xs text-violet-400 mb-1">All values are entered manually. Basic salary is used as-is.</p>
//             <div className="flex justify-between"><span className="text-gray-600">Basic Salary</span><span className="font-semibold">{formatCurrency(basicVal)}</span></div>
//             <div className="flex justify-between"><span className="text-gray-600">Allowances</span><span className="font-semibold">{formatCurrency(totalAllowances)}</span></div>
//             <div className="flex justify-between"><span className="text-gray-600">Gross Salary</span><span className="font-semibold">{formatCurrency(grossSalary)}</span></div>
//             <div className="flex justify-between"><span className="text-gray-600">Total Deductions (PF + ESI + Tax + ...)</span><span className="font-semibold text-gray-900">- {formatCurrency(totalDeductions)}</span></div>
//             <div className="flex justify-between border-t border-violet-200 pt-2"><span className="font-bold text-violet-900">Net Pay</span><span className="font-bold text-golden-600 text-lg">{formatCurrency(netSalary)}</span></div>
//           </div>

//           <div className="flex gap-3">
//             <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Generating...' : 'Generate & Publish'}</button>
//             <button type="button" className="btn-secondary flex-1" onClick={() => setShowModal(false)}>Cancel</button>
//           </div>
//         </form>
//       </Modal>
//     </div>
//   );
// };

// export default HRPayslips;
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import EmptyState from '../../components/UI/EmptyState';
import { formatCurrency, monthName } from '../../utils/helpers';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const HRPayslips = () => {
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [selectedEmpRole, setSelectedEmpRole] = useState('');
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [form, setForm] = useState({
    employeeId: '', 
    month: now.getMonth() + 1, 
    year: now.getFullYear(),
    // Employee details (will be auto-filled from selected employee)
    employeeName: '',
    employeeCode: '',
    location: '',
    department: '',
    designation: '',
    panNo: '',
    // Attendance
    workingDays: 26,
    presentDays: 26,
    lwpDays: 0,
    extraWorkedHours: 0,
    // Earnings
    earnings: {
      basic: '',
      da: '',
      hra: '',
      otherAllowance: '',
      incentives: '',
    },
    // Deductions
    deductions: {
      pf: '',
      pt: '',
      esi: '',
    },
  });

  const fetch = async () => {
    const params = new URLSearchParams();
    if (filterMonth) params.append('month', filterMonth);
    if (filterYear) params.append('year', filterYear);
    try {
      const response = await api.get(`/payslips?${params}`);
      setPayslips(response.data);
    } catch (error) {
      console.error('Error fetching payslips:', error);
    }
  };

  useEffect(() => {
    api.get('/employees').then(r => setEmployees(r.data)).catch(() => {});
    fetch();
  }, [filterMonth, filterYear]);

  const handleEmpSelect = (id) => {
    const emp = employees.find(e => e._id === id);
    if (emp) {
      setSelectedEmpRole(emp.role || '');
      setForm(f => ({
        ...f,
        employeeId: id,
        employeeName: emp.name || '',
        employeeCode: emp.employeeId || '',
        location: emp.location || 'Hyderabad - SEZ',
        department: emp.department?.name || emp.department || 'US Staffing - Healthcare',
        designation: emp.designation || 'Management Trainee',
        panNo: emp.panNo || '',
        earnings: {
          basic: emp.basicSalary ? String(emp.basicSalary) : '',
          da: emp.da ? String(emp.da) : '',
          hra: emp.hra ? String(emp.hra) : '',
          otherAllowance: emp.otherAllowance ? String(emp.otherAllowance) : '',
          incentives: '',
        }
      }));
    }
  };

  const isSalesEmployee = selectedEmpRole === 'sales';

  // Calculate totals (exclude incentives if not sales employee)
  const totalEarnings = Object.entries(form.earnings || {}).reduce((sum, [key, val]) => {
    if (key === 'incentives' && !isSalesEmployee) return sum;
    return sum + (parseFloat(val) || 0);
  }, 0);
  const totalDeductions = Object.values(form.deductions || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const netPayable = totalEarnings - totalDeductions;

  // Handle input changes for earnings
  const handleEarningChange = (field, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setForm(f => ({ ...f, earnings: { ...f.earnings, [field]: value } }));
  };

  // Handle input changes for deductions
  const handleDeductionChange = (field, value) => {
    if (value !== '' && !/^\d*\.?\d*$/.test(value)) return;
    setForm(f => ({ ...f, deductions: { ...f.deductions, [field]: value } }));
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Calculate gross and net
      const grossSalary = totalEarnings;
      const netSalary = netPayable;
      // Basic goes as basicSalary; remaining earnings become allowances
      const ALLOWANCE_LABELS = {
        da: 'Dearness Allowance',
        hra: 'House Rent Allowance',
        otherAllowance: 'Other Allowance',
        incentives: 'Incentives',
      };
      const DEDUCTION_LABELS = {
        pf: 'Provident Fund',
        pt: 'Professional Tax',
        esi: 'Employee State Insurance',
      };
      const allowances = Object.entries(form.earnings || {})
        .filter(([key]) => key !== 'basic' && (key !== 'incentives' || isSalesEmployee))
        .map(([key, val]) => ({ name: ALLOWANCE_LABELS[key] || key.toUpperCase(), amount: parseFloat(val) || 0 }));
      const deductions = Object.entries(form.deductions || {})
        .map(([key, val]) => ({ name: DEDUCTION_LABELS[key] || key.toUpperCase(), amount: parseFloat(val) || 0 }));

      await api.post('/payslips', {
        employeeId: form.employeeId,
        month: form.month,
        year: form.year,
        basicSalary: parseFloat(form.earnings.basic) || 0,
        workingDays: form.workingDays || 26,
        presentDays: form.presentDays || form.workingDays || 26,
        lwpDays: form.lwpDays || 0,
        grossSalary,
        netSalary,
        allowances,
        deductions,
      });
      toast.success('Payslip generated successfully!');
      setShowModal(false);
      fetch();
    } catch (err) { 
      toast.error(err.response?.data?.message || 'Failed to generate payslip'); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this payslip? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await api.delete(`/payslips/${id}`);
      setPayslips(p => p.filter(ps => ps._id !== id));
      toast.success('Payslip deleted');
    } catch { toast.error('Delete failed'); }
    finally { setDeleting(null); }
  };

  const handleDownload = async (id, emp, month, year) => {
    setDownloading(id);
    try {
      const res = await api.get(`/payslips/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const cd = res.headers?.['content-disposition'];
      let filename = '';
      if (cd) {
        const m = cd.match(/filename\*?=(?:UTF-8''?)?"?([^";]+)/i);
        if (m && m[1]) filename = decodeURIComponent(m[1].replace(/"/g, ''));
      }
      // Fallback: match backend's format exactly — Payslip_Month_Year_EmployeeCode.pdf
      if (!filename) filename = `Payslip_${FULL_MONTHS[month - 1]}_${year}_${emp?.employeeId || 'EMP'}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded!');
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Download failed';
      toast.error(msg);
      console.error('Download error:', err);
    } finally { 
      setDownloading(null); 
    }
  };

  // Number to words converter (simplified)
  const numberToWords = (num) => {
    if (num === 0) return 'Zero';
    
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    const numToWords = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + numToWords(n % 100) : '');
      if (n < 100000) return numToWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + numToWords(n % 1000) : '');
      return numToWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + numToWords(n % 100000) : '');
    };
    
    return numToWords(num) + ' only';
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 space-y-4 sm:space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Payroll Management</h2>
          <p className="page-subtitle">{payslips.length} payslips generated</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          + Generate Payslip
        </button>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <select className="input-field w-auto" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
            <option value="">All Months</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {new Date(0, i).toLocaleString('default', { month: 'long' })}
              </option>
            ))}
          </select>
          <select className="input-field w-auto" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
            <option value="">All Years</option>
            {[now.getFullYear(), now.getFullYear() - 1].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {payslips.length === 0 ? (
          <EmptyState
            icon={<SI d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" size={40} color="text-violet-400" />}
            title="No payslips"
            message="Generate payslips for employees."
            action={{ label: 'Generate', onClick: () => setShowModal(true) }}
          />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {payslips.map(ps => (
                <div key={ps._id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="font-semibold text-violet-900 text-sm">{ps.employee?.name}</p>
                      <p className="text-xs text-violet-400">{ps.employee?.employeeId}</p>
                      {ps.generatedBy?.name && (
                        <p className="text-xs text-gray-400 mt-0.5">By {ps.generatedBy.name}</p>
                      )}
                    </div>
                    <span className="text-xs font-semibold bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                      {monthName(ps.month)} {ps.year}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Basic</p>
                      <p className="text-xs font-bold text-gray-700">{formatCurrency(ps.basicSalary || 0)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">Gross</p>
                      <p className="text-xs font-bold text-gray-700">{formatCurrency(ps.grossSalary || 0)}</p>
                    </div>
                    <div className="bg-violet-50 rounded-lg p-2">
                      <p className="text-[10px] text-violet-400 uppercase font-semibold">Net Pay</p>
                      <p className="text-xs font-bold text-violet-700">{formatCurrency(ps.netSalary || 0)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDownload(ps._id, ps.employee, ps.month, ps.year)}
                      disabled={downloading === ps._id}
                      className="btn-primary btn-sm flex items-center gap-1 flex-1 justify-center text-xs"
                    >
                      {downloading === ps._id ? 'Downloading...' : (
                        <><SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={13} color="text-white" /> Download PDF</>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(ps._id)}
                      disabled={deleting === ps._id}
                      className="btn-danger btn-sm flex items-center justify-center px-3"
                    >
                      {deleting === ps._id ? '…' : <SI d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" size={14} color="text-white" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Period</th>
                    <th>Generated By</th>
                    <th>Basic</th>
                    <th>Gross</th>
                    <th>Net Pay</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map(ps => (
                    <tr key={ps._id}>
                      <td>
                        <p className="font-medium text-violet-900">{ps.employee?.name}</p>
                        <p className="text-xs text-violet-400">{ps.employee?.employeeId}</p>
                      </td>
                      <td>{monthName(ps.month)} {ps.year}</td>
                      <td className="text-sm text-gray-600">{ps.generatedBy?.name || '—'}</td>
                      <td>{formatCurrency(ps.basicSalary || 0)}</td>
                      <td>{formatCurrency(ps.grossSalary || 0)}</td>
                      <td className="font-bold text-golden-600">{formatCurrency(ps.netSalary || 0)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownload(ps._id, ps.employee, ps.month, ps.year)}
                            disabled={downloading === ps._id}
                            className="btn-primary btn-sm flex items-center gap-1"
                          >
                            {downloading === ps._id ? '...' : (
                              <><SI d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" size={13} color="text-white" /> PDF</>
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(ps._id)}
                            disabled={deleting === ps._id}
                            className="btn-danger btn-sm flex items-center justify-center aspect-square"
                          >
                            {deleting === ps._id ? '…' : <SI d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" size={14} color="text-white" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Generate Payslip Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Generate Payslip" size="lg">
        <form onSubmit={handleGenerate} className="space-y-5 max-h-[78vh] overflow-y-auto px-1 pb-1">

          {/* ── Employee + Period ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="input-label">Employee *</label>
              <select className="input-field" required value={form.employeeId} onChange={e => handleEmpSelect(e.target.value)}>
                <option value="">Select employee</option>
                {employees.map(e => (
                  <option key={e._id} value={e._id}>{e.name} ({e.employeeId})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">PAN No.</label>
              <input type="text" className="input-field bg-gray-50" value={form.panNo} readOnly placeholder="Auto-filled" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="input-label">Month *</label>
              <select className="input-field" value={form.month} onChange={e => setForm(f => ({ ...f, month: parseInt(e.target.value) }))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(0, i).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Year *</label>
              <select className="input-field" value={form.year} onChange={e => setForm(f => ({ ...f, year: parseInt(e.target.value) }))}>
                {[now.getFullYear(), now.getFullYear() - 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Employee Info (read-only) ── */}
          {form.employeeId && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-violet-50 border border-violet-100 p-3 rounded-xl">
              {[
                { label: 'Employee Code', value: form.employeeCode },
                { label: 'Designation',   value: form.designation },
                { label: 'Department',    value: form.department },
                { label: 'Location',      value: form.location },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[11px] font-semibold text-violet-400 uppercase tracking-wide">{label}</p>
                  <p className="text-sm font-semibold text-violet-900 mt-0.5 truncate">{value || '—'}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Attendance ── */}
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Attendance</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="input-label">Working Days</label>
                <input type="number" className="input-field" value={form.workingDays}
                  onChange={e => setForm(f => ({ ...f, workingDays: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className="input-label">Present Days</label>
                <input type="number" className="input-field" value={form.presentDays}
                  onChange={e => setForm(f => ({ ...f, presentDays: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className="input-label">Loss of Pay</label>
                <input type="number" className="input-field" value={form.lwpDays}
                  onChange={e => setForm(f => ({ ...f, lwpDays: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="input-label">Extra Hrs</label>
                <input type="number" className="input-field" value={form.extraWorkedHours}
                  onChange={e => setForm(f => ({ ...f, extraWorkedHours: parseInt(e.target.value) }))} />
              </div>
            </div>
          </div>

          {/* ── Earnings ── */}
          <div className="border border-violet-100 rounded-xl p-4">
            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-3">Earnings</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="input-label">Basic Salary (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.earnings.basic}
                  onChange={e => handleEarningChange('basic', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="input-label">Dearness Allowance (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.earnings.da}
                  onChange={e => handleEarningChange('da', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="input-label">House Rent Allowance (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.earnings.hra}
                  onChange={e => handleEarningChange('hra', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="input-label">Other Allowance (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.earnings.otherAllowance}
                  onChange={e => handleEarningChange('otherAllowance', e.target.value)} placeholder="0" />
              </div>
              {isSalesEmployee && (
                <div>
                  <label className="input-label">Incentives (Rs.)</label>
                  <input type="text" inputMode="decimal" className="input-field" value={form.earnings.incentives}
                    onChange={e => handleEarningChange('incentives', e.target.value)} placeholder="0" />
                </div>
              )}
            </div>
          </div>

          {/* ── Deductions ── */}
          <div className="border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-3">Deductions</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="input-label">Provident Fund (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.deductions.pf}
                  onChange={e => handleDeductionChange('pf', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="input-label">Professional Tax (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.deductions.pt}
                  onChange={e => handleDeductionChange('pt', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="input-label">ESI (Rs.)</label>
                <input type="text" inputMode="decimal" className="input-field" value={form.deductions.esi}
                  onChange={e => handleDeductionChange('esi', e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>

          {/* ── Summary ── */}
          <div className="bg-gradient-to-br from-violet-50 to-purple-50 border border-violet-100 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Earnings</span>
              <span className="font-semibold text-violet-700">{formatCurrency(totalEarnings)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Total Deductions</span>
              <span className="font-semibold text-gray-900">− {formatCurrency(totalDeductions)}</span>
            </div>
            <div className="flex justify-between items-center border-t border-violet-200 pt-2">
              <span className="font-bold text-violet-900">Net Payable</span>
              <span className="font-bold text-violet-700 text-lg">{formatCurrency(netPayable)}</span>
            </div>
            <p className="text-xs text-gray-400 pt-1 leading-relaxed">
              In Words: <span className="text-gray-600 italic">{numberToWords(Math.round(netPayable))}</span>
            </p>
          </div>

          {/* ── Actions ── */}
          <div className="flex flex-col sm:flex-row gap-3 pt-1">
            <button type="submit" className="btn-primary flex-1 justify-center" disabled={loading}>
              {loading ? 'Generating...' : 'Generate & Publish'}
            </button>
            <button type="button" className="btn-secondary flex-1 justify-center" onClick={() => setShowModal(false)}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default HRPayslips;