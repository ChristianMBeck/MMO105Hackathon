const mongoose = require("mongoose");
const famous = require("./data/famous.json");
const { canonicalCountryName, countryMatchKeys } = require("./lib/geo");
const { estimateLegMiles } = require("./lib/route");

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
  firstState: 200,
  firstCountry: 150,
  firstMonument: 100,
};

const TRAVEL_MODES = ["car", "plane", "train", "bike", "foot", "other"];
const PLACE_KINDS = ["state", "country", "monument", "county"];

const STAT_META = [
  { key: "distanceTraveled", label: "Distance traveled", icon: "signpost-2", group: "coverage", unit: "mi" },
  { key: "countriesVisited", label: "Countries visited", icon: "globe2", group: "coverage", unit: "" },
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
    states: { type: [String], default: [] },
    countries: { type: [String], default: [] },
    monuments: { type: [String], default: [] },
    scoreAwarded: { type: Number, default: 0, min: 0 },
    sport: { type: String, enum: ["walk", "ride", "drive", "train", "flight", "hike", "paddle", "mixed"], default: "drive" },
    elevationFt: { type: Number, default: 0, min: 0 },
    movingSeconds: { type: Number, default: 0, min: 0 },
    startLocation: { type: String, default: "", trim: true },
    endLocation: { type: String, default: "", trim: true },
    privacy: { type: String, enum: ["everyone", "followers", "onlyme"], default: "onlyme" },
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

const followSchema = new Schema(
  {
    follower: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    followee: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);
followSchema.index({ follower: 1, followee: 1 }, { unique: true });

const MAX_PINNED_POSTS = 6;

const socialPostSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    caption: { type: String, trim: true, default: "", maxlength: 280 },
    photoPath: { type: String, required: true, trim: true },
    selfiePath: { type: String, default: "", trim: true },
    pinned: { type: Boolean, default: false, index: true },
    pinnedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
socialPostSchema.index({ createdAt: -1 });
socialPostSchema.index({ user: 1, createdAt: -1 });
socialPostSchema.index({ user: 1, pinned: 1, pinnedAt: -1 });

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

  const states = normalizeNames(travelLog.states);
  const monuments = normalizeNames(travelLog.monuments);
  const inferredCountries = monuments
    .map((name) => findFamousByName(name)?.country)
    .filter(Boolean);
  const countries = normalizeNames([...(travelLog.countries || []), ...inferredCountries]).map(canonicalCountryName);
  const miles = Number(travelLog.distanceMiles) || 0;

  const candidates = [
    ...countries.map((name) => ({ kind: "country", name, points: SCORE_WEIGHTS.firstCountry })),
    ...states.map((name) => ({ kind: "state", name, points: SCORE_WEIGHTS.firstState })),
    ...monuments.map((name) => ({ kind: "monument", name, points: SCORE_WEIGHTS.firstMonument })),
  ];

  let newCountries = 0;
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
    "stats.statesVisited": newStates,
    "stats.monumentsVisited": newMonuments,
  };
  if (mileField) inc[`stats.${mileField}`] = miles;

  await User.updateOne({ _id: travelLog.user }, { $inc: inc });
  await mongoose.model("TravelLog").updateOne({ _id: travelLog._id }, { $set: { scoreAwarded } });

  return { scoreAwarded, newCountries, newStates, newMonuments };
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

function privacyFromBody(body = {}) {
  if (body.share === "1" || body.share === "on") return "followers";
  if (["everyone", "followers", "onlyme"].includes(body.privacy)) return body.privacy;
  return "onlyme";
}

function scoreFromStats(stats = {}) {
  let score = 0;
  for (const meta of STAT_META) {
    if (meta.key === "distanceTraveled") continue;
    score += (Number(stats[meta.key]) || 0) * (WEIGHTS[meta.key] || 0);
  }
  return score;
}

function parseRoutePayload(raw) {
  if (!raw) return null;
  try {
    const route = typeof raw === "string" ? JSON.parse(raw) : raw;
    const stops = Array.isArray(route.stops) ? route.stops : [];
    const cleaned = stops
      .map((stop) => ({
        name: String(stop.name || "").trim(),
        lat: Number(stop.lat),
        lon: Number(stop.lon),
        country: canonicalCountryName(stop.country || ""),
        state: String(stop.state || "").trim(),
      }))
      .filter((stop) => stop.name && Number.isFinite(stop.lat) && Number.isFinite(stop.lon));
    if (!cleaned.length) return null;
    const modes = Array.isArray(route.modes) ? route.modes : [];
    const legs = [];
    for (let i = 0; i < cleaned.length - 1; i += 1) {
      const mode = TRAVEL_MODES.includes(modes[i]) ? modes[i] : "car";
      legs.push({
        mode,
        miles: estimateLegMiles(cleaned[i], cleaned[i + 1], mode),
      });
    }
    const fromStops = [...new Set(cleaned.map((stop) => stop.country).filter(Boolean))];
    const countries = Object.prototype.hasOwnProperty.call(route, "countries")
      ? [...new Set((Array.isArray(route.countries) ? route.countries : []).map((name) => canonicalCountryName(name)).filter(Boolean))]
      : fromStops;
    const states = [...new Set(
      cleaned
        .filter((stop) => stop.state && countryMatchKeys(stop.country).includes("united states"))
        .map((stop) => stop.state)
    )];
    const modeMiles = [];
    for (const leg of legs) {
      const existing = modeMiles.find((entry) => entry.mode === leg.mode);
      if (existing) existing.miles = Math.round((existing.miles + leg.miles) * 10) / 10;
      else modeMiles.push({ mode: leg.mode, miles: leg.miles });
    }
    return {
      stops: cleaned,
      modeMiles,
      countries,
      states,
      startLocation: cleaned[0].name,
      endLocation: cleaned[cleaned.length - 1].name,
    };
  } catch {
    return null;
  }
}

async function logTripFromForm(userId, body) {
  const routed = parseRoutePayload(body.route);
  const states = routed ? routed.states : parseNameList(body.states);
  const countries = routed ? routed.countries : parseNameList(body.countries).map(canonicalCountryName);
  const monuments = routed ? [] : parseNameList(body.monuments);
  const title = String(body.title || "").trim();
  const notes = String(body.note || body.notes || "").trim();
  const occurredAt = body.occurredOn ? new Date(body.occurredOn) : new Date();
  const modeMiles = routed
    ? routed.modeMiles
    : Object.entries(MODE_FROM_STAT)
      .map(([statKey, mode]) => ({ mode, miles: Number(body[statKey]) || 0 }))
      .filter((entry) => entry.miles > 0);

  if (!modeMiles.length && !states.length && !countries.length && !monuments.length) {
    throw new Error("Add at least one stop on the map.");
  }

  const privacy = privacyFromBody(body);
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
      states: first ? states : [],
      countries: first ? countries : [],
      monuments: first ? monuments : [],
      startLocation: first && routed ? routed.startLocation : "",
      endLocation: first && routed ? routed.endLocation : "",
      privacy,
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
    privacy: privacyFromBody(body),
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
  const rows = await mongoose.model("Follow").find({ follower: userId }).select("followee").lean();
  return rows.map((row) => row.followee);
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

function socialPhotoUrl(filename) {
  const name = String(filename || "").trim();
  if (!name) return "";
  if (/^https?:\/\//i.test(name) || name.startsWith("/")) return name;
  if (name.startsWith("demo-")) return `/img/moments/${name}`;
  return `/social-photos/${name}`;
}

function formatRelativeTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const delta = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (delta < minute) return "just now";
  if (delta < hour) return `${Math.floor(delta / minute)}m ago`;
  if (delta < day) return `${Math.floor(delta / hour)}h ago`;
  if (delta < 7 * day) return `${Math.floor(delta / day)}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function presentSocialPost(post, author) {
  if (!post) return null;
  const doc = typeof post.toObject === "function" ? post.toObject() : { ...post };
  return {
    ...doc,
    id: String(doc._id),
    caption: doc.caption || "",
    photoUrl: socialPhotoUrl(doc.photoPath),
    selfieUrl: socialPhotoUrl(doc.selfiePath),
    pinned: Boolean(doc.pinned),
    author: author ? presentTraveler(author) : null,
    relativeTime: formatRelativeTime(doc.createdAt),
  };
}

async function hydrateSocialPosts(posts) {
  const ids = [...new Set(posts.map((post) => String(post.user)))];
  const users = await mongoose.model("User").find({ _id: { $in: ids } }).lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return posts.map((post) => presentSocialPost(post, byId.get(String(post.user))));
}

async function createSocialPost(userId, payload) {
  const caption = String(payload.caption || "").trim().slice(0, 280);
  const photoPath = String(payload.photoPath || "").trim();
  if (!photoPath) throw new Error("Add a photo to share a moment.");
  const selfiePath = String(payload.selfiePath || "").trim();
  const createdAt = payload.createdAt ? new Date(payload.createdAt) : new Date();
  const doc = await mongoose.model("SocialPost").create({
    user: userId,
    caption,
    photoPath,
    selfiePath,
    createdAt,
    updatedAt: createdAt,
  });
  return presentSocialPost(doc.toObject());
}

async function listSocialFeed(limit = 40) {
  const posts = await mongoose
    .model("SocialPost")
    .find()
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Number(limit) || 40))
    .lean();
  return hydrateSocialPosts(posts);
}

async function listUserSocialPosts(userId, { pinnedOnly = false } = {}) {
  const filter = { user: userId };
  if (pinnedOnly) filter.pinned = true;
  const sort = pinnedOnly ? { pinnedAt: -1, createdAt: -1 } : { createdAt: -1 };
  const posts = await mongoose.model("SocialPost").find(filter).sort(sort).lean();
  return hydrateSocialPosts(posts);
}

async function getSocialPost(postId) {
  const post = await mongoose.model("SocialPost").findById(postId).lean();
  if (!post) return null;
  const author = await mongoose.model("User").findById(post.user).lean();
  return presentSocialPost(post, author);
}

async function pinSocialPost(userId, postId) {
  const SocialPost = mongoose.model("SocialPost");
  const post = await SocialPost.findById(postId);
  if (!post) throw new Error("That moment is gone.");
  if (String(post.user) !== String(userId)) throw new Error("You can only pin your own moments.");
  if (post.pinned) return presentSocialPost(post.toObject());
  const pinnedCount = await SocialPost.countDocuments({ user: userId, pinned: true });
  if (pinnedCount >= MAX_PINNED_POSTS) {
    throw new Error(`You can pin up to ${MAX_PINNED_POSTS} favorite moments on your account.`);
  }
  post.pinned = true;
  post.pinnedAt = new Date();
  await post.save();
  return presentSocialPost(post.toObject());
}

async function unpinSocialPost(userId, postId) {
  const post = await mongoose.model("SocialPost").findById(postId);
  if (!post) throw new Error("That moment is gone.");
  if (String(post.user) !== String(userId)) throw new Error("You can only unpin your own moments.");
  post.pinned = false;
  post.pinnedAt = null;
  await post.save();
  return presentSocialPost(post.toObject());
}

async function deleteSocialPost(userId, postId) {
  const post = await mongoose.model("SocialPost").findOne({ _id: postId, user: userId });
  if (!post) throw new Error("You can only remove your own moments.");
  const snapshot = post.toObject();
  await post.deleteOne();
  return snapshot;
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

const DEMO_MOMENT_SPECS = [
  {
    handle: "jordan",
    displayName: "Jordan Lee",
    homeBase: "Demo",
    caption: "Coffee before the train. No timer, just the morning.",
    photoPath: "demo-cafe.svg",
    selfiePath: "demo-selfie-jordan.svg",
    hoursAgo: 2,
    pin: true,
  },
  {
    handle: "alex",
    displayName: "Alex Rivera",
    homeBase: "Brooklyn",
    caption: "Bridge lights on the way home.",
    photoPath: "demo-city.svg",
    selfiePath: "demo-selfie-alex.svg",
    hoursAgo: 5,
    pin: true,
  },
  {
    handle: "jordan",
    displayName: "Jordan Lee",
    homeBase: "Demo",
    caption: "Lookout before the descent.",
    photoPath: "demo-ridge.svg",
    selfiePath: "demo-selfie-jordan.svg",
    hoursAgo: 20,
    pin: true,
  },
  {
    handle: "sam",
    displayName: "Sam Patel",
    homeBase: "Boston",
    caption: "Harbor swim, first of the trip.",
    photoPath: "demo-harbor.svg",
    selfiePath: "demo-selfie-sam.svg",
    hoursAgo: 28,
    pin: false,
  },
];

async function seedDemoSocial() {
  for (const spec of DEMO_MOMENT_SPECS) {
    const exists = await mongoose.model("User").exists({ username: spec.handle });
    if (!exists) {
      await createTraveler({
        displayName: spec.displayName,
        handle: spec.handle,
        homeBase: spec.homeBase,
      });
    }
  }

  if (await mongoose.model("SocialPost").countDocuments()) return;

  for (const spec of DEMO_MOMENT_SPECS) {
    const user = await mongoose.model("User").findOne({ username: spec.handle });
    if (!user) continue;
    const post = await createSocialPost(user._id, {
      caption: spec.caption,
      photoPath: spec.photoPath,
      selfiePath: spec.selfiePath,
      createdAt: new Date(Date.now() - spec.hoursAgo * 60 * 60 * 1000),
    });
    if (spec.pin) await pinSocialPost(user._id, post.id);
  }
}

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
const Follow = mongoose.models.Follow || mongoose.model("Follow", followSchema);
const SocialPost = mongoose.models.SocialPost || mongoose.model("SocialPost", socialPostSchema);

module.exports = {
  mongoose,
  connect,
  User,
  TravelLog,
  PlaceVisit,
  Follow,
  SocialPost,
  SCORE_WEIGHTS,
  TRAVEL_MODES,
  PLACE_KINDS,
  STAT_META,
  WEIGHTS,
  LADDER,
  MAX_PINNED_POSTS,
  applyTravelLog,
  logTripFromForm,
  recordTripFromForm,
  recordMonumentVisit,
  listMonumentVisits,
  listMapData,
  setUserStats,
  createTraveler,
  seedDemoMapForUser,
  seedDemoSocial,
  followUser,
  unfollowUser,
  createSocialPost,
  listSocialFeed,
  listUserSocialPosts,
  getSocialPost,
  pinSocialPost,
  unpinSocialPost,
  deleteSocialPost,
  presentSocialPost,
  socialPhotoUrl,
  formatRelativeTime,
  setTripPrivacy,
  listPeopleToFollow,
  presentTraveler,
  rankFromScore,
  formatScore,
  formatStat,
  hueFromString,
};


