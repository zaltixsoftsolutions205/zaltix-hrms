/**
 * Module Tree of a project: module cards + links between them.
 * Every handler runs after loadProjectWithAccess, so req.project and
 * req.projectAccess are set, and the route already checked moduleTree access.
 */
const mongoose = require("mongoose");
const ProjectModule = require("../models/ProjectModule");
const Task = require("../models/Task");
const Plan = require("../models/Plan");

const idOf = (v) => (v ? String(v._id || v) : null);

const LEAD_FIELDS = "name employeeId profilePicture role";

const toDTO = (m) => ({
    _id: m._id,
    name: m.name,
    description: m.description,
    color: m.color,
    status: m.status,
    lead: m.lead && m.lead._id ? { _id: m.lead._id, name: m.lead.name, employeeId: m.lead.employeeId, profilePicture: m.lead.profilePicture } : m.lead || null,
    position: { x: m.position?.x || 0, y: m.position?.y || 0 },
    links: (m.links || []).map((l) => ({ _id: l._id, target: l.target, label: l.label || "" })),
    updatedAt: m.updatedAt,
});

/** The lead of a module must be the project lead or a project member. */
const isProjectPerson = (project, userId) =>
    idOf(project.manager) === String(userId) || (project.teamMembers || []).some((m) => idOf(m) === String(userId));

const finite = (n) => typeof n === "number" && Number.isFinite(n);

const handleError = (res, label, error) => {
    if (error && error.code === 11000) {
        return res.status(400).json({ success: false, message: "A module with this name already exists in the project." });
    }
    if (error && error.name === "ValidationError") {
        return res.status(400).json({ success: false, message: Object.values(error.errors).map((e) => e.message).join(" ") });
    }
    console.error(`${label}:`, error);
    return res.status(500).json({ success: false, message: "Server Error" });
};

const findModule = async (req, res) => {
    const { moduleId } = req.params;
    if (!mongoose.isValidObjectId(moduleId)) {
        res.status(400).json({ success: false, message: "Invalid module id." });
        return null;
    }
    const mod = await ProjectModule.findOne({ _id: moduleId, project: req.project._id });
    if (!mod) {
        res.status(404).json({ success: false, message: "Module not found." });
        return null;
    }
    return mod;
};

// GET /api/projects/:projectId/modules
exports.listModules = async (req, res) => {
    try {
        const modules = await ProjectModule.find({ project: req.project._id })
            .populate("lead", LEAD_FIELDS)
            .sort({ createdAt: 1 });

        // Open work per module, for the card badges (private items included in
        // the counts only — no titles are exposed here).
        const rows = await Task.aggregate([
            { $match: { project: new mongoose.Types.ObjectId(String(req.project._id)), module: { $ne: null }, isActive: { $ne: false } } },
            {
                $group: {
                    _id: { module: "$module", kind: { $ifNull: ["$kind", "task"] } },
                    total: { $sum: 1 },
                    open: { $sum: { $cond: [{ $in: ["$status", ["completed", "cancelled"]] }, 0, 1] } },
                },
            },
        ]);
        const counts = new Map();
        rows.forEach((r) => {
            const key = String(r._id.module);
            if (!counts.has(key)) counts.set(key, { task: { total: 0, open: 0 }, bug: { total: 0, open: 0 }, milestone: { total: 0, open: 0 } });
            counts.get(key)[r._id.kind] = { total: r.total, open: r.open };
        });

        return res.json({
            success: true,
            project: { _id: req.project._id, name: req.project.name },
            access: req.projectAccess,
            modules: modules.map((m) => ({
                ...toDTO(m),
                counts: counts.get(String(m._id)) || { task: { total: 0, open: 0 }, bug: { total: 0, open: 0 }, milestone: { total: 0, open: 0 } },
            })),
        });
    } catch (error) {
        return handleError(res, "List Modules", error);
    }
};

// POST /api/projects/:projectId/modules
exports.createModule = async (req, res) => {
    try {
        const { name, description, color, status, lead, position } = req.body;
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: "Module name is required." });
        }
        if (lead && !isProjectPerson(req.project, lead)) {
            return res.status(400).json({ success: false, message: "The module lead must be the project lead or a project member." });
        }
        const mod = await ProjectModule.create({
            project: req.project._id,
            name: String(name).trim(),
            description: description || "",
            color: color || undefined,
            status: status || undefined,
            lead: lead || null,
            position: { x: finite(position?.x) ? position.x : 0, y: finite(position?.y) ? position.y : 0 },
            createdBy: req.user._id,
        });
        await mod.populate("lead", LEAD_FIELDS);
        return res.status(201).json({ success: true, message: "Module created.", module: toDTO(mod) });
    } catch (error) {
        return handleError(res, "Create Module", error);
    }
};

// PUT /api/projects/:projectId/modules/:moduleId
exports.updateModule = async (req, res) => {
    try {
        const mod = await findModule(req, res);
        if (!mod) return undefined;
        const { name, description, color, status, lead, position } = req.body;

        if (name !== undefined) {
            if (!String(name).trim()) return res.status(400).json({ success: false, message: "Module name is required." });
            mod.name = String(name).trim();
        }
        if (description !== undefined) mod.description = description;
        if (color !== undefined) mod.color = color;
        if (status !== undefined) mod.status = status;
        if (lead !== undefined) {
            if (lead && !isProjectPerson(req.project, lead)) {
                return res.status(400).json({ success: false, message: "The module lead must be the project lead or a project member." });
            }
            mod.lead = lead || null;
        }
        if (position && finite(position.x) && finite(position.y)) {
            mod.position = { x: position.x, y: position.y };
        }
        await mod.save();
        await mod.populate("lead", LEAD_FIELDS);
        return res.json({ success: true, message: "Module updated.", module: toDTO(mod) });
    } catch (error) {
        return handleError(res, "Update Module", error);
    }
};

// DELETE /api/projects/:projectId/modules/:moduleId
exports.deleteModule = async (req, res) => {
    try {
        const mod = await findModule(req, res);
        if (!mod) return undefined;
        const [itemCount, planCount] = await Promise.all([
            Task.countDocuments({ module: mod._id, isActive: { $ne: false } }),
            Plan.countDocuments({ module: mod._id }),
        ]);
        if (itemCount || planCount) {
            return res.status(409).json({
                success: false,
                message: `This module still has ${itemCount} item(s) and ${planCount} plan(s). Move or delete them first.`,
                itemCount,
                planCount,
            });
        }
        await ProjectModule.updateMany(
            { project: req.project._id, "links.target": mod._id },
            { $pull: { links: { target: mod._id } } }
        );
        await mod.deleteOne();
        return res.json({ success: true, message: "Module deleted." });
    } catch (error) {
        return handleError(res, "Delete Module", error);
    }
};

// PUT /api/projects/:projectId/modules/positions  { positions: [{ id, x, y }] }
exports.savePositions = async (req, res) => {
    try {
        const positions = Array.isArray(req.body.positions) ? req.body.positions : [];
        const ops = positions
            .filter((p) => p && mongoose.isValidObjectId(p.id) && finite(p.x) && finite(p.y))
            .slice(0, 500)
            .map((p) => ({
                updateOne: {
                    filter: { _id: p.id, project: req.project._id },
                    update: { $set: { "position.x": Math.round(p.x), "position.y": Math.round(p.y) } },
                },
            }));
        if (!ops.length) return res.status(400).json({ success: false, message: "No valid positions sent." });
        const result = await ProjectModule.bulkWrite(ops, { ordered: false });
        return res.json({ success: true, updated: result.modifiedCount });
    } catch (error) {
        return handleError(res, "Save Module Positions", error);
    }
};

// POST /api/projects/:projectId/modules/:moduleId/links  { target, label }
exports.addLink = async (req, res) => {
    try {
        const mod = await findModule(req, res);
        if (!mod) return undefined;
        const { target, label } = req.body;
        if (!mongoose.isValidObjectId(target)) {
            return res.status(400).json({ success: false, message: "A valid target module is required." });
        }
        if (String(target) === String(mod._id)) {
            return res.status(400).json({ success: false, message: "A module cannot link to itself." });
        }
        const targetExists = await ProjectModule.exists({ _id: target, project: req.project._id });
        if (!targetExists) {
            return res.status(400).json({ success: false, message: "Target module is not in this project." });
        }
        if (mod.links.some((l) => String(l.target) === String(target))) {
            return res.status(400).json({ success: false, message: "These modules are already linked." });
        }
        mod.links.push({ target, label: label || "" });
        await mod.save();
        const link = mod.links[mod.links.length - 1];
        return res.status(201).json({ success: true, message: "Link added.", link: { _id: link._id, source: mod._id, target: link.target, label: link.label } });
    } catch (error) {
        return handleError(res, "Add Module Link", error);
    }
};

// DELETE /api/projects/:projectId/modules/:moduleId/links/:linkId
exports.removeLink = async (req, res) => {
    try {
        const mod = await findModule(req, res);
        if (!mod) return undefined;
        const before = mod.links.length;
        mod.links = mod.links.filter((l) => String(l._id) !== String(req.params.linkId));
        if (mod.links.length === before) {
            return res.status(404).json({ success: false, message: "Link not found." });
        }
        await mod.save();
        return res.json({ success: true, message: "Link removed." });
    } catch (error) {
        return handleError(res, "Remove Module Link", error);
    }
};
