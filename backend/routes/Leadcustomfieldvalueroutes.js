const express = require('express');
// mergeParams: true lets this router read :leadId from wherever it's mounted
// (see the app.js mount line in the README below).
const router = express.Router({ mergeParams: true });

// ASSUMPTION — same auth middleware as leadCustomFieldRoutes.js.
const { protect } = require('../middleware/auth');

const { getLeadCustomFieldValues, getLeadCustomFieldValue, upsertLeadCustomFieldValue, deleteLeadCustomFieldValue, } = require('../controllers/Leadcustomfieldvaluecontroller');

router.use(protect);

router.get('/', getLeadCustomFieldValues);
router.get('/:fieldId', getLeadCustomFieldValue);
router.put('/:fieldId', upsertLeadCustomFieldValue);
router.delete('/:fieldId', deleteLeadCustomFieldValue);

module.exports = router;