const express = require("express");
const router = express.Router();

const { createTask, importTasks, getTasks, getTask, updateTask, deleteTask,getTaskSummary,} = require("../controllers/taskController");
const { protect } = require("../middleware/auth");
const { moduleAccess, canModifyTask, } = require("../middleware/roleCheck");
const { taskAttachmentUpload } = require("../middleware/taskUpload");

// Excel import middleware
const { uploadTaskExcel, importTasksFromExcel,  } = require("../middleware/taskExcelImport");


/*
|--------------------------------------------------------------------------
| TASK ROUTES
|--------------------------------------------------------------------------
*/


/*
|--------------------------------------------------------------------------
| VIEW TASKS
|--------------------------------------------------------------------------
*/

// GET /api/tasks
router.get("/", protect, moduleAccess("tasks", "view"), getTasks);
router.get("/summary", protect, getTaskSummary);

// GET /api/tasks/:id
router.get("/:id", protect, moduleAccess("tasks", "view"), getTask);

/*
|--------------------------------------------------------------------------
| EXCEL IMPORT
|--------------------------------------------------------------------------
|
| POST /api/tasks/import
|
| Flow:
|
| Request
|   ↓
| protect
|   ↓
| tasks -> edit permission
|   ↓
| uploadTaskExcel
|   ↓
| importTasksFromExcel
|   ↓
| req.importedTasks
|   ↓
| importTasks
|   ↓
| createTaskRecord()
|
|--------------------------------------------------------------------------
*/
router.post("/import", protect, moduleAccess("tasks", "edit"), uploadTaskExcel, importTasksFromExcel, importTasks);
/*
|--------------------------------------------------------------------------
| CREATE TASK
|--------------------------------------------------------------------------
|
| POST /api/tasks
|
| Normal frontend task creation.
|
|--------------------------------------------------------------------------
*/
router.post("/", protect, moduleAccess("tasks", "edit"), taskAttachmentUpload, createTask);
/*
|--------------------------------------------------------------------------
| UPDATE TASK
|--------------------------------------------------------------------------
*/
router.put("/:id", protect, moduleAccess("tasks", "edit"), canModifyTask, taskAttachmentUpload, updateTask);
/*
|--------------------------------------------------------------------------
| DELETE TASK
|--------------------------------------------------------------------------
*/
router.delete("/:id", protect, moduleAccess("tasks", "edit"), canModifyTask, deleteTask);


module.exports = router;