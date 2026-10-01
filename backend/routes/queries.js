const express     = require('express');
const router      = express.Router();
const { protect } = require('../middleware/auth');
const { moduleAccess } = require('../middleware/roleCheck');
const ctrl        = require('../controllers/queryController');

// Gated by the per-employee "query_management" module (admin bypasses,
// sales gets it via role default). Writes require edit access.
const canView = moduleAccess('query_management', 'view');
const canEdit = moduleAccess('query_management', 'edit');

router.get('/',       protect, canView, ctrl.getQueries);
router.post('/',      protect, canEdit, ctrl.createQuery);
router.put('/:id',    protect, canEdit, ctrl.updateQuery);
router.delete('/:id', protect, canEdit, ctrl.deleteQuery);

module.exports = router;
