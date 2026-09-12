const mongoose = require("mongoose");
const { emptyStats } = require("../config/scoring");

const travelStatsSchema = new mongoose.Schema(
  {
    distanceTraveled: { type: Number, default: 0, min: 0 },
    countiesVisited: { type: Number, default: 0, min: 0 },
    statesVisited: { type: Number, default: 0, min: 0 },
    monumentsVisited: { type: Number, default: 0, min: 0 },
    milesInCar: { type: Number, default: 0, min: 0 },
    milesFlown: { type: Number, default: 0, min: 0 },
    milesInTrain: { type: Number, default: 0, min: 0 },
    milesOnBike: { type: Number, default: 0, min: 0 },
    milesOnFoot: { type: Number, default: 0, min: 0 },
    score: { type: Number, default: 0, min: 0, index: true },
    counties: { type: [String], default: [] },
    states: { type: [String], default: [] },
    monuments: { type: [String], default: [] }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32
    },
    displayName: { type: String, required: true, trim: true, maxlength: 64 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    passwordHash: { type: String, required: true },
    stats: { type: travelStatsSchema, default: emptyStats },
    rank: { type: Number, default: null, index: true }
  },
  { timestamps: true }
);

userSchema.index({ "stats.score": -1, "stats.distanceTraveled": -1 });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
