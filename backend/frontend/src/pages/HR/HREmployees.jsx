import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Modal from '../../components/UI/Modal';
import { formatDate, getInitials, formatCurrency } from '../../utils/helpers';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';

/* ── small inline svg ── */
const Ico = ({ d, d2, className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
    strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const ROLE_COLORS = { employee: 'bg-violet-100 text-violet-700', sales: 'bg-amber-100 text-amber-700', field_sales: 'bg-golden-100 text-golden-700', hr: 'bg-violet-100 text-violet-700', admin: 'bg-gray-100 text-gray-900' };
const TYPE_COLORS = { fresher: 'bg-violet-100 text-violet-700', experienced: 'bg-violet-100 text-violet-700' };
const DOC_STATUS  = { pending_upload: 'bg-gray-100 text-gray-600', uploaded: 'bg-violet-100 text-violet-700', approved: 'bg-violet-100 text-violet-700', rejected: 'bg-gray-100 text-gray-900' };
const DOC_LABEL   = { pending_upload: 'Pending Upload', uploaded: 'Uploaded', approved: 'Approved', rejected: 'Rejected' };

const Chip = ({ label, colorCls }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold capitalize ${colorCls}`}>{label}</span>
);

const EMPTY_FORM = { employeeId: '', name: '', email: '', role: 'employee', departmentId: '', designation: '', phone: '', joiningDate: '', basicSalary: '', employeeType: '' };

export default function HREmployees() {
  const [employees, setEmployees]         = useState([]);
  const [departments, setDepartments]     = useState([]);
  const [showAddModal, setShowAddModal]       = useState(false);
  const [showEditModal, setShowEditModal]     = useState(false);
  const [showDocsModal, setShowDocsModal]     = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [selectedEmp, setSelectedEmp]         = useState(null);
  const [loading, setLoading]             = useState(false);
  const [search, setSearch]               = useState('');
  const [form, setForm]                   = useState(EMPTY_FORM);

  const fetchAll = async () => {
    try {
      const [e, d] = await Promise.all([api.get('/employees'), api.get('/admin/departments')]);
      setEmployees(e.data || []);
      setDepartments(d.data || []);
    } catch { /* silent */ }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreate = async (ev) => {
    ev.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/employees', form);
      toast.success(`Employee created! Temp password: ${res.data.tempPassword}`, { duration: 6000 });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create employee'); }
    finally { setLoading(false); }
  };

  const sendOffer = async (emp) => {
    try { await api.post('/employees/send-offer', { employeeId: emp._id, salary: emp.basicSalary }); toast.success('Offer letter sent!'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const sendCreds = async (emp) => {
    try { await api.post('/employees/send-credentials', { employeeId: emp._id }); toast.success('Credentials sent!'); }
    catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (emp) => {
    if (!window.confirm(`Delete ${emp.name} (${emp.employeeId}) permanently?`)) return;
    try { await api.delete(`/employees/${emp._id}`); toast.success(`${emp.name} deleted.`); fetchAll(); }
    catch (err) { toast.error(err.response?.data?.message || 'Delete failed'); }
  };

  const openEdit   = (emp) => { setSelectedEmp(emp); setShowEditModal(true); };
  const openDocs   = (emp) => { setSelectedEmp(emp); setShowDocsModal(true); };
  const openAttach = (emp) => { setSelectedEmp(emp); setShowAttachModal(true); };

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.employeeId || '').includes(search) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  // Derive alerts from already-fetched employee list
  const employeeAlerts = (() => {
    if (!employees.length) return [];
    const alerts = [];
    const docsAwaitingReview = employees.filter(e => e.employeeType && e.documentCompletion?.pending > 0);
    const noSalary = employees.filter(e => !e.basicSalary || e.basicSalary === 0);
    const noDept = employees.filter(e => !e.department);
    const noDesignation = employees.filter(e => !e.designation);
    if (docsAwaitingReview.length > 0)
      alerts.push({ level: 'warning', message: `${docsAwaitingReview.length} employee${docsAwaitingReview.length > 1 ? 's have' : ' has'} documents uploaded and awaiting your review. Click "Review Docs" to approve.` });
    if (noSalary.length > 0)
      alerts.push({ level: 'warning', message: `${noSalary.length} employee${noSalary.length > 1 ? 's have' : ' has'} no salary set — payslip generation will be incomplete.` });
    if (noDept.length > 0)
      alerts.push({ level: 'info', message: `${noDept.length} employee${noDept.length > 1 ? 's are' : ' is'} not assigned to any department.` });
    if (noDesignation.length > 0)
      alerts.push({ level: 'info', message: `${noDesignation.length} employee${noDesignation.length > 1 ? 's have' : ' has'} no designation set. Update their profile for accurate records.` });
    return alerts;
  })();

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      {/* ── Intelligence Alerts ── */}
      <IntelligenceAlerts alerts={employeeAlerts} />

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-violet-900">Employee Management</h2>
          <p className="text-sm text-violet-500 mt-0.5">{employees.length} total employees</p>
        </div>
        <button onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors self-start sm:self-auto shadow-sm">
          <Ico d="M12 4v16m8-8H4" className="w-4 h-4" /> Add Employee
        </button>
      </div>

      {/* ── Search bar ── */}
      <div className="bg-white border border-violet-100 rounded-2xl shadow-sm px-4 py-3">
        <div className="relative max-w-sm">
          <Ico d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-violet-400 pointer-events-none" />
          <input
            className="w-full pl-9 pr-4 py-2 border border-violet-200 rounded-xl text-sm bg-violet-50/40 focus:outline-none focus:ring-2 focus:ring-violet-400"
            placeholder="Search by name, ID or email…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 ? (
        <div className="bg-white border border-violet-100 rounded-2xl shadow-sm py-16 flex flex-col items-center gap-3 text-violet-300">
          <Ico d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" className="w-12 h-12" />
          <p className="text-violet-500 font-semibold">No employees found</p>
          <button onClick={() => setShowAddModal(true)} className="text-sm text-violet-600 hover:text-violet-800 font-semibold underline underline-offset-2">Add first employee →</button>
        </div>
      ) : (
        <>
          {/* ── Mobile: Card list (hidden sm+) ── */}
          <div className="sm:hidden space-y-3">
            {filtered.map(emp => (
              <div key={emp._id} className="bg-white border border-violet-100 rounded-2xl shadow-sm p-4 space-y-3">
                {/* Avatar + info */}
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-xl bg-violet-200 text-violet-800 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {getInitials(emp.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-violet-900 truncate">{emp.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <Chip label={emp.role} colorCls={ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'} />
                      {emp.department?.name && (
                        <span className="text-[11px] text-violet-600 font-medium">{emp.department.name}</span>
                      )}
                    </div>
                    <p className="text-xs text-violet-400 truncate mt-0.5">{emp.employeeId} · {emp.email}</p>
                    {emp.employeeType && (
                      <div className="mt-1"><Chip label={emp.employeeType} colorCls={TYPE_COLORS[emp.employeeType] || 'bg-gray-100 text-gray-600'} /></div>
                    )}
                  </div>
                </div>
                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Department',   value: emp.department?.name || '—' },
                    { label: 'Designation',  value: emp.designation || '—' },
                    { label: 'Salary',       value: emp.basicSalary > 0 ? formatCurrency(emp.basicSalary) : '—' },
                    { label: 'Joined',       value: formatDate(emp.joiningDate) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-violet-50 rounded-xl px-3 py-2">
                      <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wide">{label}</p>
                      <p className="text-xs font-semibold text-violet-800 truncate mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
                {/* Action buttons */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-violet-50">
                  <button onClick={() => sendOffer(emp)}
                    className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Offer</button>
                  <button onClick={() => sendCreds(emp)}
                    className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Creds</button>
                  <button onClick={() => openEdit(emp)}
                    className="col-span-1 text-xs py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 font-semibold transition-colors">Edit</button>
                  <button onClick={() => openAttach(emp)}
                    className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Attach</button>
                  {emp.employeeType && (
                    <button onClick={() => openDocs(emp)}
                      className="col-span-1 text-xs py-2 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors">Review Docs</button>
                  )}
                  <button onClick={() => handleDelete(emp)}
                    className={`${emp.employeeType ? 'col-span-1' : 'col-span-2'} text-xs py-2 rounded-xl bg-gray-100 text-gray-900 hover:bg-gray-100 font-semibold transition-colors`}>Delete</button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop: Table (hidden below sm) ── */}
          <div className="hidden sm:block bg-white border border-violet-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-violet-100 bg-violet-50/70">
                    {['Employee', 'Department', 'Role / Type', 'Joining', 'Salary', 'Actions'].map(h => (
                      <th key={h} className="text-left text-[11px] font-bold text-violet-500 uppercase tracking-wide px-4 py-3 whitespace-nowrap first:rounded-tl-2xl last:rounded-tr-2xl">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-violet-50">
                  {filtered.map(emp => (
                    <tr key={emp._id} className="hover:bg-violet-50/40 transition-colors">
                      {/* Employee */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-violet-200 text-violet-800 font-bold text-sm flex items-center justify-center flex-shrink-0">
                            {getInitials(emp.name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-violet-900 truncate max-w-[160px]">{emp.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <Chip label={emp.role} colorCls={ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'} />
                              {emp.department?.name && (
                                <span className="text-[11px] text-violet-500 font-medium truncate max-w-[100px]">{emp.department.name}</span>
                              )}
                            </div>
                            <p className="text-[10px] text-violet-400 truncate max-w-[160px] mt-0.5">{emp.employeeId} · {emp.email}</p>
                          </div>
                        </div>
                      </td>
                      {/* Department */}
                      <td className="px-4 py-3 text-sm text-violet-700 whitespace-nowrap">
                        {emp.department?.name || <span className="text-violet-300">—</span>}
                      </td>
                      {/* Role / Type */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          <Chip label={emp.role} colorCls={ROLE_COLORS[emp.role] || 'bg-gray-100 text-gray-600'} />
                          {emp.employeeType && <Chip label={emp.employeeType} colorCls={TYPE_COLORS[emp.employeeType] || 'bg-gray-100 text-gray-600'} />}
                        </div>
                      </td>
                      {/* Joining */}
                      <td className="px-4 py-3 text-sm text-violet-600 whitespace-nowrap">{formatDate(emp.joiningDate)}</td>
                      {/* Salary */}
                      <td className="px-4 py-3 text-sm font-semibold text-violet-800 whitespace-nowrap">
                        {emp.basicSalary > 0 ? formatCurrency(emp.basicSalary) : <span className="text-violet-300 font-normal">—</span>}
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => sendOffer(emp)} title="Send offer letter"
                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors">
                            <Ico d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </button>
                          <button onClick={() => sendCreds(emp)} title="Send credentials"
                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-100 transition-colors">
                            <Ico d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </button>
                          {emp.employeeType && (
                            <button onClick={() => openDocs(emp)} title="Review documents"
                              className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors">
                              <Ico d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </button>
                          )}
                          <button onClick={() => openAttach(emp)} title="Attach joining letter / ID card"
                            className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors">
                            <Ico d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                          </button>
                          <button onClick={() => openEdit(emp)} title="Edit employee"
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 transition-colors">
                            <Ico d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </button>
                          <button onClick={() => handleDelete(emp)} title="Delete employee"
                            className="p-1.5 rounded-lg text-gray-900 hover:bg-gray-100 transition-colors">
                            <Ico d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Add Employee Modal ── */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Add New Employee" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Employee ID *" required placeholder="e.g. EMP0001" value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} />
            <Field label="Full Name *"   required placeholder="Full name"      value={form.name}       onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Field label="Email *"       required placeholder="Email"          value={form.email}      onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField label="Role *" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="employee">Employee</option>
              <option value="sales">Sales Employee</option>
              <option value="field_sales">Field Sales Executive</option>
              <option value="hr">HR</option>
            </SelectField>
            <SelectField label="Department" value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))}>
              <option value="">Select department</option>
              {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
            </SelectField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Designation" placeholder="Job title"     value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
            <Field label="Phone"       placeholder="Phone number"  value={form.phone}       onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Joining Date" type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} />
            <Field label="Basic Salary (₹)" type="number" placeholder="Monthly basic" value={form.basicSalary} onChange={e => setForm(f => ({ ...f, basicSalary: e.target.value }))} />
          </div>
          <div>
            <SelectField label="Employee Type (onboarding)" value={form.employeeType} onChange={e => setForm(f => ({ ...f, employeeType: e.target.value }))}>
              <option value="">None — skip document onboarding</option>
              <option value="fresher">Fresher</option>
              <option value="experienced">Experienced</option>
            </SelectField>
            {form.employeeType && (
              <p className="mt-1.5 text-xs text-violet-500 flex items-start gap-1">
                <span className="text-violet-400">ℹ</span>
                Required documents auto-created. Employee must upload &amp; get approved before downloading payslips.
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
              {loading ? 'Creating…' : 'Create Employee'}
            </button>
            <button type="button" onClick={() => setShowAddModal(false)}
              className="flex-1 py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-sm font-semibold transition-colors">
              Cancel
            </button>
          </div>
          <p className="text-xs text-center text-violet-400">A temporary password is generated. Use "Send Creds" to email login details.</p>
        </form>
      </Modal>

      {/* ── Edit Modal ── */}
      {selectedEmp && (
        <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title={`Edit — ${selectedEmp.name}`} size="lg">
          <EditForm emp={selectedEmp} departments={departments} onDone={() => { setShowEditModal(false); fetchAll(); }} />
        </Modal>
      )}

      {/* ── Documents Modal ── */}
      {selectedEmp && (
        <Modal isOpen={showDocsModal} onClose={() => setShowDocsModal(false)} title={`Documents — ${selectedEmp.name}`} size="lg">
          <DocumentReviewPanel emp={selectedEmp} />
        </Modal>
      )}

      {/* ── Attach Joining Letter / ID Card Modal ── */}
      {selectedEmp && (
        <Modal isOpen={showAttachModal} onClose={() => setShowAttachModal(false)} title={`Attach Docs — ${selectedEmp.name}`} size="md">
          <AttachDocsPanel emp={selectedEmp} onDone={() => { setShowAttachModal(false); fetchAll(); }} />
        </Modal>
      )}
    </div>
  );
}

/* ── Shared form primitives ── */
function Field({ label, className = '', ...props }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-violet-700 mb-1">{label}</label>
      <input className={`w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400 ${className}`} {...props} />
    </div>
  );
}
function SelectField({ label, children, ...props }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-violet-700 mb-1">{label}</label>
      <select className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" {...props}>
        {children}
      </select>
    </div>
  );
}

/* ── Edit form ── */
function EditForm({ emp, departments, onDone }) {
  const [form, setForm] = useState({
    name: emp.name,
    designation: emp.designation || '',
    phone: emp.phone || '',
    department: emp.department?._id || '',
    joiningDate: emp.joiningDate ? new Date(emp.joiningDate).toISOString().split('T')[0] : '',
    basicSalary: emp.basicSalary || 0,
    role: emp.role,
  });
  const [loading, setLoading] = useState(false);
  const f = key => e => setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    setLoading(true);
    try { await api.put(`/employees/${emp._id}`, form); toast.success('Employee updated!'); onDone(); }
    catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name"        value={form.name}        onChange={f('name')} />
        <Field label="Designation" value={form.designation} onChange={f('designation')} placeholder="Job title" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Phone"       value={form.phone}       onChange={f('phone')} placeholder="Phone number" />
        <SelectField label="Department" value={form.department} onChange={f('department')}>
          <option value="">None</option>
          {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
        </SelectField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Joining Date"    type="date"   value={form.joiningDate} onChange={f('joiningDate')} />
        <Field label="Basic Salary (₹)" type="number" value={form.basicSalary} onChange={e => setForm(p => ({ ...p, basicSalary: parseFloat(e.target.value) || 0 }))} />
      </div>
      <SelectField label="Role" value={form.role} onChange={f('role')}>
        <option value="employee">Employee</option>
        <option value="sales">Sales</option>
        <option value="field_sales">Field Sales Executive</option>
        <option value="hr">HR</option>
      </SelectField>
      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <button onClick={handleSave} disabled={loading}
          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
          {loading ? 'Saving…' : 'Save Changes'}
        </button>
        <button onClick={onDone}
          className="flex-1 py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-sm font-semibold transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Attach joining letter / ID card panel ── */
function AttachDocsPanel({ emp, onDone }) {
  const [files, setFiles] = useState({ joiningLetter: null, idCard: null });
  const [loading, setLoading] = useState(false);
  const refs = { joiningLetter: useRef(null), idCard: useRef(null) };

  const handleSubmit = async () => {
    if (!files.joiningLetter && !files.idCard) return toast.error('Select at least one file to upload');
    setLoading(true);
    try {
      const fd = new FormData();
      if (files.joiningLetter) fd.append('joiningLetter', files.joiningLetter);
      if (files.idCard) fd.append('idCard', files.idCard);
      await api.post(`/employees/${emp._id}/attach-docs`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Documents attached successfully!');
      onDone();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally { setLoading(false); }
  };

  const rows = [
    { key: 'joiningLetter', label: 'Joining Letter', existing: emp.joiningLetter, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'idCard',        label: 'ID Card',        existing: emp.idCard,        accept: '.pdf,.jpg,.jpeg,.png' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-violet-500">Upload joining letter and/or ID card. Once attached, the employee can download them when their profile is 100% complete.</p>
      {rows.map(({ key, label, existing, accept }) => (
        <div key={key} className="border border-violet-100 rounded-xl p-3 bg-violet-50/40">
          <p className="text-sm font-semibold text-violet-900 mb-1">{label}</p>
          {existing && (
            <p className="text-[11px] text-violet-600 font-medium mb-2 flex items-center gap-1">
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M9 12l2 2 4-4" /><circle cx={12} cy={12} r={10} /></svg>
              Already attached — uploading will replace it
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input type="file" accept={accept} className="hidden" ref={refs[key]}
              onChange={e => setFiles(f => ({ ...f, [key]: e.target.files[0] || null }))} />
            <button onClick={() => refs[key].current?.click()}
              className="text-xs px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 font-semibold transition-colors">
              {files[key] ? 'Change file' : 'Choose file'}
            </button>
            {files[key] && (
              <span className="text-xs text-violet-600 font-medium truncate max-w-[180px]">{files[key].name}</span>
            )}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSubmit} disabled={loading}
          className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors">
          {loading ? 'Uploading…' : 'Save Documents'}
        </button>
        <button onClick={onDone}
          className="flex-1 py-2.5 border border-violet-200 text-violet-700 hover:bg-violet-50 rounded-xl text-sm font-semibold transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Document review panel ── */
function DocumentReviewPanel({ emp }) {
  const [data, setData]             = useState(null);
  const [reviewing, setReviewing]   = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(null);

  const load = () => api.get(`/documents/employee/${emp._id}`).then(r => setData(r.data)).catch(() => toast.error('Failed to load documents'));
  useEffect(() => { load(); }, [emp._id]);

  // Build a robust URL for document files so "View" works in dev (vite proxy) and prod.
  const buildFileUrl = (filePath) => {
    if (!filePath) return filePath;
    // if already absolute URL
    if (/^https?:\/\//i.test(filePath)) return filePath;
    const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;
    // If VITE_API_URL is set, use its origin
    try {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl) {
        const u = new URL(apiUrl);
        return `${u.origin}${normalized}`;
      }
    } catch (e) { /* ignore */ }
    // Dev: if running on localhost and backend on port 5000, point to that
    if (window.location.hostname === 'localhost' && window.location.port && window.location.port !== '5000') {
      return `${window.location.protocol}//${window.location.hostname}:5000${normalized}`;
    }
    // Default: same origin
    return `${window.location.origin}${normalized}`;
  };

  const handleReview = async (docId, status) => {
    setReviewing(docId);
    try {
      await api.patch(`/documents/${docId}/review`, { status, rejectionReason: status === 'rejected' ? rejectReason : '' });
      toast.success(`Document ${status}!`);
      setShowReject(null); setRejectReason('');
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
    finally { setReviewing(null); }
  };

  if (!data) return <div className="text-center py-10 text-sm text-violet-400">Loading…</div>;
  if (!data.employeeType) return <div className="text-center py-8 text-sm text-violet-400">No onboarding type set for this employee.</div>;

  const approved = data.docs.filter(d => d.status === 'approved').length;
  const total    = data.docs.length;
  const pct      = total > 0 ? Math.round((approved / total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress header */}
      <div className="flex items-center justify-between gap-3 bg-violet-50 rounded-xl p-3">
        <div>
          <p className="text-xs font-bold text-violet-700 capitalize">{data.employeeType}</p>
          <p className="text-xs text-violet-500 mt-0.5">{approved} of {total} documents approved</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-24 bg-violet-200 rounded-full h-2">
            <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-bold text-violet-600">{pct}%</span>
        </div>
      </div>

      {/* Doc list */}
      <div className="space-y-2">
        {data.docs.map((doc, i) => (
          <div key={doc._id || i} className="border border-violet-100 rounded-xl p-3 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-violet-900">{doc.docType}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${DOC_STATUS[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                    {DOC_LABEL[doc.status] || doc.status}
                  </span>
                  {doc.uploadedAt && (
                    <span className="text-[11px] text-violet-400">{new Date(doc.uploadedAt).toLocaleDateString('en-IN')}</span>
                  )}
                </div>
                {doc.status === 'rejected' && doc.rejectionReason && (
                  <p className="text-xs text-gray-900 mt-1">Reason: {doc.rejectionReason}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
                {doc.filePath && (
                  <a
                    href={buildFileUrl(doc.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 text-xs rounded-lg bg-violet-50 text-violet-700 hover:bg-violet-100 font-semibold transition-colors"
                  >
                    View
                  </a>
                )}
                {doc._id && doc.status === 'uploaded' && (
                  <>
                    <button onClick={() => handleReview(doc._id, 'approved')} disabled={reviewing === doc._id}
                      className="px-2.5 py-1 text-xs rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 font-semibold disabled:opacity-50">
                      {reviewing === doc._id ? '…' : 'Approve'}
                    </button>
                    {showReject === doc._id ? (
                      <div className="flex items-center gap-1">
                        <input className="border border-violet-200 rounded-lg px-2 py-1 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-violet-300"
                          placeholder="Reason…" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
                        <button onClick={() => handleReview(doc._id, 'rejected')} className="px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-200 font-semibold">OK</button>
                        <button onClick={() => setShowReject(null)} className="text-violet-400 hover:text-violet-600 text-xs px-1">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => { setShowReject(doc._id); setRejectReason(''); }}
                        className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-100 font-semibold">Reject</button>
                    )}
                  </>
                )}
                {doc._id && doc.status === 'approved' && (
                  <button onClick={() => handleReview(doc._id, 'rejected')} disabled={reviewing === doc._id}
                    className="px-2.5 py-1 text-xs rounded-lg bg-gray-100 text-gray-900 hover:bg-gray-100 font-semibold disabled:opacity-50">Revoke</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
