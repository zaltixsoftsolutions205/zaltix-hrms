const mongoose = require("mongoose");
const { makeActivitySchema, notes, choice, rating, fileField } = require("./activityBase");

// Feedback taken from a lead (many per lead).
module.exports = mongoose.model("Feedback", makeActivitySchema({
  dateKey: "feedbackDate",
  extra: {
    feedbackType: choice(["product", "service", "support", "general"]),
    rating: rating(true), // "Overall rating"
    productRating: rating(),
    serviceRating: rating(),
    attachment: fileField(),
    positiveFeedback: notes(),
    negativeFeedback: notes(),
    comments: notes(),
  },
}));
