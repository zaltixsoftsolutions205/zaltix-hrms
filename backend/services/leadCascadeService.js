/**
 * leadCascadeService.js
 * ---------------------------------------------------------------------------
 * Deleting a Lead deletes everything that only exists because of it:
 *   Visit, Deal, Client, Quotation, LeadCustomFieldValue, GlobalTableValue,
 *   Demo, DataUpdate, Registration, Feedback
 * Records that have a life of their own are kept and only unlinked:
 *   ProductProspect.convertedToLead -> null (the customer stays)
 *   Income.dealId                   -> removed (finance records are never deleted here)
 *   PurchaseOrder.quotation         -> null
 * Used by single-lead and bulk deletes, inside the caller's transaction.
 * ---------------------------------------------------------------------------
 */

const Lead = require('../models/Lead');
const Visit = require('../models/Visit');
const Deal = require('../models/Deal');
const Client = require('../models/Client');
const Quotation = require('../models/Quotation');
const Income = require('../models/Income');
const PurchaseOrder = require('../models/PurchaseOrder');
const ProductProspect = require('../models/ProductProspect');
const LeadCustomFieldValue = require('../models/LeadCustomFieldValue');
const GlobalTable = require('../models/GlobalTable');
const GlobalTableValue = require('../models/GlobalTableValue');
const Demo = require('../models/Demo');
const DataUpdate = require('../models/DataUpdate');
const Registration = require('../models/Registration');
const Feedback = require('../models/Feedback');

const ACTIVITY_MODELS = [Demo, DataUpdate, Registration, Feedback];

const withSession = (query, session) => (session ? query.session(session) : query);

/** Deletes the given leads and their dependent data. Returns per-collection counts. */
async function deleteLeadsCascade(leadIds, session = null) {
  const ids = [...new Set((leadIds || []).map(String))];
  if (!ids.length) return { leads: 0 };
  const opts = session ? { session } : {};

  const [dealIds, quotationIds, leadTableIds] = await Promise.all([
    withSession(Deal.find({ lead: { $in: ids } }), session).distinct('_id'),
    withSession(Quotation.find({ lead: { $in: ids } }), session).distinct('_id'),
    withSession(GlobalTable.find({ entity: 'lead' }), session).distinct('_id'),
  ]);

  // Unlink records that are kept.
  if (dealIds.length) await Income.updateMany({ dealId: { $in: dealIds } }, { $unset: { dealId: 1 } }, opts);
  if (quotationIds.length) await PurchaseOrder.updateMany({ quotation: { $in: quotationIds } }, { $set: { quotation: null } }, opts);
  await ProductProspect.updateMany({ convertedToLead: { $in: ids } }, { $set: { convertedToLead: null } }, opts);

  // Delete what belongs to the leads (one at a time: a shared session runs one op at once).
  const visits = await Visit.deleteMany({ lead: { $in: ids } }, opts);
  for (const Model of ACTIVITY_MODELS) await Model.deleteMany({ lead: { $in: ids } }, opts);
  const deals = await Deal.deleteMany({ lead: { $in: ids } }, opts);
  const clients = await Client.deleteMany({ lead: { $in: ids } }, opts);
  const quotations = await Quotation.deleteMany({ lead: { $in: ids } }, opts);
  const customValues = await LeadCustomFieldValue.deleteMany({ lead: { $in: ids } }, opts);
  const tableValues = await GlobalTableValue.deleteMany({ tableId: { $in: leadTableIds }, recordId: { $in: ids } }, opts);
  const leads = await Lead.deleteMany({ _id: { $in: ids } }, opts);

  return {
    leads: leads.deletedCount || 0,
    visits: visits.deletedCount || 0,
    deals: deals.deletedCount || 0,
    clients: clients.deletedCount || 0,
    quotations: quotations.deletedCount || 0,
    customValues: customValues.deletedCount || 0,
    tableValues: tableValues.deletedCount || 0,
  };
}

module.exports = { deleteLeadsCascade };
