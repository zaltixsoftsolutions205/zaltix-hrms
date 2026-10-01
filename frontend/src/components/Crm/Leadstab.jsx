import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { KpiCard } from '../UI/Card';
import IntelligenceAlerts from '../UI/IntelligenceAlerts';
import LeadTable from './Leadtable';
import LeadDrawer from './LeadDrawer';
import CustomFieldCreateModal from './CustomFields/CustomFieldCreateModal';
import { getLeads } from '../../services/Leadservice';
import { getLeadCustomFields, getLeadCustomFieldValues } from '../../services/Leadcustomfieldservice';
import { getAssignableUsers } from '../../services/Userservice';

const SI = ({ d, size = 14, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />
  </svg>
);

const LeadsTab = ({ pipelineStage }) => {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({});
  const [customFields, setCustomFields] = useState([]);
  const [valuesByLead, setValuesByLead] = useState({});
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showInlineRow, setShowInlineRow] = useState(false);
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [openLeadId, setOpenLeadId] = useState(null);

  const userLookup = useMemo(() => Object.fromEntries(users.map((u) => [u._id, u])), [users]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [leadsRes, fields, userList] = await Promise.all([
        getLeads({
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(pipelineStage ? { pipelineStage } : {}),
        }),
        getLeadCustomFields(),
        getAssignableUsers().catch(() => []),
      ]);
      const leadList = leadsRes.leads || leadsRes;
      setLeads(leadList);
      setStats(leadsRes.stats || {});
      setCustomFields(fields || []);
      setUsers(userList || []);

      const valuePairs = await Promise.all(
        leadList.map((l) =>
          getLeadCustomFieldValues(l._id).then((vals) => [l._id, vals]).catch(() => [l._id, []])
        )
      );
      const map = {};
      valuePairs.forEach(([leadId, vals]) => {
        map[leadId] = Object.fromEntries((vals || []).map((v) => [v.field._id, v.value]));
      });
      setValuesByLead(map);
    } catch (err) {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [statusFilter , pipelineStage]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshFieldsOnly = async () => {
    const fields = await getLeadCustomFields();
    setCustomFields(fields || []);
  };

  const handleLeadUpdated = (updatedLead) => {
    setLeads((prev) => prev.map((l) => (l._id === updatedLead._id ? { ...l, ...updatedLead } : l)));
  };

  const handleValueChanged = (leadId, fieldId, value) => {
    setValuesByLead((prev) => ({
      ...prev,
      [leadId]: { ...(prev[leadId] || {}), [fieldId]: value },
    }));
  };

  const handleLeadDeleted = (leadId) => {
    setLeads((prev) => prev.filter((l) => l._id !== leadId));
    setValuesByLead((prev) => {
      const { [leadId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  // ⋮ → Edit field on a custom-field header opens this modal pre-populated.
  const handleEditField = (field) => {
    setEditingField(field);
    setShowFieldModal(true);
  };

  // Also clears editingField so the "+" add-field button reliably opens a
  // blank Create form even right after closing an Edit.
  const closeFieldModal = () => {
    setShowFieldModal(false);
    setEditingField(null);
  };

  const alerts = useMemo(() => {
    if (!leads.length) return [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const active = leads.filter((l) => !['converted', 'not-interested'].includes(l.status));
    const stale = active.filter((l) => new Date(l.updatedAt) < sevenDaysAgo);
    const overdueFollowUp = active.filter((l) => l.followUpDate && new Date(l.followUpDate) < now);
    const agingNew = active.filter((l) => l.status === 'new' && new Date(l.createdAt) < new Date(now.getTime() - 14 * 86400000));
    const out = [];
    if (stale.length) out.push({ level: 'warning', message: `${stale.length} lead${stale.length > 1 ? 's have' : ' has'} had no activity for 7+ days. Follow up to keep your CRM score up.`, link: '/crm' });
    if (overdueFollowUp.length) out.push({ level: 'error', message: `${overdueFollowUp.length} overdue follow-up${overdueFollowUp.length > 1 ? 's' : ''}. Schedule a call or update the follow-up date.`, link: '/crm' });
    if (agingNew.length) out.push({ level: 'info', message: `${agingNew.length} lead${agingNew.length > 1 ? 's' : ''} still in "New" status for 14+ days. Qualify or mark as not interested.` });
    return out;
  }, [leads]);

  return (
    <div className="space-y-4">
      <IntelligenceAlerts alerts={alerts} />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="Total" value={stats.total ?? '—'} icon={<SI d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" color="text-violet-600" />} color="violet" />
        <KpiCard label="New" value={stats.new ?? '—'} icon={<SI d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" color="text-violet-600" />} color="violet" />
        <KpiCard label="Interested" value={stats.interested ?? '—'} icon={<SI d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" color="text-amber-500" />} color="golden" />
        <KpiCard label="Converted" value={stats.converted ?? '—'} icon={<SI d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" color="text-violet-600" />} color="green" />
        <KpiCard label="Not Interested" value={stats.notInterested ?? '—'} icon={<SI d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" color="text-gray-900" />} color="red" />
        <KpiCard label="Conversion %" value={stats.conversionRate !== undefined ? `${stats.conversionRate}%` : '—'} icon={<SI d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" color="text-amber-500" />} color="golden" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-violet-900">Lead Pipeline</h3>
        <div className="filter-bar">
          {['', 'new', 'interested', 'not-interested', 'converted'].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={statusFilter === s ? 'filter-pill-active' : 'filter-pill-inactive'}>
              {s === '' ? 'All' : s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </button>
          ))}
          <button onClick={() => setShowCreateDrawer(true)} className="btn-primary btn-sm">+ Create Lead</button>
        </div>
      </div>

      <LeadTable
        leads={leads}
        customFields={customFields}
        valuesByLead={valuesByLead}
        userLookup={userLookup}
        loading={loading}
        showInlineRow={showInlineRow}
        onOpenLead={(lead) => setOpenLeadId(lead._id)}
        onOpenAddField={() => setShowFieldModal(true)}
        onStartInlineCreate={() => setShowInlineRow(true)}
        onOpenCreateDrawer={() => setShowCreateDrawer(true)}
        onInlineCreated={() => { setShowInlineRow(false); loadAll(); }}
        onInlineCancel={() => setShowInlineRow(false)}
        onFieldsChanged={refreshFieldsOnly}
        onValueChanged={handleValueChanged}
        onLeadUpdated={handleLeadUpdated}
        onLeadDeleted={handleLeadDeleted}
        onEditField={handleEditField}
      />

      <LeadDrawer
        mode="edit"
        leadId={openLeadId}
        isOpen={Boolean(openLeadId)}
        onClose={() => setOpenLeadId(null)}
        customFields={customFields}
        onSaved={loadAll}
      />

      <LeadDrawer
        mode="create"
        isOpen={showCreateDrawer}
        onClose={() => setShowCreateDrawer(false)}
        customFields={customFields}
        onSaved={() => { setShowCreateDrawer(false); loadAll(); }}
      />

      <CustomFieldCreateModal
        isOpen={showFieldModal}
        onClose={closeFieldModal}
        editingField={editingField}
        onSaved={refreshFieldsOnly}
      />
    </div>
  );
};

export default LeadsTab;