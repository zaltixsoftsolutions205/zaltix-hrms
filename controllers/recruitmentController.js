const JobPosting = require('../models/JobPosting');
const Applicant  = require('../models/Applicant');
const Project    = require('../models/Project');

/* PROJECTS */

exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find().sort({ createdAt: -1 });
    const result = await Promise.all(projects.map(async (p) => {
      const jobs = await JobPosting.find({ project: p._id }).select('_id');
      const jobIds = jobs.map(j => j._id);
      const jobCount = jobs.length;
      const resumeCount = await Applicant.countDocuments({ jobPosting: { $in: jobIds } });
      const shortlisted = await Applicant.countDocuments({ jobPosting: { $in: jobIds }, status: 'shortlisted' });
      return { ...p.toObject(), jobCount, resumeCount, shortlisted };
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createProject = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ message: 'Project name required' });
    const project = await Project.create({ name, description, createdBy: req.user._id });
    res.status(201).json({ ...project.toObject(), jobCount: 0, resumeCount: 0, shortlisted: 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!project) return res.status(404).json({ message: 'Not found' });
    res.json(project);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteProject = async (req, res) => {
  try {
    await Project.findByIdAndDelete(req.params.id);
    await JobPosting.updateMany({ project: req.params.id }, { project: null });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* JOB POSTINGS */

exports.getJobPostings = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status)    filter.status  = req.query.status;
    if (req.query.projectId) filter.project = req.query.projectId;
    if (req.query.unassigned === 'true') filter.project = null;

    const jobs = await JobPosting.find(filter)
      .populate('createdBy', 'name')
      .populate('project', 'name')
      .sort({ createdAt: -1 });

    const jobsWithCount = await Promise.all(jobs.map(async (j) => {
      const total       = await Applicant.countDocuments({ jobPosting: j._id });
      const shortlisted = await Applicant.countDocuments({ jobPosting: j._id, status: 'shortlisted' });
      const joined      = await Applicant.countDocuments({ jobPosting: j._id, status: 'joined' });
      return { ...j.toObject(), applicantCount: total, shortlistedCount: shortlisted, joinedCount: joined };
    }));

    res.json(jobsWithCount);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createJobPosting = async (req, res) => {
  try {
    const { title, department, location, type, description, requirements, openings, project } = req.body;
    if (!title) return res.status(400).json({ message: 'Title required' });
    const job = await JobPosting.create({
      title, department, location, type, description, requirements,
      openings: openings || 1,
      project:  project || null,
      createdBy: req.user._id,
    });
    res.status(201).json(job);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateJobPosting = async (req, res) => {
  try {
    const job = await JobPosting.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!job) return res.status(404).json({ message: 'Not found' });
    res.json(job);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteJobPosting = async (req, res) => {
  try {
    await JobPosting.findByIdAndDelete(req.params.id);
    await Applicant.deleteMany({ jobPosting: req.params.id });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* APPLICANTS */

exports.getApplicants = async (req, res) => {
  try {
    const filter = {};
    if (req.query.jobId)  filter.jobPosting = req.query.jobId;
    if (req.query.status) filter.status     = req.query.status;
    const applicants = await Applicant.find(filter)
      .populate('jobPosting', 'title department')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });
    res.json(applicants);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.createApplicant = async (req, res) => {
  try {
    const { jobPosting, name, status, yearsOfExperience } = req.body;
    if (!jobPosting || !name) return res.status(400).json({ message: 'Job posting and name required' });
    const resumeUrl = req.file ? 'uploads/resumes/' + req.file.filename : '';
    const applicant = await Applicant.create({
      jobPosting, name,
      yearsOfExperience: yearsOfExperience != null && yearsOfExperience !== '' ? Number(yearsOfExperience) : null,
      resumeUrl,
      status: status || 'interested',
      createdBy: req.user._id,
    });
    await applicant.populate('jobPosting', 'title department');
    res.status(201).json(applicant);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const applicant = await Applicant.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('jobPosting', 'title department');
    if (!applicant) return res.status(404).json({ message: 'Not found' });
    res.json(applicant);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.deleteApplicant = async (req, res) => {
  try {
    await Applicant.findByIdAndDelete(req.params.id);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

/* STATS */

exports.getStats = async (req, res) => {
  try {
    const jobFilter = {};
    const appFilter = {};
    if (req.query.projectId) {
      jobFilter.project = req.query.projectId;
      const jobs = await JobPosting.find({ project: req.query.projectId }).select('_id');
      appFilter.jobPosting = { $in: jobs.map(j => j._id) };
    }
    const totalJobs       = await JobPosting.countDocuments({ ...jobFilter, status: 'open' });
    const totalApplicants = await Applicant.countDocuments(appFilter);
    const interested      = await Applicant.countDocuments({ ...appFilter, status: 'interested' });
    const notInterested   = await Applicant.countDocuments({ ...appFilter, status: 'not-interested' });
    const shortlisted     = await Applicant.countDocuments({ ...appFilter, status: 'shortlisted' });
    const processed       = await Applicant.countDocuments({ ...appFilter, status: 'processed' });
    const rejected        = await Applicant.countDocuments({ ...appFilter, status: 'rejected' });
    const onboarded       = await Applicant.countDocuments({ ...appFilter, status: 'onboarded' });
    const joined          = await Applicant.countDocuments({ ...appFilter, status: 'joined' });
    res.json({ totalJobs, totalApplicants, interested, notInterested, shortlisted, processed, rejected, onboarded, joined });
  } catch (err) { res.status(500).json({ message: err.message }); }
};
