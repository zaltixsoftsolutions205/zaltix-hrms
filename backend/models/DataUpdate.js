const mongoose = require("mongoose");
const { makeActivitySchema, notes, choice } = require("./activityBase");

// The lead's data update (one per lead). assignedTo = "Updated by".
module.exports = mongoose.model("DataUpdate", makeActivitySchema({
  dateKey: "updateDate",
  single: true,
  extra: {
    updateType: choice(["student-data", "staff-data", "fee-data", "other"]),
    updateStatus: choice(["pending", "in-progress", "completed"]),
    updateNotes: notes(), // "Update Description"
  },
}));
