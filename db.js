const mongoose = require("mongoose");

const { Schema } = mongoose;

/** Points applied when stats are logged. Tune later without changing collections. */
const SCORE_WEIGHTS = {
  miles: {
    car: 1,
    plane: 0.4,
    train: 1.2,
    bike: 3,
    foot: 5,
    other: 1,
  },
  firstCounty: 50,
  firstState: 200,
  firstMonument: 100,
};

const TRAVEL_MODES = ["car", "plane", "train", "bike", "foot", "other"];
const PLACE_KINDS = ["county", "state", "monument"];

const statsSubSchema = new Schema(
  {
    distanceTraveled: { type: Number, default: 0, min: 0 },
    countiesVisited: { type: Number, default: 0, min: 0 },
    statesVisited: { type: Number, default: 0, min: 0 },
    monumentsVisited: { type: Number, default: 0, min: 0 },
    milesCar: { type: Number, default: 0, min: 0 },
    milesFlown: { type: Number, default: 0, min: 0 },
    milesTrain: { type: Number, default: 0, min: 0 },
    milesBike: { type: Number, default: 0, min: 0 },
    milesFoot: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, trim: true },
    score: { type: Number, default: 0, min: 0, index: true },
    rank: { type: Number, default: null, min: 1 },
    stats: { type: statsSubSchema, default: () => ({}) },
  },
  { timestamps: true }
);

userSchema.index({ score: -1, username: 1 });

userSchema.statics.recomputeRanks = async function recomputeRanks() {
  const users = await this.find().sort({ score: -1, username: 1 }).select("_id").lean();
  const ops = users.map((user, index) => ({
    updateOne: {
      filter: { _id: user._id },
      update: { $set: { rank: index + 1 } },
    },
  }));
  if (ops.length) await this.bulkWrite(ops);
  return users.length;
};

userSchema.statics.leaderboard = function leaderboard(limit = 50) {
  return this.find()
    .sort({ score: -1, username: 1 })
    .limit(limit)
    .select("username displayName score rank stats")
    .lean();
};

const travelLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    occurredAt: { type: Date, required: true },
    title: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    mode: { type: String, enum: TRAVEL_MODES, required: true },
    distanceMiles: { type: Number, default: 0, min: 0 },
    counties: { type: [String], default: [] },
    states: { type: [String], default: [] },
    monuments: { type: [String], default: [] },
    scoreAwarded: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

travelLogSchema.index({ user: 1, occurredAt: -1 });

const placeVisitSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: PLACE_KINDS, required: true },
    name: { type: String, required: true, trim: true },
    firstLoggedAt: { type: Date, default: Date.now },
    travelLog: { type: Schema.Types.ObjectId, ref: "TravelLog" },
  },
  { timestamps: true }
);

placeVisitSchema.index({ user: 1, kind: 1, name: 1 }, { unique: true });
placeVisitSchema.index({ user: 1, kind: 1 });

const MODE_TO_STAT = {
  car: "milesCar",
  plane: "milesFlown",
  train: "milesTrain",
  bike: "milesBike",
  foot: "milesFoot",
};

function normalizeNames(names = []) {
  const seen = new Set();
  const out = [];
  for (const raw of names) {
    const name = String(raw || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function scoreForMiles(mode, miles) {
  const weight = SCORE_WEIGHTS.miles[mode] ?? SCORE_WEIGHTS.miles.other;
  return miles * weight;
}

/**
 * Apply a travel log to unique visits, user totals, and score.
 * Call after saving a TravelLog document.
 */
async function applyTravelLog(travelLog) {
  const User = mongoose.model("User");
  const PlaceVisit = mongoose.model("PlaceVisit");

  const counties = normalizeNames(travelLog.counties);
  const states = normalizeNames(travelLog.states);
  const monuments = normalizeNames(travelLog.monuments);
  const miles = Number(travelLog.distanceMiles) || 0;

  const candidates = [
    ...counties.map((name) => ({ kind: "county", name, points: SCORE_WEIGHTS.firstCounty })),
    ...states.map((name) => ({ kind: "state", name, points: SCORE_WEIGHTS.firstState })),
    ...monuments.map((name) => ({ kind: "monument", name, points: SCORE_WEIGHTS.firstMonument })),
  ];

  let newCounties = 0;
  let newStates = 0;
  let newMonuments = 0;
  let placePoints = 0;

  for (const place of candidates) {
    try {
      await PlaceVisit.create({
        user: travelLog.user,
        kind: place.kind,
        name: place.name,
        firstLoggedAt: travelLog.occurredAt,
        travelLog: travelLog._id,
      });
      placePoints += place.points;
      if (place.kind === "county") newCounties += 1;
      if (place.kind === "state") newStates += 1;
      if (place.kind === "monument") newMonuments += 1;
    } catch (err) {
      if (err && err.code === 11000) continue;
      throw err;
    }
  }

  const milePoints = scoreForMiles(travelLog.mode, miles);
  const scoreAwarded = milePoints + placePoints;
  const mileField = MODE_TO_STAT[travelLog.mode];

  const inc = {
    score: scoreAwarded,
    "stats.distanceTraveled": miles,
    "stats.countiesVisited": newCounties,
    "stats.statesVisited": newStates,
    "stats.monumentsVisited": newMonuments,
  };
  if (mileField) inc[`stats.${mileField}`] = miles;

  await User.updateOne({ _id: travelLog.user }, { $inc: inc });
  await mongoose.model("TravelLog").updateOne({ _id: travelLog._id }, { $set: { scoreAwarded } });

  return { scoreAwarded, newCounties, newStates, newMonuments };
}

async function connect(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error("Set MONGODB_URI (for example mongodb://127.0.0.1:27017/travel-log)");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  return mongoose.connection;
}

const User = mongoose.models.User || mongoose.model("User", userSchema);
const TravelLog = mongoose.models.TravelLog || mongoose.model("TravelLog", travelLogSchema);
const PlaceVisit = mongoose.models.PlaceVisit || mongoose.model("PlaceVisit", placeVisitSchema);

module.exports = {
  mongoose,
  connect,
  User,
  TravelLog,
  PlaceVisit,
  SCORE_WEIGHTS,
  TRAVEL_MODES,
  PLACE_KINDS,
  applyTravelLog,
};


