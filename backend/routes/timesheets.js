const express = require('express');
const router = express.Router();
const {
  submitTimesheet,
  getMyTimesheets,
  addEntry,
  updateEntry,
  deleteEntry,
  saveDailyUpdate,
  getCalendarMonth,
  getDayDetail,
  getTeamView,
  getOrgView,
  getWorkCategoryAnalytics,
  getAttendanceComparison,
  getReportsData,
  downloadReportPDF,
  getWeeklySummary,
  downloadWeeklyReportPDF,
  getMyOverdueTasks,
  getMyWeek,
  getApprovals,
  reviewTimesheet,
} = require('../controllers/timesheetController');
const { protect } = require('../middleware/auth');
const { moduleAccess, roleCheck } = require('../middleware/roleCheck');

router.use(protect);

// Self-service — gated by the existing 'timesheets' module key (every non-admin
// already has baseline view+edit on it, see constants/modules.js).
router.get('/my', moduleAccess('timesheets', 'view'), getMyTimesheets);
router.get('/calendar', moduleAccess('timesheets', 'view'), getCalendarMonth);
router.get('/day/:date', moduleAccess('timesheets', 'view'), getDayDetail);
router.get('/analytics/work-category', moduleAccess('timesheets', 'view'), getWorkCategoryAnalytics);
router.get('/attendance-comparison', moduleAccess('timesheets', 'view'), getAttendanceComparison);
router.get('/my-overdue', moduleAccess('timesheets', 'view'), getMyOverdueTasks);
router.get('/my-week', moduleAccess('timesheets', 'view'), getMyWeek);

// Self-service weekly report (own week only, with a plain-language intelligence summary)
router.get('/weekly-summary', moduleAccess('timesheets', 'view'), getWeeklySummary);
router.get('/weekly-summary/pdf', moduleAccess('timesheets', 'view'), downloadWeeklyReportPDF);

router.post('/', moduleAccess('timesheets', 'edit'), submitTimesheet);
router.post('/entry', moduleAccess('timesheets', 'edit'), addEntry);
router.put('/:timesheetId/entry/:entryId', moduleAccess('timesheets', 'edit'), updateEntry);
router.delete('/:timesheetId/entry/:entryId', moduleAccess('timesheets', 'edit'), deleteEntry);
router.post('/daily-update', moduleAccess('timesheets', 'edit'), saveDailyUpdate);

// Manager Team View — baseline view access plus an inline department-headship
// check inside the controller (dept-head isn't a static role string).
router.get('/team', moduleAccess('timesheets', 'view'), getTeamView);

// HR/Admin Org View + Reports — hr/admin ARE real role strings, so a plain
// roleCheck is the right tool here.
router.get('/org', roleCheck('hr', 'admin'), getOrgView);
router.get('/reports', roleCheck('hr', 'admin'), getReportsData);
router.get('/reports/pdf', roleCheck('hr', 'admin'), downloadReportPDF);

// Legacy review flow — unchanged, left intact. Authorization enforced
// per-record inside the controller (a technical lead is a regular employee by role).
router.get('/approvals', getApprovals);
router.put('/:id/review', reviewTimesheet);

module.exports = router;
