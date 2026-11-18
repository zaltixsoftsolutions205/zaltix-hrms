import LeadDrawer from './LeadDrawer';

/**
 * Thin compatibility wrapper — the actual Create Lead form now lives
 * entirely in LeadDrawer.jsx (mode="create"), shared with the Edit Lead
 * drawer. Kept only so any existing `<CreateLeadDrawer />` usages/imports
 * elsewhere in the app keep working without change. LeadsTab.jsx no longer
 * needs this wrapper — it renders `<LeadDrawer mode="create" />` directly.
 */
const CreateLeadDrawer = ({ isOpen, onClose, customFields, onCreated }) => (
  <LeadDrawer mode="create" isOpen={isOpen} onClose={onClose} customFields={customFields} onSaved={onCreated} />
);

export default CreateLeadDrawer;