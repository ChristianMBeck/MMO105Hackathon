const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    date: { type: Date, required: true, default: Date.now },
    title: { type: String, trim: true, default: "", maxlength: 120 },
    notes: { type: String, trim: true, default: "", maxlength: 2000 },
    milesInCar: { type: Number, default: 0, min: 0 },
    milesFlown: { type: Number, default: 0, min: 0 },
    milesInTrain: { type: Number, default: 0, min: 0 },
    milesOnBike: { type: Number, default: 0, min: 0 },
    milesOnFoot: { type: Number, default: 0, min: 0 },
    counties: { type: [String], default: [] },
    states: { type: [String], default: [] },
    monuments: { type: [String], default: [] },
    distanceAdded: { type: Number, default: 0, min: 0 },
    scoreAdded: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

tripSchema.index({ user: 1, date: -1 });

module.exports = mongoose.models.Trip || mongoose.model("Trip", tripSchema);
