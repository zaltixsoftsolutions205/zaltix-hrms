const mongoose = require("mongoose");
const { makeActivitySchema, text, notes, choice, fileField } = require("./activityBase");

// A demo given to a lead (many per lead).
module.exports = mongoose.model("Demo", makeActivitySchema({
  dateKey: "demoDate",
  extra: {
    demoType: choice(["online", "at-customer", "at-office"]),
    meetingLink: text(500),
    customerInterest: choice(["high", "medium", "low", "not-interested"]),
    demoStatus: choice(["scheduled", "completed", "cancelled", "rescheduled"]),
    attachment: fileField(),
    demoNotes: notes(), // "Demo Description"
    customerResponse: notes(),
    customerQuestions: notes(),
  },
}));
