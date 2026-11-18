// Minimal async wrapper — swap for the project's existing asyncHandler if one exists.
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;