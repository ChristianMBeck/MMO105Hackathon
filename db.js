const mongoose = require("mongoose");
const famous = require("./data/famous.json");
const { canonicalCountryName, countryMatchKeys } = require("./lib/geo");

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
  firstCountry: 150,
  firstMonument: 100,
};

const TRAVEL_MODES = ["car", "plane", "train", "bike", "foot", "other"];
const PLACE_KINDS = ["county", "state", "country", "monument"];

const STAT_META = [
  { key: "distanceTraveled", label: "Distance traveled", icon: "signpost-2", group: "coverage", unit: "mi" },
  { key: "countriesVisited", label: "Countries visited", icon: "globe2", group: "coverage", unit: "" },
  { key: "countiesVisited", label: "Counties visited", icon: "geo-alt", group: "coverage", unit: "" },
  { key: "statesVisited", label: "States visited", icon: "flag", group: "coverage", unit: "" },
  { key: "monumentsVisited", label: "Monuments visited", icon: "bank", group: "coverage", unit: "" },
  { key: "milesCar", label: "Miles in car", icon: "car-front", group: "mode", unit: "mi" },
  { key: "milesFlown", label: "Miles flown", icon: "airplane", group: "mode", unit: "mi" },
  { key: "milesTrain", label: "Miles in train", icon: "train-front", group: "mode", unit: "mi" },
  { key: "milesBike", label: "Miles on bike", icon: "bicycle", group: "mode", unit: "mi" },
  { key: "milesFoot", label: "Miles on foot", icon: "person-walking", group: "mode", unit: "mi" },
];

const WEIGHTS = {
  distanceTraveled: 0,
  countriesVisited: SCORE_WEIGHTS.firstCountry,
  countiesVisited: SCORE_WEIGHTS.firstCounty,
  statesVisited: SCORE_WEIGHTS.firstState,
  monumentsVisited: SCORE_WEIGHTS.firstMonument,
  milesCar: SCORE_WEIGHTS.miles.car,
  milesFlown: SCORE_WEIGHTS.miles.plane,
  milesTrain: SCORE_WEIGHTS.miles.train,
  milesBike: SCORE_WEIGHTS.miles.bike,
  milesFoot: SCORE_WEIGHTS.miles.foot,
};

const LADDER = [
  { key: "wanderer-1", name: "Wanderer", division: "I", label: "Wanderer I", minScore: 0, color: "#8b9cb3", ring: "rgba(139,156,179,.35)" },
  { key: "wanderer-2", name: "Wanderer", division: "II", label: "Wanderer II", minScore: 200, color: "#a9b8c9", ring: "rgba(169,184,201,.4)" },
  { key: "explorer-1", name: "Explorer", division: "I", label: "Explorer I", minScore: 500, color: "#3dd6c6", ring: "rgba(61,214,198,.4)" },
  { key: "explorer-2", name: "Explorer", division: "II", label: "Explorer II", minScore: 900, color: "#2ec4b6", ring: "rgba(46,196,182,.45)" },
  { key: "pathfinder", name: "Pathfinder", division: "", label: "Pathfinder", minScore: 1400, color: "#7c5cff", ring: "rgba(124,92,255,.45)" },
  { key: "voyager", name: "Voyager", division: "", label: "Voyager", minScore: 2200, color: "#ffb020", ring: "rgba(255,176,32,.45)" },
  { key: "odyssey", name: "Odyssey", division: "", label: "Odyssey", minScore: 3500, color: "#ff5d8f", ring: "rgba(255,93,143,.5)" },
];

const MODE_FROM_STAT = {
  milesCar: "car",
  milesFlown: "plane",
  milesTrain: "train",
  milesBike: "bike",
  milesFoot: "foot",
};

const SPORT_TO_MODE = {
  walk: "foot",
  hike: "foot",
  ride: "bike",
  drive: "car",
  train: "train",
  flight: "plane",
  paddle: "other",
  mixed: "other",
};

const statsSubSchema = new Schema(
  {
    distanceTraveled: { type: Number, default: 0, min: 0 },
    countriesVisited: { type: Number, default: 0, min: 0 },
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
    homeBase: { type: String, default: "", trim: true },
    avatarHue: { type: Number, min: 0, max: 360, default: 200 },
    bio: { type: String, default: "", trim: true, maxlength: 280 },
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
    countries: { type: [String], default: [] },
    monuments: { type: [String], default: [] },
    scoreAwarded: { type: Number, default: 0, min: 0 },
    sport: { type: String, enum: ["walk", "ride", "drive", "train", "flight", "hike", "paddle", "mixed"], default: "drive" },
    elevationFt: { type: Number, default: 0, min: 0 },
    movingSeconds: { type: Number, default: 0, min: 0 },
    startLocation: { type: String, default: "", trim: true },
    endLocation: { type: String, default: "", trim: true },
    privacy: { type: String, enum: ["everyone", "followers", "onlyme"], default: "everyone" },
    effort: { type: Number, default: 5, min: 1, max: 10 },
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
    famousId: { type: String, default: "", trim: true },
    country: { type: String, default: "", trim: true },
    lat: { type: Number, default: null },
    lon: { type: Number, default: null },
    distanceMeters: { type: Number, default: null, min: 0 },
    photoPath: { type: String, default: "", trim: true },
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

function findFamousByName(name) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  return famous.find((site) => String(site.name).toLowerCase() === key) || null;
}

function findFamousById(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  return famous.find((site) => site.id === key) || null;
}

function famousFieldsForMonument(name, famousId) {
  const site = findFamousById(famousId) || findFamousByName(name);
  if (!site) return {};
  return {
    famousId: site.id,
    country: site.country,
    lat: site.lat,
    lon: site.lon,
  };
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
  const inferredCountries = monuments
    .map((name) => findFamousByName(name)?.country)
    .filter(Boolean);
  const countries = normalizeNames([...(travelLog.countries || []), ...inferredCountries]).map(canonicalCountryName);
  const miles = Number(travelLog.distanceMiles) || 0;

  const candidates = [
    ...countries.map((name) => ({ kind: "country", name, points: SCORE_WEIGHTS.firstCountry })),
    ...counties.map((name) => ({ kind: "county", name, points: SCORE_WEIGHTS.firstCounty })),
    ...states.map((name) => ({ kind: "state", name, points: SCORE_WEIGHTS.firstState })),
    ...monuments.map((name) => ({ kind: "monument", name, points: SCORE_WEIGHTS.firstMonument })),
  ];

  let newCountries = 0;
  let newCounties = 0;
  let newStates = 0;
  let newMonuments = 0;
  let placePoints = 0;

  for (const place of candidates) {
    try {
      const extra = place.kind === "monument" ? famousFieldsForMonument(place.name) : {};
      await PlaceVisit.create({
        user: travelLog.user,
        kind: place.kind,
        name: place.name,
        firstLoggedAt: travelLog.occurredAt,
        travelLog: travelLog._id,
        ...extra,
      });
      placePoints += place.points;
      if (place.kind === "country") newCountries += 1;
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
    "stats.countriesVisited": newCountries,
    "stats.countiesVisited": newCounties,
    "stats.statesVisited": newStates,
    "stats.monumentsVisited": newMonuments,
  };
  if (mileField) inc[`stats.${mileField}`] = miles;

  await User.updateOne({ _id: travelLog.user }, { $inc: inc });
  await mongoose.model("TravelLog").updateOne({ _id: travelLog._id }, { $set: { scoreAwarded } });

  return { scoreAwarded, newCountries, newCounties, newStates, newMonuments };
}

function formatScore(value) {
  return Math.round(Number(value) || 0).toLocaleString("en-US");
}

function formatStat(key, value) {
  const meta = STAT_META.find((item) => item.key === key);
  const amount = Number(value) || 0;
  const rounded = meta && meta.unit === "mi" ? Math.round(amount * 10) / 10 : Math.round(amount);
  return meta && meta.unit === "mi" ? `${rounded.toLocaleString("en-US")} mi` : rounded.toLocaleString("en-US");
}

function rankFromScore(score) {
  const points = Number(score) || 0;
  let current = LADDER[0];
  let next = LADDER[1] || null;
  for (let i = 0; i < LADDER.length; i += 1) {
    if (points >= LADDER[i].minScore) {
      current = LADDER[i];
      next = LADDER[i + 1] || null;
    }
  }
  const span = next ? next.minScore - current.minScore : 1;
  const progress = next ? Math.min(1, Math.max(0, (points - current.minScore) / span)) : 1;
  return {
    ...current,
    progress,
    pointsToNext: next ? Math.max(0, next.minScore - points) : 0,
    next,
  };
}

function hueFromString(value) {
  let hue = 0;
  for (const char of String(value || "")) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return hue;
}

function parseNameList(raw) {
  return normalizeNames(String(raw || "").split(/[,;\n]+/));
}

function slugifyHandle(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  return slug || `traveler${Date.now().toString(36)}`;
}

function presentTraveler(user) {
  if (!user) return null;
  const doc = typeof user.toObject === "function" ? user.toObject() : { ...user };
  const displayName = doc.displayName || doc.username || "Traveler";
  const emptyStats = {};
  for (const meta of STAT_META) emptyStats[meta.key] = 0;
  return {
    ...doc,
    displayName,
    handle: doc.username,
    homeBase: doc.homeBase || "",
    bio: doc.bio || "",
    avatarHue: Number.isFinite(doc.avatarHue) ? doc.avatarHue : hueFromString(doc.username),
    initials: displayName.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || displayName.slice(0, 2).toUpperCase(),
    stats: { ...emptyStats, ...(doc.stats || {}) },
  };
}

function scoreFromStats(stats = {}) {
  let score = 0;
  for (const meta of STAT_META) {
    if (meta.key === "distanceTraveled") continue;
    score += (Number(stats[meta.key]) || 0) * (WEIGHTS[meta.key] || 0);
  }
  return score;
}

async function logTripFromForm(userId, body) {
  const counties = parseNameList(body.counties);
  const states = parseNameList(body.states);
  const countries = parseNameList(body.countries).map(canonicalCountryName);
  const monuments = parseNameList(body.monuments);
  const title = String(body.title || "").trim();
  const notes = String(body.note || body.notes || "").trim();
  const occurredAt = body.occurredOn ? new Date(body.occurredOn) : new Date();
  const modeMiles = Object.entries(MODE_FROM_STAT)
    .map(([statKey, mode]) => ({ mode, miles: Number(body[statKey]) || 0 }))
    .filter((entry) => entry.miles > 0);

  if (!modeMiles.length && !counties.length && !states.length && !countries.length && !monuments.length) {
    throw new Error("Add miles or at least one place to log a trip.");
  }

  const legs = modeMiles.length ? modeMiles : [{ mode: "other", miles: 0 }];
  let first = true;
  let totalAwarded = 0;
  for (const leg of legs) {
    const travelLog = await mongoose.model("TravelLog").create({
      user: userId,
      occurredAt,
      title,
      notes,
      mode: leg.mode,
      distanceMiles: leg.miles,
      counties: first ? counties : [],
      states: first ? states : [],
      countries: first ? countries : [],
      monuments: first ? monuments : [],
    });
    const result = await applyTravelLog(travelLog);
    totalAwarded += result.scoreAwarded;
    first = false;
  }
  await mongoose.model("User").recomputeRanks();
  return totalAwarded;
}

async function recordTripFromForm(userId, body) {
  const sport = SPORT_TO_MODE[body.sport] ? body.sport : "drive";
  const mode = SPORT_TO_MODE[sport];
  const miles = Math.max(0, Number(body.distance) || 0);
  const hours = Math.max(0, Number(body.hours) || 0);
  const minutes = Math.max(0, Number(body.minutes) || 0);
  const seconds = Math.max(0, Number(body.seconds) || 0);
  const title = String(body.title || "").trim();
  const notes = String(body.description || body.note || "").trim();
  const startLocation = String(body.from || "").trim();
  const endLocation = String(body.to || "").trim();

  const movingSeconds = hours * 3600 + minutes * 60 + seconds;

  if (!miles && !startLocation && !endLocation && !movingSeconds) {
    throw new Error("Start the timer, or add a distance / location, before saving.");
  }

  let occurredAt = body.date ? new Date(`${body.date}T${body.startTime || "12:00"}`) : new Date();
  if (Number.isNaN(occurredAt.getTime())) occurredAt = new Date();

  const travelLog = await mongoose.model("TravelLog").create({
    user: userId,
    occurredAt,
    title: title || `${sport} · ${miles || 0} mi`,
    notes,
    mode,
    sport,
    distanceMiles: miles,
    elevationFt: Math.max(0, Number(body.elevation) || 0),
    movingSeconds,
    startLocation,
    endLocation,
    privacy: ["everyone", "followers", "onlyme"].includes(body.privacy) ? body.privacy : "everyone",
    effort: Math.min(10, Math.max(1, Number(body.effort) || 5)),
  });
  const result = await applyTravelLog(travelLog);
  await mongoose.model("User").recomputeRanks();
  return result.scoreAwarded;
}

async function recordCountryVisit(userId, countryName, extras = {}) {
  const name = canonicalCountryName(countryName);
  if (!name) return { visit: null, newVisit: false };
  const PlaceVisit = mongoose.model("PlaceVisit");
  try {
    const visit = await PlaceVisit.create({
      user: userId,
      kind: "country",
      name,
      firstLoggedAt: extras.firstLoggedAt || new Date(),
      travelLog: extras.travelLog,
      country: name,
    });
    return { visit: visit.toObject(), newVisit: true };
  } catch (err) {
    if (err && err.code === 11000) {
      const visit = await PlaceVisit.findOne({ user: userId, kind: "country", name }).lean();
      return { visit, newVisit: false };
    }
    throw err;
  }
}

async function recordMonumentVisit(userId, payload) {
  const PlaceVisit = mongoose.model("PlaceVisit");
  const UserModel = mongoose.model("User");
  const photoFields = {
    famousId: payload.famousId || "",
    country: canonicalCountryName(payload.country || ""),
    lat: payload.lat,
    lon: payload.lon,
    distanceMeters: payload.distanceMeters,
    photoPath: payload.photoPath || "",
  };

  let newVisit = false;
  let visit;
  try {
    visit = await PlaceVisit.create({
      user: userId,
      kind: "monument",
      name: payload.name,
      firstLoggedAt: new Date(),
      ...photoFields,
    });
    visit = visit.toObject();
    newVisit = true;
  } catch (err) {
    if (err && err.code === 11000) {
      visit = await PlaceVisit.findOneAndUpdate(
        { user: userId, kind: "monument", name: payload.name },
        { $set: photoFields },
        { new: true }
      ).lean();
    } else {
      throw err;
    }
  }

  const countryResult = await recordCountryVisit(userId, photoFields.country);
  const inc = {};
  if (newVisit) {
    inc.score = (inc.score || 0) + SCORE_WEIGHTS.firstMonument;
    inc["stats.monumentsVisited"] = 1;
  }
  if (countryResult.newVisit) {
    inc.score = (inc.score || 0) + SCORE_WEIGHTS.firstCountry;
    inc["stats.countriesVisited"] = 1;
  }
  if (Object.keys(inc).length) {
    await UserModel.updateOne({ _id: userId }, { $inc: inc });
    await UserModel.recomputeRanks();
  }
  return { visit, newVisit };
}

async function listMonumentVisits(userId) {
  return mongoose.model("PlaceVisit").find({ user: userId, kind: "monument" }).sort({ updatedAt: -1 }).lean();
}

async function listMapData(userId) {
  const visits = await mongoose.model("PlaceVisit").find({ user: userId }).sort({ firstLoggedAt: -1 }).lean();
  const countriesByKey = new Map();
  const places = [];

  function addCountry(rawName, source) {
    const name = canonicalCountryName(rawName);
    if (!name) return;
    const key = name.toLowerCase();
    const existing = countriesByKey.get(key);
    const firstLoggedAt = source.firstLoggedAt || source.updatedAt || null;
    if (!existing) {
      countriesByKey.set(key, {
        name,
        matchKeys: countryMatchKeys(name),
        placeCount: 0,
        firstLoggedAt,
      });
      return;
    }
    if (firstLoggedAt && (!existing.firstLoggedAt || new Date(firstLoggedAt) < new Date(existing.firstLoggedAt))) {
      existing.firstLoggedAt = firstLoggedAt;
    }
  }

  for (const visit of visits) {
    if (visit.kind === "country") {
      addCountry(visit.name || visit.country, visit);
    }
    if (visit.kind !== "monument") continue;

    const site = findFamousById(visit.famousId) || findFamousByName(visit.name);
    const lat = Number.isFinite(visit.lat) ? visit.lat : site?.lat ?? null;
    const lon = Number.isFinite(visit.lon) ? visit.lon : site?.lon ?? null;
    const country = canonicalCountryName(visit.country || site?.country || "");
    if (country) addCountry(country, visit);
    if (lat == null || lon == null) continue;
    places.push({
      id: String(visit._id),
      name: visit.name,
      country,
      lat,
      lon,
      kind: visit.kind,
      photoPath: visit.photoPath || "",
      firstLoggedAt: visit.firstLoggedAt || visit.updatedAt || null,
    });
  }

  for (const place of places) {
    const country = countriesByKey.get(place.country.toLowerCase());
    if (country) country.placeCount += 1;
  }

  return {
    countries: [...countriesByKey.values()].sort((a, b) => a.name.localeCompare(b.name)),
    places: places.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

async function setUserStats(userId, body) {
  const stats = {};
  for (const meta of STAT_META) {
    stats[meta.key] = Math.max(0, Number(body[meta.key]) || 0);
  }
  const score = scoreFromStats(stats);
  await mongoose.model("User").updateOne({ _id: userId }, { $set: { stats, score } });
  await mongoose.model("User").recomputeRanks();
  return score;
}

<<<<<<< Updated upstream
=======
const DEMO_COUNTRIES = [
  "United States",
  "Canada",
  "Mexico",
  "Brazil",
  "Peru",
  "France",
  "Italy",
  "United Kingdom",
  "Spain",
  "Germany",
  "Portugal",
  "Greece",
  "Egypt",
  "Morocco",
  "India",
  "China",
  "Japan",
  "South Korea",
  "Thailand",
  "Australia",
];

const DEMO_MONUMENTS = [
  "Eiffel Tower",
  "Colosseum",
  "Big Ben",
  "Sagrada Família",
  "Brandenburg Gate",
  "Pyramids of Giza",
  "Christ the Redeemer",
  "Machu Picchu",
  "Sydney Opera House",
  "Taj Mahal",
];

const DEMO_MONUMENT_PHOTOS = {
  "Eiffel Tower": "demo-eiffel-tower.svg",
  Colosseum: "demo-colosseum.svg",
  "Big Ben": "demo-big-ben.svg",
  "Sagrada Família": "demo-sagrada-familia.svg",
  "Brandenburg Gate": "demo-brandenburg-gate.svg",
  "Pyramids of Giza": "demo-pyramids-giza.svg",
  "Christ the Redeemer": "demo-christ-redeemer.svg",
  "Machu Picchu": "demo-machu-picchu.svg",
  "Sydney Opera House": "demo-sydney-opera.svg",
  "Taj Mahal": "demo-taj-mahal.svg",
};

async function seedDemoMapForUser(userId) {
  const PlaceVisit = mongoose.model("PlaceVisit");
  const countries = await PlaceVisit.countDocuments({ user: userId, kind: "country" });
  const monuments = await PlaceVisit.countDocuments({ user: userId, kind: "monument" });
  if (countries < DEMO_COUNTRIES.length || monuments < DEMO_MONUMENTS.length) {
    await logTripFromForm(userId, {
      title: "Demo map coverage",
      occurredOn: "2025-06-15",
      countries: DEMO_COUNTRIES.join(", "),
      monuments: DEMO_MONUMENTS.join(", "),
    });
  }

  for (const [name, photoPath] of Object.entries(DEMO_MONUMENT_PHOTOS)) {
    const visit = await PlaceVisit.findOne({ user: userId, kind: "monument", name }).select("photoPath").lean();
    if (!visit) continue;
    const current = visit.photoPath || "";
    if (current && !/^https?:\/\//i.test(current) && !current.startsWith("demo-")) continue;
    await PlaceVisit.updateOne({ _id: visit._id }, { $set: { photoPath } });
  }
}

async function listFollowingIds(userId) {
  if (!userId) return [];
  const rows = await mongoose.model("Follow").find({ follower: userId }).select("followee").lean();
  return rows.map((row) => row.followee);
}

async function listFollowingLeaderboard(userId) {
  const followingIds = await listFollowingIds(userId);
  if (!followingIds.length) return [];
  const rows = await mongoose.model("User").find({ _id: { $in: followingIds } }).sort({ score: -1, username: 1 }).lean();
  return rows.map((row, index) => ({
    ...presentTraveler(row),
    place: index + 1,
  }));
}

async function followUser(followerId, followeeId) {
  if (String(followerId) === String(followeeId)) throw new Error("You cannot follow yourself.");
  const Follow = mongoose.model("Follow");
  const exists = await mongoose.model("User").exists({ _id: followeeId });
  if (!exists) throw new Error("Traveler not found.");
  await Follow.updateOne(
    { follower: followerId, followee: followeeId },
    { $setOnInsert: { follower: followerId, followee: followeeId } },
    { upsert: true }
  );
}

async function unfollowUser(followerId, followeeId) {
  await mongoose.model("Follow").deleteOne({ follower: followerId, followee: followeeId });
}

async function createSocialPost(userId, { body, place, photoPath }) {
  const text = String(body || "").trim().slice(0, 280);
  const where = String(place || "").trim().slice(0, 80);
  const photo = String(photoPath || "").trim();
  if (!text && !where && !photo) throw new Error("Add a note, place, or photo.");
  return mongoose.model("Post").create({
    user: userId,
    body: text,
    place: where,
    photoPath: photo,
  });
}

async function setTripPrivacy(userId, tripId, privacy) {
  if (!["everyone", "followers", "onlyme"].includes(privacy)) {
    throw new Error("Invalid privacy.");
  }
  const trip = await mongoose.model("TravelLog").findOne({ _id: tripId, user: userId });
  if (!trip) throw new Error("Trip not found.");
  trip.privacy = privacy;
  await trip.save();
  return trip;
}

function feedAuthor(user) {
  return presentTraveler(user);
}

function tripPlaces(trip) {
  return [...(trip.countries || []), ...(trip.states || []), ...(trip.monuments || [])];
}

async function listSocialFeed(userId, limit = 40) {
  const following = await listFollowingIds(userId);
  const authors = [userId, ...following];
  const [posts, trips] = await Promise.all([
    mongoose.model("Post").find({ user: { $in: authors } }).sort({ createdAt: -1 }).limit(limit).populate("user").lean(),
    mongoose.model("TravelLog").find({
      user: { $in: authors },
      privacy: { $in: ["followers", "everyone"] },
    }).sort({ occurredAt: -1 }).limit(limit).populate("user").lean(),
  ]);

  const items = [
    ...posts.map((post) => ({
      kind: "post",
      id: String(post._id),
      at: post.createdAt,
      author: feedAuthor(post.user),
      body: post.body || "",
      place: post.place || "",
      photoPath: post.photoPath || "",
    })),
    ...trips.map((trip) => ({
      kind: "trip",
      id: String(trip._id),
      at: trip.occurredAt || trip.createdAt,
      author: feedAuthor(trip.user),
      title: trip.title || "Trip",
      notes: trip.notes || "",
      places: tripPlaces(trip),
      miles: trip.distanceMiles || 0,
      mode: trip.mode || "",
      startLocation: trip.startLocation || "",
      endLocation: trip.endLocation || "",
    })),
  ];
  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return items.slice(0, limit);
}

async function listPeopleToFollow(userId, q = "") {
  const filter = { _id: { $ne: userId } };
  const query = String(q || "").trim();
  if (query) {
    const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ username: rx }, { displayName: rx }];
  }
  const users = await mongoose.model("User").find(filter).sort({ displayName: 1, username: 1 }).limit(12).lean();
  const following = new Set(
    (await mongoose.model("Follow").find({
      follower: userId,
      followee: { $in: users.map((user) => user._id) },
    }).select("followee").lean()).map((row) => String(row.followee))
  );
  return users.map((user) => ({
    ...presentTraveler(user),
    following: following.has(String(user._id)),
  }));
}

async function seedSocialDemo(jordanId) {
  const specs = [
    {
      displayName: "Maya Chen",
      handle: "maya",
      homeBase: "Taipei",
      posts: [
        { body: "Sunrise at Fushimi Inari. Empty path, no crowd.", place: "Kyoto", daysAgo: 2 },
        { body: "Night market run. Still thinking about the scallion pancakes.", place: "Taipei", daysAgo: 8 },
      ],
      trips: [
        { title: "Kyoto week", countries: "Japan", milesFoot: 28, occurredOn: "2026-08-22", notes: "Temples and trains." },
      ],
    },
    {
      displayName: "Kenji Sato",
      handle: "kenji",
      homeBase: "Osaka",
      posts: [
        { body: "Coast highway, almost no traffic.", place: "Big Sur", daysAgo: 4 },
      ],
      trips: [
        { title: "PCH drive", countries: "United States", states: "California", milesCar: 420, occurredOn: "2026-07-11", notes: "San Francisco to San Luis Obispo." },
      ],
    },
    {
      displayName: "Luca Rossi",
      handle: "luca",
      homeBase: "Milan",
      posts: [
        { body: "First time seeing the Alps from the train window.", place: "Innsbruck", daysAgo: 6 },
      ],
      trips: [
        { title: "Alpine rail", countries: "Austria, Italy", milesTrain: 310, occurredOn: "2026-06-03", notes: "Milan to Innsbruck." },
      ],
    },
  ];

  const Follow = mongoose.model("Follow");
  const Post = mongoose.model("Post");
  for (const spec of specs) {
    let user = await mongoose.model("User").findOne({ username: spec.handle });
    if (!user) {
      user = await createTraveler({
        displayName: spec.displayName,
        handle: spec.handle,
        homeBase: spec.homeBase,
      });
    }
    if (!(await Post.countDocuments({ user: user._id }))) {
      for (const post of spec.posts) {
        const createdAt = new Date(Date.now() - post.daysAgo * 24 * 60 * 60 * 1000);
        await Post.create({
          user: user._id,
          body: post.body,
          place: post.place,
          createdAt,
        });
      }
    }
    if (!(await mongoose.model("TravelLog").countDocuments({ user: user._id }))) {
      for (const trip of spec.trips) {
        await logTripFromForm(user._id, { ...trip, privacy: "followers" });
      }
    }
    if (String(jordanId) !== String(user._id)) {
      await Follow.updateOne(
        { follower: jordanId, followee: user._id },
        { $setOnInsert: { follower: jordanId, followee: user._id } },
        { upsert: true }
      );
    }
  }
}

>>>>>>> Stashed changes
async function createTraveler({ displayName, handle, homeBase }) {
  const UserModel = mongoose.model("User");
  let username = slugifyHandle(handle || displayName);
  let suffix = 0;
  while (await UserModel.exists({ username: suffix ? `${username}${suffix}` : username })) suffix += 1;
  if (suffix) username = `${username}${suffix}`;
  return UserModel.create({
    username,
    email: `${username}@demo.local`,
    passwordHash: "demo",
    displayName: String(displayName || username).trim(),
    homeBase: String(homeBase || "").trim(),
    avatarHue: hueFromString(username),
  });
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
  STAT_META,
  WEIGHTS,
  LADDER,
  applyTravelLog,
  logTripFromForm,
  recordTripFromForm,
  recordMonumentVisit,
  listMonumentVisits,
  listMapData,
  setUserStats,
  createTraveler,
<<<<<<< Updated upstream
=======
  seedDemoMapForUser,
  seedSocialDemo,
  followUser,
  unfollowUser,
  listFollowingIds,
  listFollowingLeaderboard,
  createSocialPost,
  setTripPrivacy,
  listSocialFeed,
  listPeopleToFollow,
>>>>>>> Stashed changes
  presentTraveler,
  rankFromScore,
  formatScore,
  formatStat,
  hueFromString,
};


