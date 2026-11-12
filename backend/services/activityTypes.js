/**
 * activityTypes.js
 * ---------------------------------------------------------------------------
 * The lead activities recorded while a lead is in a pipeline stage. Each type
 * has its own model holding all of its fields (no custom fields). Visits keep
 * their own API (controllers/visitController.js); the types below share one
 * engine (controllers/activityController.js, routes/activities.js).
 *
 *   stage       entries can be added only while the lead is in this stage
 *   module      module key guarding the page (constants/modules.js)
 *   single      one entry per lead (later: view / edit that entry)
 *   followUp    the page lets the user set the lead's follow-up date
 *   mainFields  the fields, validated by the engine and drawn by the frontend:
 *               date (calendar day) | time (stored as a Date on that day) |
 *               text (`max` characters, default 100; `format`: 'phone' = 10 digits,
 *                 'url' = an http(s) link; `fromLead`: left empty -> that lead field) |
 *               rating (1-5; empty allowed when not required) |
 *               user (an employee who may hold the lead) |
 *               select (one of `options`) | number (>= 0; `currency` for rupees) |
 *               file (uploaded separately: POST /entries/:id/file; one per type)
 *               section: 'details' -> drawn in the form's "Details" section and
 *               on the card only when filled.
 * ---------------------------------------------------------------------------
 */

const Demo = require('../models/Demo');
const DataUpdate = require('../models/DataUpdate');
const Registration = require('../models/Registration');
const Feedback = require('../models/Feedback');
// The follow-up date is set on the lead itself (stage page lead panel).

const timeFields = [
  { key: 'startTime', label: 'Start time', type: 'time' },
  { key: 'endTime', label: 'End time', type: 'time' },
];

const NOTES_MAX = 5000;
const notes = (key, label) => ({ key, label, type: 'text', max: NOTES_MAX, section: 'details' });
const opt = (...pairs) => pairs.map(([value, label]) => ({ value, label }));
const select = (key, label, options, extra = {}) => ({ key, label, type: 'select', options, ...extra });
const PHONE_MAX = 20; // typed with spaces / +91; stored as 10 digits
const URL_MAX = 500;
const D = { section: 'details' }; // drawn in Details; on cards only when filled

// Visit fields after the date / time ones (Visit model; checked by visitController).
const VISIT_DETAIL_FIELDS = [
  {
    key: 'visitType',
    label: 'Visit Type',
    type: 'select',
    required: true,
    section: 'details',
    options: opt(['field-visit', 'Field visit'], ['office-visit', 'Office visit'], ['customer-location', 'Customer location'], ['other', 'Other']),
  },
  { key: 'contactPerson', label: 'Contact Person', type: 'text', max: 100, section: 'details' },
  { key: 'contactNumber', label: 'Contact No', type: 'text', format: 'phone', max: PHONE_MAX, section: 'details' },
  { key: 'location', label: 'Location', type: 'text', max: 200, section: 'details' },
  select('purpose', 'Purpose', opt(
    ['introduction', 'Introduction'],
    ['follow-up', 'Follow-up'],
    ['demo-request', 'Demo request'],
    ['collect-documents', 'Collect documents'],
    ['other', 'Other']
  ), { section: 'details' }),
  {
    key: 'leadFeedback',
    label: 'Visit Outcome',
    type: 'select',
    section: 'details',
    options: opt(
      ['using-other-application', 'Using other application'],
      ['not-interested', 'Not interested'],
      ['not-now-but-interested', 'Not now but interested'],
      ['interested', 'Interested'],
      ['not-affordable', 'Not affordable'],
      ['others', 'Others']
    ),
  },
  notes('leadFeedbackOther', 'Visit Outcome (Other)'),
  {
    key: 'salesComment',
    label: 'Sales Comment',
    type: 'select',
    section: 'details',
    options: opt(
      ['interested', 'Interested'],
      ['needs-follow-up', 'Needs follow-up'],
      ['needs-to-revisit', 'Needs to revisit'],
      ['next-time', 'Next time'],
      ['others', 'Others']
    ),
  },
  notes('salesCommentOther', 'Sales Comment (Other)'),
  notes('salesNotes', 'Sales Notes'),
];

const ACTIVITY_TYPES = {
  demo: {
    key: 'demo',
    label: 'Demo',
    plural: 'Demos',
    stage: 'demo',
    module: 'demos',
    model: Demo,
    dateKey: 'demoDate',
    single: false,
    followUp: true,
    mainFields: [
      { key: 'demoDate', label: 'Demo date', type: 'date', required: true },
      ...timeFields,
      { key: 'assignedTo', label: 'Assigned to', type: 'user', required: true },
      select('demoType', 'Demo type', opt(['online', 'Online'], ['at-customer', 'Offline (at customer)'], ['at-office', 'At office']), D),
      { key: 'meetingLink', label: 'Meeting link', type: 'text', format: 'url', max: URL_MAX, ...D },
      select('customerInterest', 'Customer interest', opt(['high', 'High'], ['medium', 'Medium'], ['low', 'Low'], ['not-interested', 'Not interested']), D),
      select('demoStatus', 'Status', opt(['scheduled', 'Scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['rescheduled', 'Rescheduled']), D),
      { key: 'attachment', label: 'Attachment', type: 'file' },
      notes('demoNotes', 'Demo Description'),
      notes('customerResponse', 'Customer Response'),
      notes('customerQuestions', 'Customer Questions'),
    ],
  },
  'data-update': {
    key: 'data-update',
    label: 'Data Update',
    plural: 'Data Updates',
    stage: 'data-update',
    module: 'data_updation',
    model: DataUpdate,
    dateKey: 'updateDate',
    single: true,
    followUp: false,
    mainFields: [
      { key: 'updateDate', label: 'Update date', type: 'date', required: true },
      ...timeFields,
      { key: 'assignedTo', label: 'Updated by', type: 'user', required: true },
      select('updateType', 'Update type', opt(['student-data', 'Student data'], ['staff-data', 'Staff data'], ['fee-data', 'Fee data'], ['other', 'Other']), D),
      select('updateStatus', 'Status', opt(['pending', 'Pending'], ['in-progress', 'In progress'], ['completed', 'Completed']), D),
      notes('updateNotes', 'Update Description'),
    ],
  },
  registration: {
    key: 'registration',
    label: 'Registration',
    plural: 'Registrations',
    stage: 'registration',
    module: 'registration',
    model: Registration,
    dateKey: 'registrationDate',
    single: false, // several registrations per lead
    followUp: false,
    wins: true, // after saving, the page offers to mark the lead Lead Won
    mainFields: [
      { key: 'registrationDate', label: 'Registration date', type: 'date', required: true },
      { key: 'registrationNumber', label: 'Registration number', type: 'text', required: true },
      // Left empty -> the lead's name.
      { key: 'customerName', label: 'Customer name', type: 'text', max: 100, fromLead: 'name', ...D },
      select('customerType', 'Customer type', opt(['new', 'New'], ['renewal', 'Renewal'], ['upgrade', 'Upgrade']), D),
      { key: 'mobileNumber', label: 'Mobile number', type: 'text', format: 'phone', max: PHONE_MAX, ...D },
      { key: 'amount', label: 'Registration fee', type: 'number', currency: true },
      { key: 'discount', label: 'Discount', type: 'number', currency: true },
      select('paymentType', 'Payment type', opt(['cash', 'Cash'], ['online', 'Online'], ['emi', 'EMI'])),
      select('paymentStatus', 'Payment status', opt(['paid', 'Paid'], ['partial', 'Partially paid'], ['pending', 'Pending']), D),
      select('registrationStatus', 'Registration status', opt(['pending', 'Pending'], ['completed', 'Completed'], ['cancelled', 'Cancelled']), D),
      { key: 'assignedTo', label: 'Assigned to', type: 'user', required: true },
      { key: 'invoice', label: 'Documents', type: 'file' },
      notes('notes', 'Notes'),
    ],
  },
  feedback: {
    key: 'feedback',
    label: 'Feedback',
    plural: 'Feedback',
    stage: 'feedback',
    module: 'feedback',
    model: Feedback,
    dateKey: 'feedbackDate',
    single: false,
    followUp: true,
    mainFields: [
      { key: 'feedbackDate', label: 'Feedback date', type: 'date', required: true },
      { key: 'assignedTo', label: 'Taken by', type: 'user', required: true },
      select('feedbackType', 'Feedback type', opt(['product', 'Product'], ['service', 'Service'], ['support', 'Support'], ['general', 'General']), D),
      { key: 'rating', label: 'Overall rating', type: 'rating', required: true },
      { key: 'productRating', label: 'Product rating', type: 'rating', ...D },
      { key: 'serviceRating', label: 'Service rating', type: 'rating', ...D },
      { key: 'attachment', label: 'Attachment', type: 'file' },
      notes('positiveFeedback', 'Positive Feedback'),
      notes('negativeFeedback', 'Negative Feedback'),
      notes('comments', 'Comments'),
    ],
  },
};

module.exports = { ACTIVITY_TYPES, VISIT_DETAIL_FIELDS, NOTES_MAX };
