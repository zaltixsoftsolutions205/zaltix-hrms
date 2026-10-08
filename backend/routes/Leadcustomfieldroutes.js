const express = require('express');
const router = express.Router();

// ASSUMPTION — adjust these two import paths/names to match your project:
// `protect`   = your existing JWT auth middleware that sets req.user.
// `roleCheck` = the middleware exported from middleware/roleCheck.js (provided).
const { protect } = require('../middleware/auth');
const { roleCheck } = require('../middleware/roleCheck');

const {
  createLeadCustomField,
  getLeadCustomFields,
  getLeadCustomFieldById,
  updateLeadCustomField,
  deleteLeadCustomField,
  reorderLeadCustomFields,
} = require('../controllers/Leadcustomfieldcontroller');

router.use(protect);

// Everyone who can see Leads can see the column definitions.
router.get('/', getLeadCustomFields);
router.get('/:id', getLeadCustomFieldById);

// Defining/reordering/removing columns is a structural change to the Lead
// table — restricted to manager/admin. Adjust roles to taste.
router.post('/', roleCheck('manager', 'admin'), createLeadCustomField);
router.patch('/reorder', roleCheck('manager', 'admin'), reorderLeadCustomFields);
router.patch('/:id', roleCheck('manager', 'admin'), updateLeadCustomField);
router.delete('/:id', roleCheck('manager', 'admin'), deleteLeadCustomField);

module.exports = router;