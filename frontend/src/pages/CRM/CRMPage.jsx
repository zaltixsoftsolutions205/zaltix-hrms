import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
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
import Lead from './lead';
import ClientsTab from './ClientsTab';
import { SearchableSelect } from '../../components/UI/Assignmentselects';

const SI = ({ d, d2, size = 16, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={color || ''}>
    <path d={d} />{d2 && <path d={d2} />}
  </svg>
);

// Only these roles manage the product -> location -> table tree (the API
// enforces the same list in backend/services/crmScopeService.js).
const TREE_MANAGER_ROLES = ['admin', 'hr', 'manager'];

const CRMPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageProducts = TREE_MANAGER_ROLES.includes(user?.role);
  const [activeTab, setActiveTab] = useState(() => {
    const requested = searchParams.get('tab');
    if (requested && (requested !== 'products' || canManageProducts)) return requested;
    return canManageProducts ? 'products' : 'leads';
  });
  const [leadsData, setLeadsData] = useState({ leads: [], stats: {} });
  const [dealsData, setDealsData] = useState({ deals: [], stats: {} });

  // Deals
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [showDealDetailModal, setShowDealDetailModal] = useState(false);
  const [dealForm, setDealForm] = useState({ leadId: '', serviceType: '', quotedAmount: 0, finalDealAmount: 0, probability: 0, expectedCloseDate: '', notes: '' });
  const [dealStatusFilter, setDealStatusFilter] = useState('');

  const [loading, setLoading] = useState(false);

  // ============ FETCH DATA ============
  // Lead list still feeds the Deals lead picker, Quotations and the CRM alerts.
  const fetchLeads = async () => {
    try {
      const res = await api.get('/leads');
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


  useEffect(() => { fetchLeads(); }, []);
  useEffect(() => { fetchDeals(); }, [dealStatusFilter]);

  // ============ CREATE DEAL: PRODUCT + LEAD PICKERS ============
  // Every lead the user may see (all products), loaded page by page when the
  // Create Deal form opens. The backend scopes the list to the user's access.
  const [dealLeads, setDealLeads] = useState(null);
  const [dealLeadsLoading, setDealLeadsLoading] = useState(false);
  const [dealProductId, setDealProductId] = useState('');

  useEffect(() => {
    if (!showAddDealModal || dealLeads) return undefined;
    let cancelled = false;
    (async () => {
      setDealLeadsLoading(true);
      try {
        const byId = new Map(); // a lead returned on two pages is kept once
        for (let page = 1; ; page += 1) {
          const { data } = await api.get('/leads', { params: { page, limit: 100, sortBy: 'name', sortOrder: 'asc' } });
          (data.leads || []).forEach((lead) => byId.set(String(lead._id), lead));
          if (!data.pagination?.hasNextPage) break;
        }
        if (!cancelled) setDealLeads([...byId.values()]);
      } catch (err) {
        if (!cancelled) toast.error(err.response?.data?.message || 'Failed to load leads');
      } finally {
        if (!cancelled) setDealLeadsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showAddDealModal, dealLeads]);

  const NO_PRODUCT = '__none__';
  const productIdOf = (lead) => (lead.product?._id ? String(lead.product._id) : NO_PRODUCT);

  // Closed leads (won / lost / converted) can't get a new deal.
  const openDealLeads = useMemo(
    () => (dealLeads || []).filter(l => l.status !== 'converted' && !['lead-won', 'lead-lost', 'won', 'lost'].includes(l.pipelineStage)),
    [dealLeads]
  );

  const dealProductOptions = useMemo(() => {
    const byId = new Map();
    openDealLeads.forEach((l) => {
      const id = productIdOf(l);
      const entry = byId.get(id) || { id, label: id === NO_PRODUCT ? 'No product' : l.product.name, count: 0 };
      entry.count += 1;
      byId.set(id, entry);
    });
    const list = [...byId.values()]
      .sort((a, b) => (a.id === NO_PRODUCT) - (b.id === NO_PRODUCT) || a.label.localeCompare(b.label))
      .map(p => ({ id: p.id, label: p.label, sublabel: `${p.count} lead${p.count !== 1 ? 's' : ''}` }));
    return [{ id: '', label: 'All products', sublabel: `${openDealLeads.length} leads` }, ...list];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDealLeads]);

  const dealLeadOptions = useMemo(
    () => openDealLeads
      .filter(l => !dealProductId || productIdOf(l) === dealProductId)
      .map(l => ({
        id: l._id,
        label: l.name,
        sublabel: [dealProductId ? null : l.product?.name, l.mandal || l.district].filter(Boolean).join(' · '),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openDealLeads, dealProductId]
  );

  // Picking a product keeps the lead only if it belongs to that product.
  const handleDealProductChange = (productId) => {
    setDealProductId(productId);
    setDealForm((f) => {
      const lead = openDealLeads.find(l => l._id === f.leadId);
      return lead && productId && productIdOf(lead) !== productId ? { ...f, leadId: '' } : f;
    });
  };

  // Picking a lead fills in its product.
  const handleDealLeadChange = (leadId) => {
    setDealForm(f => ({ ...f, leadId }));
    const lead = openDealLeads.find(l => l._id === leadId);
    if (lead) setDealProductId(productIdOf(lead));
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
      setDealProductId('');
      setDealLeads(null); // reload next time, so the lead just used drops out
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
    <div className="w-full px-3 sm:px-4 space-y-4 animate-fade-in">
      <IntelligenceAlerts alerts={crmAlerts} />
      {/* Tabs */}
      <div className="flex gap-2 border-b border-violet-200 overflow-x-auto">
        {[
          ...(canManageProducts ? [{ key: 'products', label: 'Products' }] : []),
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
      {/* Same product -> location -> table view as the Leads page (/sale/lead). */}
      {activeTab === 'leads' && <Lead />}

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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="input-label">Product</label>
                  <SearchableSelect
                    options={dealProductOptions}
                    value={dealProductId}
                    onChange={handleDealProductChange}
                    loading={dealLeadsLoading}
                    placeholder="All products"
                    loadingMessage="Loading products..."
                    emptyMessage="No products found"
                  />
                </div>
                <div>
                  <label className="input-label">Lead *</label>
                  <SearchableSelect
                    options={dealLeadOptions}
                    value={dealForm.leadId}
                    onChange={handleDealLeadChange}
                    loading={dealLeadsLoading}
                    placeholder="Select a lead..."
                    loadingMessage="Loading leads..."
                    emptyMessage={dealProductId ? 'No leads for this product' : 'No leads found'}
                  />
                </div>
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
      {/* Won clients (sent to activities) and lost leads (rework): see ClientsTab.jsx */}
      {activeTab === 'clients' && <ClientsTab />}

      {/* ============ QUOTATIONS TAB ============ */}
      {/* ============ PRODUCTS TAB ============ */}
      {activeTab === 'products' && canManageProducts && (
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
