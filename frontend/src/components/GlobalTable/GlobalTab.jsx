import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import GlobalTable from './GlobalTable';
import LeadSearchBar, { useLeadSearch } from './LeadSearchBar';

import { getLeads } from '../../services/Leadservice';
import { getAssignableUsers } from '../../services/Userservice';

// title / locationPicker / rowAction: used by the Leads page ("All my leads"),
// which only views and edits leads; they are created in a Mandal's table.
const PAGE_SIZE = 100;

// readOnly: view-only module access (no create, no edits; see GlobalTable).
// createdBy="me": only leads the logged-in user created (Leads page "All my leads").
const GlobalTab = ({ pipelineStage, createdBy, title = 'Global Lead Table', locationPicker, onLeadsChanged, rowAction, showViews = false, viewKey, readOnly = false }) => {
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // The Global Drawer itself is rendered by GlobalTable (it owns the table id and the
  // column / custom-field definitions); this tab only decides when the create drawer is open.
  const [showCreateDrawer, setShowCreateDrawer] = useState(false);

  /*
   * Create lookup:
   * {
   *   userId: userObject
   * }
   */
  const userLookup = useMemo(
    () => Object.fromEntries(users.map((user) => [user._id, user])),
    [users]
  );

  /*
   * Load Leads and assignable users.
   */
  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      // No paging in the UI: every page (the server sends at most 100) is loaded.
      const loadAllLeads = async () => {
        // Keyed by _id: a lead returned on two pages is kept once (duplicate row keys
        // make React leave stale rows on screen).
        const byId = new Map();
        for (let page = 1; ; page += 1) {
          // eslint-disable-next-line no-await-in-loop
          const res = await getLeads({ ...(pipelineStage ? { pipelineStage } : {}), ...(createdBy ? { createdBy } : {}), page, limit: PAGE_SIZE });
          const list = res?.leads || res || [];
          if (Array.isArray(list)) list.forEach((lead) => byId.set(String(lead._id), lead));
          if (!res?.pagination?.hasNextPage) break;
        }
        return [...byId.values()];
      };
      const [leadList, userList] = await Promise.all([
        loadAllLeads(),
        getAssignableUsers().catch(() => []),
      ]);

      setLeads(leadList);
      setUsers(Array.isArray(userList) ? userList : []);
    } catch (error) {
      console.error('GlobalTab load error:', error);
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  }, [pipelineStage, createdBy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /*
   * Called when a Lead is updated from GlobalTable.
   */
  const handleLeadUpdated = useCallback((updatedLead) => {
    if (!updatedLead?._id) {
      loadData();
      return;
    }
    setLeads((previous) => previous.map((lead) => lead._id === updatedLead._id ? { ...lead, ...updatedLead } : lead));
  }, [loadData]);

  /*
   * Called when a Lead is deleted from GlobalTable.
   */
  const handleLeadDeleted = useCallback((leadId) => {
    setLeads((previous) => previous.filter((lead) => lead._id !== leadId));
  }, []);
  /*
   * Called when a Lead is created through the inline Add Row or the Global Drawer.
   *
   * If the backend returns a complete Lead, add it immediately.
   * Otherwise, reload the list to get the authoritative record.
   */
  const handleLeadCreated = useCallback((createdLead) => {
    const lead = createdLead?.record || createdLead?.lead || createdLead;
    const leadId = lead?._id || lead?.id;

    // If the response does not contain a usable Lead, refresh from the API.
    if (!lead || !leadId) {
      loadData();
      return;
    }
    setLeads((previous) => {
      const alreadyExists = previous.some(
        (item) => item._id === leadId || item.id === leadId
      );
      if (alreadyExists) {
        return previous.map((item) =>
          item._id === leadId || item.id === leadId
            ? { ...item, ...lead }
            : item
        );
      }
      return [...previous, lead];
    });
  }, [loadData]);

  const search = useLeadSearch(leads, userLookup);

  const handleOpenCreateDrawer = useCallback(() => {
    setShowCreateDrawer(true);
  }, []);

  const handleCloseCreateDrawer = useCallback(() => {
    setShowCreateDrawer(false);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header: title, record count, search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-violet-900">
            {title}
          </h3>
          <p className="text-xs text-gray-500">
            {loading && leads.length === 0 ? ' ' : search.active
              ? `${search.filtered.length} of ${leads.length} records`
              : `${leads.length} record${leads.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 w-full lg:w-auto">
          <LeadSearchBar {...search.barProps} />
          {!locationPicker && !readOnly && (
            <button type="button" onClick={handleOpenCreateDrawer} className="btn-primary btn-sm">
              + Create Lead
            </button>
          )}
        </div>
      </div>
      {/* Global Table (renders the Global Drawer for create and edit) */}
      <GlobalTable
        leads={search.filtered}
        userLookup={userLookup}
        loading={loading}
        onOpenCreateDrawer={handleOpenCreateDrawer}
        createDrawerOpen={showCreateDrawer}
        onCreateDrawerClose={handleCloseCreateDrawer}
        onLeadUpdated={handleLeadUpdated}
        onLeadDeleted={handleLeadDeleted}
        onLeadCreated={handleLeadCreated}
        onRefreshLeads={() => { loadData(); onLeadsChanged?.(); }}
        locationPicker={locationPicker}
        rowAction={rowAction}
        showViews={showViews}
        viewKey={viewKey}
        readOnly={readOnly}
      />
    </div>
  );
};

export default GlobalTab;