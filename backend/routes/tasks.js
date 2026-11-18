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
/**
 * @swagger
 * /api/tasks:
 *   get:
 *     summary: Get tasks
 *     tags:
 *       - Tasks
 *     description: "Module access: tasks,view"
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.get("/", protect, moduleAccess("tasks", "view"), getTasks);
/**
 * @swagger
 * /api/tasks/summary:
 *   get:
 *     summary: Get task summary
 *     tags:
 *       - Tasks
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 */
router.get("/summary", protect, getTaskSummary);

// GET /api/tasks/:id
/**
 * @swagger
 * /api/tasks/{id}:
 *   get:
 *     summary: Get task
 *     tags:
 *       - Tasks
 *     description: "Module access: tasks,view"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
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
/**
 * @swagger
 * /api/tasks/import:
 *   post:
 *     summary: Import tasks
 *     tags:
 *       - Tasks
 *     description: "Module access: tasks,edit"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
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
/**
 * @swagger
 * /api/tasks:
 *   post:
 *     summary: Create task
 *     tags:
 *       - Tasks
 *     description: "Module access: tasks,edit"
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 */
router.post("/", protect, moduleAccess("tasks", "edit"), taskAttachmentUpload, createTask);
/*
|--------------------------------------------------------------------------
| UPDATE TASK
|--------------------------------------------------------------------------
*/
/**
 * @swagger
 * /api/tasks/{id}:
 *   put:
 *     summary: Update task
 *     tags:
 *       - Tasks
 *     description: "Module access: tasks,edit"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put("/:id", protect, moduleAccess("tasks", "edit"), canModifyTask, taskAttachmentUpload, updateTask);
/*
|--------------------------------------------------------------------------
| DELETE TASK
|--------------------------------------------------------------------------
*/
/**
 * @swagger
 * /api/tasks/{id}:
 *   delete:
 *     summary: Delete task
 *     tags:
 *       - Tasks
 *     description: "Module access: tasks,edit"
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Not authorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete("/:id", protect, moduleAccess("tasks", "edit"), canModifyTask, deleteTask);


module.exports = router;