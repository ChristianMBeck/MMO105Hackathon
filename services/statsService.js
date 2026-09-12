const User = require("../models/User");
const Trip = require("../models/Trip");
const {
  MILE_FIELDS,
  toNonNegativeNumber,
  computeDistance,
  computeScoreDelta,
  emptyStats
} = require("../config/scoring");

function normalizePlaces(list = []) {
  const values = Array.isArray(list)
    ? list
    : String(list)
        .split(",")
        .map((item) => item.trim());

  const seen = new Set();
  const result = [];

  for (const raw of values) {
    const name = String(raw || "").trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }

  return result;
}

function uniqueNew(existing = [], incoming = []) {
  const have = new Set(existing.map((name) => name.toLowerCase()));
  return incoming.filter((name) => !have.has(name.toLowerCase()));
}

function parseTripInput(input = {}) {
  const miles = {};
  for (const field of MILE_FIELDS) {
    miles[field] = toNonNegativeNumber(input[field]);
  }

  return {
    title: String(input.title || "").trim(),
    notes: String(input.notes || "").trim(),
    date: input.date ? new Date(input.date) : new Date(),
    ...miles,
    counties: normalizePlaces(input.counties),
    states: normalizePlaces(input.states),
    monuments: normalizePlaces(input.monuments)
  };
}

function ensureStats(user) {
  if (!user.stats) {
    user.stats = emptyStats();
  }
  return user.stats;
}

function applyTripToUser(user, input) {
  const stats = ensureStats(user);
  const parsed = parseTripInput(input);

  const newCounties = uniqueNew(stats.counties, parsed.counties);
  const newStates = uniqueNew(stats.states, parsed.states);
  const newMonuments = uniqueNew(stats.monuments, parsed.monuments);

  const distanceAdded = computeDistance(parsed);
  const scoreAdded = computeScoreDelta(parsed, {
    counties: newCounties.length,
    states: newStates.length,
    monuments: newMonuments.length
  });

  const hasTravel =
    distanceAdded > 0 ||
    parsed.counties.length > 0 ||
    parsed.states.length > 0 ||
    parsed.monuments.length > 0;

  if (!hasTravel) {
    const error = new Error("Log at least some miles or a place visited.");
    error.status = 400;
    throw error;
  }

  for (const field of MILE_FIELDS) {
    stats[field] = toNonNegativeNumber(stats[field]) + parsed[field];
  }

  stats.distanceTraveled = toNonNegativeNumber(stats.distanceTraveled) + distanceAdded;
  stats.counties.push(...newCounties);
  stats.states.push(...newStates);
  stats.monuments.push(...newMonuments);
  stats.countiesVisited = stats.counties.length;
  stats.statesVisited = stats.states.length;
  stats.monumentsVisited = stats.monuments.length;
  stats.score = toNonNegativeNumber(stats.score) + scoreAdded;

  return {
    parsed,
    newCounties,
    newStates,
    newMonuments,
    distanceAdded,
    scoreAdded
  };
}

async function logTrip(userId, input) {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }

  const result = applyTripToUser(user, input);
  const trip = await Trip.create({
    user: user._id,
    date: result.parsed.date,
    title: result.parsed.title,
    notes: result.parsed.notes,
    milesInCar: result.parsed.milesInCar,
    milesFlown: result.parsed.milesFlown,
    milesInTrain: result.parsed.milesInTrain,
    milesOnBike: result.parsed.milesOnBike,
    milesOnFoot: result.parsed.milesOnFoot,
    counties: result.parsed.counties,
    states: result.parsed.states,
    monuments: result.parsed.monuments,
    distanceAdded: result.distanceAdded,
    scoreAdded: result.scoreAdded
  });

  await user.save();
  await recalculateRanks();
  const rankedUser = await User.findById(user._id);
  return { user: rankedUser, trip, ...result };
}

async function recalculateRanks() {
  const users = await User.find()
    .sort({ "stats.score": -1, "stats.distanceTraveled": -1, username: 1 })
    .select("_id");

  if (!users.length) return;

  const ops = users.map((user, index) => ({
    updateOne: {
      filter: { _id: user._id },
      update: { $set: { rank: index + 1 } }
    }
  }));

  await User.bulkWrite(ops);
}

async function getLeaderboard(limit = 50) {
  return User.find()
    .sort({ "stats.score": -1, "stats.distanceTraveled": -1, username: 1 })
    .limit(limit)
    .select("username displayName rank stats");
}

module.exports = {
  normalizePlaces,
  uniqueNew,
  parseTripInput,
  applyTripToUser,
  logTrip,
  recalculateRanks,
  getLeaderboard
};
