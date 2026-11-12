const mongoose = require("mongoose");
const { makeActivitySchema, text, notes, choice, fileField } = require("./activityBase");

/**
 * A registration of a lead (the step that makes it a customer). A lead can
 * have several.
 * `amount` is shown as "Registration fee"; `invoice` (the uploaded file) as "Documents".
 */
const Registration = mongoose.model("Registration", makeActivitySchema({
  dateKey: "registrationDate",
  extra: {
    registrationNumber: { type: String, required: true, trim: true, maxlength: 100 },
    customerName: text(100),
    customerType: choice(["new", "renewal", "upgrade"]),
    mobileNumber: text(10),
    amount: { type: Number, min: 0, default: null },
    discount: { type: Number, min: 0, default: null },
    paymentType: choice(["cash", "online", "emi"]),
    paymentStatus: choice(["paid", "partial", "pending"]),
    registrationStatus: choice(["pending", "completed", "cancelled"]),
    invoice: fileField(),
    notes: notes(),
  },
}));

// Registrations were one-per-lead before (unique index lead_1). Drop that index once so
// a lead can hold several; the schema's own indexes are created as usual.
mongoose.connection.once("open", () => {
  Registration.collection.indexes()
    .then((indexes) => (indexes.some((i) => i.name === "lead_1" && i.unique) ? Registration.collection.dropIndex("lead_1") : null))
    .catch(() => {});
});

module.exports = Registration;
