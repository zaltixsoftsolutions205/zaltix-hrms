const mongoose = require('mongoose');

/* ============================================================================
   PIPELINE STAGES - single source of truth
   ----------------------------------------------------------------------------
   The ORDER of this array defines promotion / demotion:
     a higher index than the current stage is a promotion, a lower one a demotion.
   ========================================================================== */
const PIPELINE_STAGES = ['lead', 'visit', 'demo', 'data-update', 'registration', 'feedback', 'lead-won', 'lead-lost',];

// Closed stages. They can only be left in one way each:
//   lead-won  -> lead-lost              ("convert": the client dropped)
//   lead-lost -> an open pipeline stage ("rework": the client came back)
const TERMINAL_STAGES = ['lead-won', 'lead-lost'];

// The open (not closed) pipeline stages.
const OPEN_STAGES = PIPELINE_STAGES.filter((s) => !TERMINAL_STAGES.includes(s));

// Where a lost lead can be reworked to: any open stage, or straight back to Lead Won
// (the client came back and is a client again).
const REWORK_STAGES = [...OPEN_STAGES, 'lead-won'];

// Activity pages a won lead (a client) can be sent to. Its pipelineStage stays
// 'lead-won'; wonActivityStage says which page it is on.
const ACTIVITY_STAGES = ['visit', 'demo', 'data-update', 'registration', 'feedback'];

// Stage names used before the 8-stage pipeline. Existing documents may still hold
// them until the migration in the notes is run. They are READ as the new stage
// (see normalizeStage) but can no longer be WRITTEN.
const LEGACY_STAGE_MAP = new Map([['converted', 'lead-won'], ['closed-won', 'lead-won'], ['closed-lost', 'lead-lost'],]);

/** The current stage name for any stored value (legacy names are translated). */
const normalizeStage = (stage) => {
  if (stage === undefined || stage === null || stage === '') return 'lead';
  return LEGACY_STAGE_MAP.has(stage) ? LEGACY_STAGE_MAP.get(stage) : stage;
};

/** Every stored value that means `stage` (the stage itself plus its legacy names). */
const stageValues = (stage) => [stage, ...[...LEGACY_STAGE_MAP.entries()].filter(([, current]) => current === stage).map(([legacy]) => legacy),];

// Every stored value that means "finished" (used for overdue / follow-up queries)
const CLOSED_STAGE_VALUES = TERMINAL_STAGES.flatMap(stageValues);
const WON_STAGE_VALUES = stageValues('lead-won');

// Allowed ways out of a closed stage.
const CLOSED_MOVES = {
  'lead-won': { allowed: ['lead-lost'], direction: 'convert', message: 'A won lead can only be converted to Lead Lost' },
  'lead-lost': { allowed: REWORK_STAGES, direction: 'rework', message: 'A lost lead can only be reworked back into the pipeline' },
};

/**
 * The ONE place that decides whether a stage change is allowed.
 *   - the target must be one of PIPELINE_STAGES                     -> code 'invalid'
 *   - lead-won can only go to lead-lost (direction 'convert')
 *   - lead-lost can only go to an open stage or lead-won (direction 'rework') -> otherwise code 'terminal'
 *   - open stages may go anywhere (skipping stages is permitted)
 * Returns { ok, direction: 'promotion' | 'demotion' | 'change' | 'convert' | 'rework' | 'none', from, to, code?, message? }.
 * `from` is the stored value; legacy names are translated first.
 */
const checkStageTransition = (from, to) => {
  if (typeof to !== 'string' || !PIPELINE_STAGES.includes(to)) {
    return { ok: false, code: 'invalid', to, message: `Invalid pipeline stage: ${to}` };
  }
  const current = normalizeStage(from);
  if (current === to) return { ok: true, direction: 'none', from: current, to };
  const closed = CLOSED_MOVES[current];
  if (closed) {
    if (closed.allowed.includes(to)) return { ok: true, direction: closed.direction, from: current, to };
    return { ok: false, code: 'terminal', from: current, to, message: closed.message };
  }
  const fromIndex = PIPELINE_STAGES.indexOf(current);
  const toIndex = PIPELINE_STAGES.indexOf(to);
  let direction = 'change'; // stored value is not a known stage: nothing to compare against
  if (fromIndex !== -1) direction = toIndex > fromIndex ? 'promotion' : 'demotion';
  return { ok: true, direction, from: current, to };
};

/**
 * Fields that change together with the stage (to -> $set values). Used by every
 * writer (leadController.applyStageChange and the Excel import) so they agree.
 *   -> lead-won  : becomes a client, not on any activity page yet
 *   -> lead-lost : leaves its activity page; lostAt is now (the reason is set by the caller)
 *   -> open stage: back in the normal pipeline; the lost details are cleared
 */
const stageSideEffects = (to, { by = null, reason = '', now = new Date() } = {}) => {
  if (to === 'lead-won') return { wasClient: true, wonActivityStage: null, lostReason: '', lostAt: null, lostBy: null };
  if (to === 'lead-lost') return { wonActivityStage: null, lostReason: reason || '', lostAt: now, lostBy: by };
  return { wonActivityStage: null, lostReason: '', lostAt: null, lostBy: null };
};

/**
 * Which activity page a lead belongs to: its own stage while open, its
 * wonActivityStage while won (null = not on any page), nothing while lost.
 */
const activityStageOf = (lead) => {
  const stage = normalizeStage(lead && lead.pipelineStage);
  if (stage === 'lead-won') return (lead && lead.wonActivityStage) || null;
  if (stage === 'lead-lost') return null;
  return stage;
};

/** Mongo filter for the leads that belong on one activity page (open leads in the stage + clients sent there). */
const activityStageFilter = (stage) => ({
  $or: [
    { pipelineStage: { $in: stageValues(stage) } },
    { pipelineStage: { $in: stageValues('lead-won') }, wonActivityStage: stage },
  ],
});

// The only business fields on a native Lead (plus createdAt / updatedAt / _id).
// Used as a projection so documents that still carry legacy fields in MongoDB
// (phone, email, status, activities, ...) never leak them through the API.
const SELECT_FIELDS = 'name assignedTo createdBy district mandal product productLocation globalTableId pipelineStage wonActivityStage wasClient lostReason lostAt lostBy followUpDate createdAt updatedAt';

const leadSchema = new mongoose.Schema(
  {
    // Core Lead identification
    name: {
      type: String,
      required: [true, 'Lead name is required'],
      trim: true,
      minlength: [2, 'Lead name must be at least 2 characters'],
      maxlength: [100, 'Lead name cannot exceed 100 characters'],
    },

    // Lead ownership and permissions
    // The sales employee who works the lead. Optional: only set when someone picks
    // a sales user (it is NOT filled with the creator; that is createdBy).
    // Leads without one show under the Leads page's "Missing info" filter.
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // The employee who created the lead (set by the server on create, never
    // from request fields). The Leads page's "All my leads" lists these.
    // null on leads created before this field existed.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Location
    district: {
      type: String,
      trim: true,
      default: '',
    },
    mandal: {
      type: String,
      trim: true,
      default: '',
    },

    // The product this lead belongs to / is interested in. Optional.
    // Existence and active status are checked by leadController on write.
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    
    // Internal provenance for Leads created in a product/location Global Table.
    // It is set only by the trusted adapter context, never from request fields.
    productLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductLocation',
      default: null,
    },

    // Explicit one-Lead-to-one-GlobalTable membership. Ordinary CRM Leads stay unassigned.
    globalTableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GlobalTable',
      default: null,
    },

    // CRM pipeline workflow
    pipelineStage: {
      type: String,
      enum: PIPELINE_STAGES,
      default: 'lead',
    },

    // Only for won leads (clients): the activity page the client was sent to from
    // the CRM Clients tab. pipelineStage stays 'lead-won'. null = not on any page.
    wonActivityStage: {
      type: String,
      enum: [...ACTIVITY_STAGES, null],
      default: null,
    },

    // true once the lead has reached lead-won (kept after it is converted to lost,
    // so the Lost list can tag former clients).
    wasClient: {
      type: Boolean,
      default: false,
    },

    // Why and when the lead was lost. Cleared when it is reworked.
    lostReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
      default: '',
    },
    lostAt: {
      type: Date,
      default: null,
    },
    lostBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Every stage change, oldest first. action: move | convert | rework | activity
    // (activity = a client sent to / taken off an activity page).
    stageHistory: {
      type: [
        {
          _id: false,
          from: { type: String, default: '' },
          to: { type: String, default: '' },
          action: { type: String, enum: ['move', 'convert', 'rework', 'activity'], default: 'move' },
          reason: { type: String, trim: true, maxlength: 500, default: '' },
          by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    // Follow-up scheduling
    followUpDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

leadSchema.index({ product: 1, productLocation: 1 });
leadSchema.index({ globalTableId: 1, createdAt: -1 });
leadSchema.index({ pipelineStage: 1, followUpDate: 1 });
leadSchema.index({ createdBy: 1, createdAt: -1 });
leadSchema.index({ pipelineStage: 1, wonActivityStage: 1 });

// A lead saved or created as won is a client (covers create, save and insertMany).
// Only runs when the stage itself is written, so partial documents are never touched.
leadSchema.pre('validate', function markClient(next) {
  if (this.isNew || this.isModified('pipelineStage')) {
    const stage = normalizeStage(this.pipelineStage);
    if (stage === 'lead-won') this.wasClient = true;
    else this.wonActivityStage = null;
  }
  next();
});

// A lead's visits are found through Visit.lead; nothing is stored on the Lead.
// Lead.findById(id).populate({ path: 'visits', options: { sort: { visitDate: -1 } } })
leadSchema.virtual('visits', { ref: 'Visit', localField: '_id', foreignField: 'lead' });

const Lead = mongoose.model('Lead', leadSchema);

Lead.PIPELINE_STAGES = PIPELINE_STAGES;
Lead.TERMINAL_STAGES = TERMINAL_STAGES;
Lead.OPEN_STAGES = OPEN_STAGES;
Lead.REWORK_STAGES = REWORK_STAGES;
Lead.ACTIVITY_STAGES = ACTIVITY_STAGES;
Lead.stageSideEffects = stageSideEffects;
Lead.activityStageOf = activityStageOf;
Lead.activityStageFilter = activityStageFilter;
Lead.CLOSED_STAGE_VALUES = CLOSED_STAGE_VALUES;
Lead.WON_STAGE_VALUES = WON_STAGE_VALUES;
Lead.normalizeStage = normalizeStage;
Lead.stageValues = stageValues;
Lead.checkStageTransition = checkStageTransition;
Lead.SELECT_FIELDS = SELECT_FIELDS;

module.exports = Lead;