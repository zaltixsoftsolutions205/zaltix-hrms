import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import Card, { KpiCard } from '../../components/UI/Card';
import Modal from '../../components/UI/Modal';
import Badge from '../../components/UI/Badge';
import EmptyState from '../../components/UI/EmptyState';
import { formatDate, formatDateTime, formatCurrency } from '../../utils/helpers';
import { SERVICE_TYPE_MAP } from '../../constants/serviceTypes';
import IntelligenceAlerts from '../../components/UI/IntelligenceAlerts';
import QuotationsTab from './QuotationsTab';
import PurchaseOrdersTab from './PurchaseOrdersTab';
import ProductsTab from './ProductsTab';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

const statusColors = { new: '+', interested: '*', 'not-interested': 'x', converted: 'v' };

const CRMPage = () => {
  const [activeTab, setActiveTab] = useState('products');
  const [leadsData, setLeadsData] = useState({ leads: [], stats: {} });
  const [dealsData, setDealsData] = useState({ deals: [], stats: {} });
  const [clientsData, setClientsData] = useState({ clients: [], stats: {} });

  // Leads
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [showLeadDetailModal, setShowLeadDetailModal] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: '', phone: '', email: '', source: 'other', notes: '' });
  const [activityForm, setActivityForm] = useState({ type: 'call', note: '' });
  const [leadStatusFilter, setLeadStatusFilter] = useState('');

  // Deals
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [showDealDetailModal, setShowDealDetailModal] = useState(false);
  const [dealForm, setDealForm] = useState({ leadId: '', serviceType: '', quotedAmount: 0, finalDealAmount: 0, probability: 0, expectedCloseDate: '', notes: '' });
  const [dealStatusFilter, setDealStatusFilter] = useState('');

  // Clients
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientDetailModal, setShowClientDetailModal] = useState(false);
  const [clientForm, setClientForm] = useState({ company: '', notes: '', tags: [] });

  const [loading, setLoading] = useState(false);

  // ============ FETCH DATA ============
  const fetchLeads = async () => {
    try {
      const res = await api.get(`/leads${leadStatusFilter ? `?status=${leadStatusFilter}` : ''}`);
      setLeadsData(res.data);
    } catch (err) { console.error(err); }
  };

  const fetchDeals = async () => {
    try {
      const res = await api.get(`/deals${dealStatusFilter ? `?status=${dealStatusFilter}` : ''}`);
      setDealsData(prev => ({ ...prev, deals: res.data }));
      const statsRes = await api.get('/deals/stats');
      setDealsData(prev => ({ ...prev, stats: statsRes.data }));
    } catch (err) { console.error(err); }
  };

  const fetchClients = async () => {
    try {
      const res = await api.get('/clients');
      setClientsData(prev => ({ ...prev, clients: res.data }));
      const statsRes = await api.get('/clients/stats');
      setClientsData(prev => ({ ...prev, stats: statsRes.data }));
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchLeads(); }, [leadStatusFilter]);
  useEffect(() => { fetchDeals(); }, [dealStatusFilter]);
  useEffect(() => { fetchClients(); }, [activeTab]);

  // ============ LEADS HANDLERS ============
  const handleAddLead = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/leads', leadForm);
      toast.success('Lead added!');
      setShowAddLeadModal(false);
      setLeadForm({ name: '', phone: '', email: '', source: 'other', notes: '' });
      fetchLeads();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to add lead'); }
    finally { setLoading(false); }
  };

  const handleLeadStatusChange = async (leadId, status) => {
    try {
      const res = await api.put(`/leads/${leadId}/status`, { status });
      setLeadsData(d => ({ ...d, leads: d.leads.map(l => l._id === leadId ? res.data : l) }));
      if (selectedLead?._id === leadId) setSelectedLead(res.data);
      toast.success('Status updated!');
      fetchLeads();
    } catch (err) { toast.error('Update failed'); }
  };

  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (!activityForm.note.trim()) return toast.error('Please enter a note');
    try {
      const res = await api.post(`/leads/${selectedLead._id}/activity`, activityForm);
      setSelectedLead(res.data);
      setActivityForm({ type: 'call', note: '' });
      toast.success('Activity logged!');
    } catch { toast.error('Failed to log activity'); }
  };

  const openLead = async (lead) => {
    try {
      const res = await api.get(`/leads/${lead._id}`);
      setSelectedLead(res.data);
      setShowLeadDetailModal(true);
    } catch { toast.error('Failed to load lead details'); }
  };

  // ============ DEALS HANDLERS ============
  const handleAddDeal = async (e) => {
    e.preventDefault();
    if (!dealForm.leadId) return toast.error('Please select a lead');
    setLoading(true);
    try {
      await api.post('/deals', dealForm);
      toast.success('Deal created!');
      setShowAddDealModal(false);
      setDealForm({ leadId: '', serviceType: '', quotedAmount: 0, finalDealAmount: 0, probability: 0, expectedCloseDate: '', notes: '' });
      fetchDeals();
      fetchLeads();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create deal'); }
    finally { setLoading(false); }
  };

  const handleDealStatusChange = async (dealId, status) => {
    try {
      const res = await api.put(`/deals/${dealId}/close`, { status });
      setDealsData(d => ({ ...d, deals: d.deals.map(dl => dl._id === dealId ? res.data : dl) }));
      if (selectedDeal?._id === dealId) setSelectedDeal(res.data);
      toast.success(`Deal marked as ${status}!`);
      fetchDeals();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to close deal'); }
  };

  const openDeal = async (deal) => {
    try {
      const res = await api.get(`/deals/${deal._id}`);
      setSelectedDeal(res.data);
      setShowDealDetailModal(true);
    } catch { toast.error('Failed to load deal details'); }
  };

  // ============ CLIENTS HANDLERS ============
  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!selectedClient) return;
    setLoading(true);
    try {
      await api.put(`/clients/${selectedClient._id}`, clientForm);
      toast.success('Client updated!');
      setShowClientDetailModal(false);
      setClientForm({ company: '', notes: '', tags: [] });
      fetchClients();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update client'); }
    finally { setLoading(false); }
  };

  const openClient = async (client) => {
    try {
      const res = await api.get(`/clients/${client._id}`);
      setSelectedClient(res.data);
      setClientForm({ company: res.data.company, notes: res.data.notes, tags: res.data.tags || [] });
      setShowClientDetailModal(true);
    } catch { toast.error('Failed to load client details'); }
  };

  // Derive CRM intelligence from existing leadsData — no extra API call
  const crmAlerts = (() => {
    if (!leadsData.leads?.length) return [];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const activeLeads = leadsData.leads.filter(l => !['converted', 'not-interested'].includes(l.status));
    const stale = activeLeads.filter(l => new Date(l.updatedAt) < sevenDaysAgo);
    const overdueFollowUp = activeLeads.filter(l => l.followUpDate && new Date(l.followUpDate) < now);
    const agingNew = activeLeads.filter(l => l.status === 'new' && new Date(l.createdAt) < new Date(now.getTime() - 14 * 86400000));
    const alerts = [];
    if (stale.length > 0)
      alerts.push({ level: 'warning', message: `${stale.length} lead${stale.length > 1 ? 's have' : ' has'} had no activity for 7+ days. Follow up to keep your CRM score up.`, link: '/crm' });
    if (overdueFollowUp.length > 0)
      alerts.push({ level: 'error', message: `${overdueFollowUp.length} overdue follow-up${overdueFollowUp.length > 1 ? 's' : ''}. Schedule a call or update the follow-up date.`, link: '/crm' });
    if (agingNew.length > 0)
      alerts.push({ level: 'info', message: `${agingNew.length} lead${agingNew.length > 1 ? 's' : ''} still in "New" status for 14+ days. Qualify or mark as not interested.` });
    return alerts;
  })();

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 space-y-4 animate-fade-in">
      <IntelligenceAlerts alerts={crmAlerts} />
      {/* Tabs */}
      <div className="flex gap-2 border-b border-violet-200 overflow-x-auto">
        {[
          { key: 'products',        label: 'Products' },
          { key: 'leads',          label: 'Leads' },
          { key: 'deals',          label: 'Deals' },
          { key: 'clients',        label: 'Clients' },
          { key: 'quotations',     label: 'Quotations' },
          { key: 'purchase-orders', label: 'Purchase Orders' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-semibold text-sm transition-colors border-b-2 -mb-0.5 whitespace-nowrap ${
              activeTab === tab.key
                ? 'text-violet-700 border-violet-700'
                : 'text-violet-400 border-transparent hover:text-violet-600'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ============ LEADS TAB ============ */}
      {activeTab === 'leads' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard label="Total" value={leadsData.stats?.total ?? '—'} icon={<SI d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" size={14} color="text-violet-600" />} color="violet" />
            <KpiCard label="New" value={leadsData.stats?.new ?? '—'} icon={<SI d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-violet-600" />} color="violet" />
            <KpiCard label="Interested" value={leadsData.stats?.interested ?? '—'} icon={<SI d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" size={14} color="text-amber-500" />} color="golden" />
            <KpiCard label="Converted" value={leadsData.stats?.converted ?? '—'} icon={<SI d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" size={14} color="text-violet-600" />} color="green" />
            <KpiCard label="Not Interested" value={leadsData.stats?.notInterested ?? '—'} icon={<SI d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-gray-900" />} color="red" />
            <KpiCard label="Conversion %" value={leadsData.stats?.conversionRate !== undefined ? `${leadsData.stats.conversionRate}%` : '—'} icon={<SI d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" size={14} color="text-amber-500" />} color="golden" />
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="font-bold text-violet-900">Lead Pipeline</h3>
              <div className="filter-bar">
                {['', 'new', 'interested', 'not-interested', 'converted'].map(s => (
                  <button key={s} onClick={() => setLeadStatusFilter(s)}
                    className={leadStatusFilter === s ? 'filter-pill-active' : 'filter-pill-inactive'}>
                    {s === '' ? 'All' : s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </button>
                ))}
                <button onClick={() => setShowAddLeadModal(true)} className="btn-primary btn-sm">+ Add Lead</button>
              </div>
            </div>

            {leadsData.leads.length === 0 ? (
              <EmptyState icon={<SI d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" size={40} color="text-violet-400" />} title="No leads yet" message="Start adding leads to build your pipeline."
                action={{ label: 'Add Lead', onClick: () => setShowAddLeadModal(true) }} />
            ) : (
              <>
                {/* Mobile card list */}
                <div className="sm:hidden space-y-2">
                  {leadsData.leads.map(lead => (
                    <div key={lead._id} className="p-3 border border-violet-100 rounded-xl hover:bg-violet-50/30 transition-colors"
                      onClick={() => openLead(lead)}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-violet-900 text-sm truncate">{lead.name}</p>
                          {lead.email && <p className="text-xs text-violet-400 truncate">{lead.email}</p>}
                        </div>
                        <Badge status={lead.status} />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        {lead.phone && <span className="flex items-center gap-1"><SI d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" size={11} />{lead.phone}</span>}
                        <span className="capitalize text-gray-400">{lead.source?.replace(/-/g, ' ')}</span>
                        <span className="text-violet-300">{formatDate(lead.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-violet-50">
                        <select value={lead.status} onChange={e => { e.stopPropagation(); handleLeadStatusChange(lead._id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-xs border border-violet-200 rounded-lg px-2 py-1.5 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400">
                          <option value="new">New</option>
                          <option value="interested">Interested</option>
                          <option value="not-interested">Not Interested</option>
                          <option value="converted">Converted</option>
                        </select>
                        <button onClick={e => { e.stopPropagation(); openLead(lead); }}
                          className="btn-secondary btn-sm text-xs">View</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
                  <table className="data-table min-w-[540px]">
                    <thead>
                      <tr>
                        <th>Lead</th><th>Phone</th><th>Source</th><th>Status</th><th>Added</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadsData.leads.map(lead => (
                        <tr key={lead._id} className="cursor-pointer" onClick={() => openLead(lead)}>
                          <td>
                            <div>
                              <p className="font-semibold text-violet-900">{lead.name}</p>
                              {lead.email && <p className="text-xs text-violet-400">{lead.email}</p>}
                            </div>
                          </td>
                          <td>{lead.phone}</td>
                          <td className="capitalize">{lead.source.replace(/-/g, ' ')}</td>
                          <td>
                            <select value={lead.status} onChange={e => { e.stopPropagation(); handleLeadStatusChange(lead._id, e.target.value); }}
                              onClick={e => e.stopPropagation()}
                              className="text-xs border border-violet-200 rounded-lg px-2 py-1 bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-400">
                              <option value="new">New</option>
                              <option value="interested">Interested</option>
                              <option value="not-interested">Not Interested</option>
                              <option value="converted">Converted</option>
                            </select>
                          </td>
                          <td className="text-xs">{formatDate(lead.createdAt)}</td>
                          <td>
                            <button onClick={e => { e.stopPropagation(); openLead(lead); }} className="btn-ghost btn-sm text-xs">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          {/* Add Lead Modal */}
          <Modal isOpen={showAddLeadModal} onClose={() => setShowAddLeadModal(false)} title="Add New Lead">
            <form onSubmit={handleAddLead} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Full Name *</label>
                  <input className="input-field" required value={leadForm.name} onChange={e => setLeadForm(f => ({ ...f, name: e.target.value }))} placeholder="Lead's name" />
                </div>
                <div>
                  <label className="input-label">Phone *</label>
                  <input className="input-field" required value={leadForm.phone} onChange={e => setLeadForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone number" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Email</label>
                  <input type="email" className="input-field" value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} placeholder="Optional" />
                </div>
                <div>
                  <label className="input-label">Source</label>
                  <select className="input-field" value={leadForm.source} onChange={e => setLeadForm(f => ({ ...f, source: e.target.value }))}>
                    <option value="website">Website</option>
                    <option value="referral">Referral</option>
                    <option value="social">Social Media</option>
                    <option value="cold-call">Cold Call</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="input-label">Notes</label>
                <textarea className="input-field" rows={3} value={leadForm.notes} onChange={e => setLeadForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any initial notes about this lead..." />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Adding...' : 'Add Lead'}</button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAddLeadModal(false)}>Cancel</button>
              </div>
            </form>
          </Modal>

          {/* Lead Detail Modal */}
          <Modal isOpen={showLeadDetailModal && !!selectedLead} onClose={() => setShowLeadDetailModal(false)} title="Lead Details" size="lg">
            {selectedLead && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Name', value: selectedLead.name },
                    { label: 'Phone', value: selectedLead.phone },
                    { label: 'Email', value: selectedLead.email || '—' },
                    { label: 'Source', value: selectedLead.source },
                    { label: 'Status', value: selectedLead.status },
                    { label: 'Added', value: formatDate(selectedLead.createdAt) },
                  ].map(item => (
                    <div key={item.label} className="p-3 bg-violet-50 rounded-xl">
                      <p className="text-xs text-violet-500 font-medium">{item.label}</p>
                      <p className="text-sm font-semibold text-violet-900 capitalize mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>
                {selectedLead.notes && <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl">{selectedLead.notes}</p>}

                <div>
                  <label className="input-label">Update Status</label>
                  <div className="filter-bar">
                    {['new', 'interested', 'not-interested', 'converted'].map(s => (
                      <button key={s} onClick={() => handleLeadStatusChange(selectedLead._id, s)}
                        className={`${selectedLead.status === s ? 'filter-pill-active' : 'filter-pill-inactive'} capitalize`}>
                        {statusColors[s]} {s.replace(/-/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-violet-900 mb-3">Activity Timeline</h4>
                  {selectedLead.activities?.length === 0 ? (
                    <p className="text-sm text-violet-400 text-center py-4">No activities logged yet</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {[...selectedLead.activities].reverse().map((act, i) => (
                        <div key={i} className="flex gap-3 p-3 bg-violet-50 rounded-xl">
                          <span className="flex-shrink-0">{act.type === 'call' ? <SI d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.948V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" size={16} color="text-violet-500" /> : act.type === 'meeting' ? <SI d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" size={16} color="text-violet-500" /> : act.type === 'follow-up' ? <SI d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" size={16} color="text-violet-500" /> : <SI d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" size={16} color="text-violet-500" />}</span>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-violet-900">{act.note}</p>
                            <p className="text-xs text-violet-400 mt-0.5">{formatDateTime(act.date)} · {act.by?.name || 'You'}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleAddActivity} className="mt-3 flex flex-col sm:flex-row gap-2">
                    <select className="input-field sm:w-auto flex-shrink-0" value={activityForm.type}
                      onChange={e => setActivityForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="call">Call</option>
                      <option value="meeting">Meeting</option>
                      <option value="follow-up">Follow-up</option>
                      <option value="note">Note</option>
                    </select>
                    <input className="input-field flex-1" placeholder="Log activity note..."
                      value={activityForm.note} onChange={e => setActivityForm(f => ({ ...f, note: e.target.value }))} />
                    <button type="submit" className="btn-primary sm:flex-shrink-0">Log</button>
                  </form>
                </div>
              </div>
            )}
          </Modal>
        </>
      )}

      {/* ============ DEALS TAB ============ */}
      {activeTab === 'deals' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard label="Total" value={dealsData.stats?.total ?? '—'} icon={<SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-violet-600" />} color="violet" />
            <KpiCard label="Open" value={dealsData.stats?.open ?? '—'} icon={<SI d="M13 10V3L4 14h7v7l9-11h-7z" size={14} color="text-amber-500" />} color="golden" />
            <KpiCard label="Won" value={dealsData.stats?.won ?? '—'} icon={<SI d="M5 13l4 4L19 7" size={14} color="text-violet-600" />} color="green" />
            <KpiCard label="Lost" value={dealsData.stats?.lost ?? '—'} icon={<SI d="M6 18L18 6M6 6l12 12" size={14} color="text-gray-900" />} color="red" />
            <KpiCard label="Revenue" value={dealsData.stats?.totalRevenue ? formatCurrency(dealsData.stats.totalRevenue) : '—'} icon={<SI d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-violet-600" />} color="blue" />
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="font-bold text-violet-900">Deals Pipeline</h3>
              <div className="filter-bar">
                {['', 'open', 'won', 'lost'].map(s => (
                  <button key={s} onClick={() => setDealStatusFilter(s)}
                    className={dealStatusFilter === s ? 'filter-pill-active' : 'filter-pill-inactive'}>
                    {s === '' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
                <button onClick={() => setShowAddDealModal(true)} className="btn-primary btn-sm">+ Create Deal</button>
              </div>
            </div>

            {dealsData.deals.length === 0 ? (
              <EmptyState icon={<SI d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" size={40} color="text-violet-400" />} title="No deals yet" message="Create your first deal to track sales pipeline."
                action={{ label: 'Create Deal', onClick: () => setShowAddDealModal(true) }} />
            ) : (
              <>
                {/* Mobile card list */}
                <div className="sm:hidden space-y-2">
                  {dealsData.deals.map(deal => (
                    <div key={deal._id} className="p-3 border border-violet-100 rounded-xl hover:bg-violet-50/30 transition-colors"
                      onClick={() => openDeal(deal)}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-semibold text-violet-900 text-sm truncate flex-1">{deal.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${deal.status === 'open' ? 'bg-violet-100 text-violet-700' : deal.status === 'won' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                          {deal.status.charAt(0).toUpperCase() + deal.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500 mb-2">
                        {deal.lead?.name && <span>Lead: {deal.lead.name}</span>}
                        <span className="text-gray-400">{SERVICE_TYPE_MAP[deal.serviceType] || deal.serviceType}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-base font-bold text-violet-700">{formatCurrency(deal.finalDealAmount)}</p>
                          <p className="text-[10px] text-gray-400">{deal.probability}% probability</p>
                        </div>
                        <button onClick={e => { e.stopPropagation(); openDeal(deal); }}
                          className="btn-secondary btn-sm text-xs">View</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
                  <table className="data-table min-w-[600px]">
                    <thead>
                      <tr>
                        <th>Deal</th><th>Lead</th><th>Service</th><th>Amount</th><th>Probability</th><th>Status</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dealsData.deals.map(deal => (
                        <tr key={deal._id} className="cursor-pointer" onClick={() => openDeal(deal)}>
                          <td className="font-semibold text-violet-900">{deal.name}</td>
                          <td>{deal.lead?.name || '—'}</td>
                          <td className="text-xs">{SERVICE_TYPE_MAP[deal.serviceType] || deal.serviceType}</td>
                          <td className="font-semibold">{formatCurrency(deal.finalDealAmount)}</td>
                          <td>
                            <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${deal.probability >= 75 ? 'bg-violet-100 text-violet-700' : deal.probability >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-900'}`}>
                              {deal.probability}%
                            </span>
                          </td>
                          <td>
                            <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${deal.status === 'open' ? 'bg-violet-100 text-violet-700' : deal.status === 'won' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-900'}`}>
                              {deal.status.charAt(0).toUpperCase() + deal.status.slice(1)}
                            </span>
                          </td>
                          <td>
                            <button onClick={e => { e.stopPropagation(); openDeal(deal); }} className="btn-ghost btn-sm text-xs">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          {/* Create Deal Modal */}
          <Modal isOpen={showAddDealModal} onClose={() => setShowAddDealModal(false)} title="Create New Deal">
            <form onSubmit={handleAddDeal} className="space-y-4">
              <div>
                <label className="input-label">Lead *</label>
                <select className="input-field" required value={dealForm.leadId} onChange={e => setDealForm(f => ({ ...f, leadId: e.target.value }))}>
                  <option value="">Select a lead...</option>
                  {leadsData.leads.filter(l => l.status !== 'converted').map(lead => (
                    <option key={lead._id} value={lead._id}>{lead.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label">Service Type *</label>
                <select className="input-field" required value={dealForm.serviceType} onChange={e => setDealForm(f => ({ ...f, serviceType: e.target.value }))}>
                  <option value="">Select service...</option>
                  <option value="automated-systems">Automated Systems</option>
                  <option value="web-mobile-apps">Web and Mobile Apps</option>
                  <option value="digital-marketing">Digital Marketing</option>
                  <option value="outsourcing">Outsourcing</option>
                  <option value="eshcul">Eshcul</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Quoted Amount (₹)</label>
                  <input type="number" className="input-field" value={dealForm.quotedAmount} onChange={e => setDealForm(f => ({ ...f, quotedAmount: parseFloat(e.target.value) || 0 }))} placeholder="0" />
                </div>
                <div>
                  <label className="input-label">Final Deal Amount (₹) *</label>
                  <input type="number" className="input-field" required value={dealForm.finalDealAmount} onChange={e => setDealForm(f => ({ ...f, finalDealAmount: parseFloat(e.target.value) || 0 }))} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Probability (%)</label>
                  <input type="number" className="input-field" min="0" max="100" value={dealForm.probability} onChange={e => setDealForm(f => ({ ...f, probability: parseInt(e.target.value) || 0 }))} placeholder="0" />
                </div>
                <div>
                  <label className="input-label">Expected Close Date</label>
                  <input type="date" className="input-field" value={dealForm.expectedCloseDate} onChange={e => setDealForm(f => ({ ...f, expectedCloseDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="input-label">Notes</label>
                <textarea className="input-field" rows={3} value={dealForm.notes} onChange={e => setDealForm(f => ({ ...f, notes: e.target.value }))} placeholder="Deal notes..." />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Creating...' : 'Create Deal'}</button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAddDealModal(false)}>Cancel</button>
              </div>
            </form>
          </Modal>

          {/* Deal Detail Modal */}
          <Modal isOpen={showDealDetailModal && !!selectedDeal} onClose={() => setShowDealDetailModal(false)} title="Deal Details" size="lg">
            {selectedDeal && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Deal Name', value: selectedDeal.name },
                    { label: 'Lead', value: selectedDeal.lead?.name || '—' },
                    { label: 'Service', value: SERVICE_TYPE_MAP[selectedDeal.serviceType] || selectedDeal.serviceType },
                    { label: 'Final Amount', value: formatCurrency(selectedDeal.finalDealAmount) },
                    { label: 'Probability', value: `${selectedDeal.probability}%` },
                    { label: 'Status', value: selectedDeal.status.toUpperCase() },
                  ].map(item => (
                    <div key={item.label} className="p-3 bg-violet-50 rounded-xl">
                      <p className="text-xs text-violet-500 font-medium">{item.label}</p>
                      <p className="text-sm font-semibold text-violet-900 mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>
                {selectedDeal.notes && <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl"><strong>Notes:</strong> {selectedDeal.notes}</p>}

                {selectedDeal.status === 'open' && (
                  <div>
                    <label className="input-label">Close Deal</label>
                    <div className="flex gap-2">
                      <button onClick={() => handleDealStatusChange(selectedDeal._id, 'won')} className="flex-1 px-4 py-2 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors">
                        ✓ Mark as Won
                      </button>
                      <button onClick={() => handleDealStatusChange(selectedDeal._id, 'lost')} className="flex-1 px-4 py-2 bg-gray-200 text-white rounded-lg font-semibold hover:bg-gray-200 transition-colors">
                        ✗ Mark as Lost
                      </button>
                    </div>
                  </div>
                )}

                {selectedDeal.status === 'won' && (
                  <div className="p-3 bg-violet-50 rounded-xl">
                    <p className="text-xs text-violet-600 font-medium">Commission</p>
                    <p className="text-lg font-bold text-violet-700">{formatCurrency(selectedDeal.commission)}</p>
                  </div>
                )}
              </div>
            )}
          </Modal>
        </>
      )}

      {/* ============ CLIENTS TAB ============ */}
      {activeTab === 'clients' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KpiCard label="Total Clients" value={clientsData.stats?.totalClients ?? '—'} icon={<SI d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" size={14} color="text-violet-600" />} color="violet" />
            <KpiCard label="Total Deal Value" value={clientsData.stats?.totalDealValue ? formatCurrency(clientsData.stats.totalDealValue) : '—'} icon={<SI d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" size={14} color="text-violet-600" />} color="blue" />
            <KpiCard label="Avg Deal Value" value={clientsData.stats?.avgDealValue ? formatCurrency(clientsData.stats.avgDealValue) : '—'} icon={<SI d="M13 10V3L4 14h7v7l9-11h-7z" size={14} color="text-amber-500" />} color="golden" />
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h3 className="font-bold text-violet-900">Clients</h3>
            </div>

            {clientsData.clients.length === 0 ? (
              <EmptyState icon={<SI d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" size={40} color="text-violet-400" />} title="No clients yet" message="Clients will be created when deals are won." />
            ) : (
              <>
                {/* Mobile card list */}
                <div className="sm:hidden space-y-2">
                  {clientsData.clients.map(client => (
                    <div key={client._id} className="p-3 border border-violet-100 rounded-xl hover:bg-violet-50/30 transition-colors"
                      onClick={() => openClient(client)}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-violet-900 text-sm truncate">{client.name}</p>
                          {client.company && <p className="text-xs text-gray-500 truncate">{client.company}</p>}
                        </div>
                        <p className="text-sm font-bold text-violet-700 flex-shrink-0">{formatCurrency(client.dealValue)}</p>
                      </div>
                      {client.email && <p className="text-xs text-violet-400 truncate mb-1">{client.email}</p>}
                      <div className="flex items-center justify-between pt-1.5 border-t border-violet-50">
                        <p className="text-[10px] text-gray-400">Converted: {formatDate(client.convertedDate)}</p>
                        <button onClick={e => { e.stopPropagation(); openClient(client); }}
                          className="btn-secondary btn-sm text-xs">View</button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto -mx-5 px-5">
                  <table className="data-table min-w-[600px]">
                    <thead>
                      <tr>
                        <th>Name</th><th>Company</th><th>Email</th><th>Deal Value</th><th>Converted</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsData.clients.map(client => (
                        <tr key={client._id} className="cursor-pointer" onClick={() => openClient(client)}>
                          <td className="font-semibold text-violet-900">{client.name}</td>
                          <td className="text-gray-600">{client.company || '—'}</td>
                          <td className="text-sm text-violet-500">{client.email || '—'}</td>
                          <td className="font-semibold">{formatCurrency(client.dealValue)}</td>
                          <td className="text-xs">{formatDate(client.convertedDate)}</td>
                          <td>
                            <button onClick={e => { e.stopPropagation(); openClient(client); }} className="btn-ghost btn-sm text-xs">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          {/* Client Detail Modal */}
          <Modal isOpen={showClientDetailModal && !!selectedClient} onClose={() => setShowClientDetailModal(false)} title="Client Details" size="lg">
            {selectedClient && (
              <form onSubmit={handleUpdateClient} className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Name', value: selectedClient.name },
                    { label: 'Phone', value: selectedClient.phone || '—' },
                    { label: 'Email', value: selectedClient.email || '—' },
                    { label: 'Deal Value', value: formatCurrency(selectedClient.dealValue) },
                    { label: 'Converted', value: formatDate(selectedClient.convertedDate) },
                    { label: 'Lead', value: selectedClient.lead?.name || '—' },
                  ].map(item => (
                    <div key={item.label} className="p-3 bg-violet-50 rounded-xl">
                      <p className="text-xs text-violet-500 font-medium">{item.label}</p>
                      <p className="text-sm font-semibold text-violet-900 mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="input-label">Company</label>
                  <input className="input-field" value={clientForm.company} onChange={e => setClientForm(f => ({ ...f, company: e.target.value }))} placeholder="Company name" />
                </div>

                <div>
                  <label className="input-label">Notes</label>
                  <textarea className="input-field" rows={3} value={clientForm.notes} onChange={e => setClientForm(f => ({ ...f, notes: e.target.value }))} placeholder="Client notes..." />
                </div>

                <div>
                  <label className="input-label">Tags</label>
                  <input className="input-field" placeholder="Comma-separated tags..." value={clientForm.tags.join(', ')} onChange={e => setClientForm(f => ({ ...f, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))} />
                </div>

                <div className="flex gap-3">
                  <button type="submit" className="btn-primary flex-1" disabled={loading}>{loading ? 'Saving...' : 'Save Changes'}</button>
                  <button type="button" className="btn-secondary flex-1" onClick={() => setShowClientDetailModal(false)}>Close</button>
                </div>
              </form>
            )}
          </Modal>
        </>
      )}

      {/* ============ QUOTATIONS TAB ============ */}
      {/* ============ PRODUCTS TAB ============ */}
      {activeTab === 'products' && (
        <ProductsTab />
      )}

      {activeTab === 'quotations' && (
        <QuotationsTab leads={leadsData.leads} />
      )}

      {/* ============ PURCHASE ORDERS TAB ============ */}
      {activeTab === 'purchase-orders' && (
        <PurchaseOrdersTab />
      )}
    </div>
  );
};

export default CRMPage;
