import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import Modal from '../../components/UI/Modal';

// Admin/HR/department-head project management — create, rename, reassign
// department, deactivate/reactivate. Separate from the Timesheet module since
// managing the project taxonomy is an org-settings concern, not a timesheet
// view. (Employees still pick from this same list via the inline quick-add in
// the Timesheet "+ Add Task" form.)
const ProjectsAdmin = () => {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', department: '', description: '' });
  const [editingId, setEditingId] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);
  const [assignTarget, setAssignTarget] = useState(null); // project being assigned
  const [assignableEmployees, setAssignableEmployees] = useState([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [assigning, setAssigning] = useState(false);

  const isDeptHead = user?.department?.headOf && String(user.department.headOf) === String(user?._id || user?.id);
  const canCreate = ['admin', 'hr'].includes(user?.role) || isDeptHead;

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const res = await api.get('/timesheet-projects', { params: showInactive ? { includeInactive: true } : {} });
      setProjects(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };
  useEffect(() => { fetchProjects(); }, [showInactive]);

  useEffect(() => {
    if (['admin', 'hr'].includes(user?.role)) {
      api.get('/admin/departments').then(res => setDepartments(res.data)).catch(() => {});
    }
  }, [user]);

  const resetForm = () => {
    setForm({ name: '', department: isDeptHead && !['admin', 'hr'].includes(user?.role) ? user.department._id || user.department : '', description: '' });
    setEditingId(null);
  };

  const openNew = () => { resetForm(); setShowForm(true); };
  const openEdit = (p) => {
    setForm({ name: p.name, department: p.department?._id || '', description: p.description || '' });
    setEditingId(p._id);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Name is required');
    setSubmitting(true);
    try {
      const payload = { name: form.name.trim(), description: form.description.trim(), department: form.department || null };
      if (editingId) {
        await api.put(`/timesheet-projects/${editingId}`, payload);
        toast.success('Project updated');
      } else {
        await api.post('/timesheet-projects', payload);
        toast.success('Project added');
      }
      setShowForm(false);
      resetForm();
      fetchProjects();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save project');
    } finally {
      setSubmitting(false);
    }
  };

  const openAssign = async (project) => {
    setAssignTarget(project);
    setSelectedEmployeeIds((project.assignedEmployees || []).map(e => e._id));
    try {
      const res = await api.get('/timesheet-projects/assignable-employees');
      setAssignableEmployees(res.data);
    } catch {
      toast.error('Failed to load employees');
    }
  };

  const toggleEmployee = (id) => {
    setSelectedEmployeeIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
  };

  const saveAssignment = async () => {
    setAssigning(true);
    try {
      await api.put(`/timesheet-projects/${assignTarget._id}/assign`, { employeeIds: selectedEmployeeIds });
      toast.success('Assignment saved');
      setAssignTarget(null);
      fetchProjects();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save assignment');
    } finally {
      setAssigning(false);
    }
  };

  const handleDeactivate = async (id) => {
    if (!window.confirm('Deactivate this project? It will no longer appear for new task entries.')) return;
    try {
      await api.put(`/timesheet-projects/${id}/deactivate`);
      toast.success('Project deactivated');
      fetchProjects();
    } catch {
      toast.error('Failed to deactivate');
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const deptByName = new Map(departments.map(d => [d.name.toLowerCase().trim(), d._id]));
      let created = 0, failed = 0;
      for (const row of rows) {
        const name = String(row.name || row.Name || '').trim();
        if (!name) continue;
        const deptName = String(row.department || row.Department || '').trim();
        const description = String(row.description || row.Description || '').trim();
        const department = deptName ? deptByName.get(deptName.toLowerCase()) || null : null;
        try {
          await api.post('/timesheet-projects', { name, description, department });
          created += 1;
        } catch {
          failed += 1;
        }
      }
      toast.success(`Imported ${created} project${created === 1 ? '' : 's'}${failed ? `, ${failed} failed` : ''}`);
      fetchProjects();
    } catch {
      toast.error('Failed to read file — expecting columns: name, department, description');
    } finally {
      setImporting(false);
    }
  };

  const filteredProjects = projects.filter(p => {
    if (filterDept && (p.department?._id || '') !== filterDept) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="page-title">Projects</h2>
          <p className="page-subtitle">Manage the project list employees pick from in Timesheet</p>
          {canCreate && <p className="text-[11px] text-violet-300 mt-0.5">Import CSV columns: name, department, description</p>}
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-1.5 text-xs text-violet-500">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {canCreate && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImportFile} />
              <button onClick={() => fileInputRef.current?.click()} disabled={importing} className="btn-secondary btn-sm">
                {importing ? 'Importing...' : 'Import CSV'}
              </button>
              <button onClick={() => { setShowForm(v => !v); if (!showForm) resetForm(); }} className="btn-primary btn-sm">
                {showForm ? 'Cancel' : '+ Add Project'}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input className="input-field flex-1 min-w-[180px]" placeholder="Search projects..." value={search}
          onChange={e => setSearch(e.target.value)} />
        <select className="input-field w-auto" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
      </div>

      {canCreate && showForm && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-4">
          <h3 className="font-bold text-violet-900 mb-4">{editingId ? 'Edit Project' : 'Add Project'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="input-label">Name *</label>
                <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="input-label">Department</label>
                <select className="input-field" value={form.department}
                  disabled={!['admin', 'hr'].includes(user?.role)}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  <option value="">No department (org-wide)</option>
                  {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                  {!['admin', 'hr'].includes(user?.role) && user?.department && (
                    <option value={user.department._id || user.department}>{user.department.name || 'My Department'}</option>
                  )}
                </select>
              </div>
            </div>
            <div>
              <label className="input-label">Description</label>
              <textarea className="input-field" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary btn-sm">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary btn-sm">
                {submitting ? 'Saving...' : editingId ? 'Save Changes' : 'Add Project'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {loading ? (
        <p className="text-center text-sm text-violet-400 py-8">Loading...</p>
      ) : projects.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-violet-400 text-sm">No projects yet.</p>
          {canCreate && <button onClick={openNew} className="btn-primary btn-sm mt-3">Add First Project</button>}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-violet-400 text-sm">No projects match your search/filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredProjects.map(p => (
            <motion.div key={p._id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`flex items-center gap-3 p-3 rounded-xl border bg-white border-gray-100 shadow-sm ${!p.isActive ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-violet-900 truncate">{p.name}</p>
                  {!p.isActive && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-500">Inactive</span>}
                </div>
                <p className="text-xs text-gray-400">{p.department?.name || 'Org-wide'}{p.description ? ` · ${p.description}` : ''}</p>
                {p.assignedEmployees?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {p.assignedEmployees.map(e => (
                      <span key={e._id} className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-violet-50 text-violet-700">{e.name}</span>
                    ))}
                  </div>
                )}
              </div>
              {canCreate && p.isActive && (
                <div className="flex gap-3 flex-shrink-0">
                  <button onClick={() => openAssign(p)} className="text-xs font-semibold text-violet-600 hover:underline">Assign</button>
                  <button onClick={() => openEdit(p)} className="text-xs font-semibold text-violet-600 hover:underline">Edit</button>
                  <button onClick={() => handleDeactivate(p._id)} className="text-xs font-semibold text-gray-400 hover:text-gray-900">Deactivate</button>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <Modal isOpen={!!assignTarget} onClose={() => setAssignTarget(null)} title={`Assign Employees — ${assignTarget?.name || ''}`}>
        <div className="space-y-3">
          <p className="text-xs text-violet-400">
            This is an informational "who's on this project" list — it doesn't restrict who can log time against it.
          </p>
          {assignableEmployees.length === 0 ? (
            <p className="text-sm text-violet-400">No employees found.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto space-y-1">
              {assignableEmployees.map(e => (
                <label key={e._id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-violet-50 cursor-pointer text-sm">
                  <input type="checkbox" checked={selectedEmployeeIds.includes(e._id)} onChange={() => toggleEmployee(e._id)} />
                  <span className="text-violet-900">{e.name}</span>
                  <span className="text-xs text-gray-400">{e.employeeId}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button onClick={saveAssignment} disabled={assigning} className="btn-primary flex-1">
              {assigning ? 'Saving...' : 'Save Assignment'}
            </button>
            <button onClick={() => setAssignTarget(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProjectsAdmin;
