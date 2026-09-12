const {
  MILE_FIELDS,
  computeDistance,
  computeScoreDelta,
  emptyStats,
  splitPlaces,
  toNonNegativeNumber,
  uniqueNewPlaces
} = require("./scoring");

const users = new Map();
const tripsByUser = new Map();
let nextUserId = 1;
let nextTripId = 1;

function createUser({ username, displayName, seed }) {
  const stats = emptyStats();
  const user = {
    id: String(nextUserId++),
    username,
    displayName,
    stats
  };
  users.set(user.id, user);
  tripsByUser.set(user.id, []);
  if (seed) applyTrip(user, seed);
  return user;
}

function applyTrip(user, input) {
  const miles = {};
  for (const field of MILE_FIELDS) {
    miles[field] = toNonNegativeNumber(input[field]);
  }

  const newCounties = uniqueNewPlaces(user.stats.counties, splitPlaces(input.counties));
  const newStates = uniqueNewPlaces(user.stats.states, splitPlaces(input.states));
  const newMonuments = uniqueNewPlaces(user.stats.monuments, splitPlaces(input.monuments));
  const distanceAdded = computeDistance(miles);
  const scoreAdded = computeScoreDelta(miles, {
    counties: newCounties.length,
    states: newStates.length,
    monuments: newMonuments.length
  });

  for (const field of MILE_FIELDS) {
    user.stats[field] += miles[field];
  }
  user.stats.distanceTraveled += distanceAdded;
  user.stats.counties.push(...newCounties);
  user.stats.states.push(...newStates);
  user.stats.monuments.push(...newMonuments);
  user.stats.countiesVisited = user.stats.counties.length;
  user.stats.statesVisited = user.stats.states.length;
  user.stats.monumentsVisited = user.stats.monuments.length;
  user.stats.score = Math.round((user.stats.score + scoreAdded) * 100) / 100;

  const trip = {
    id: String(nextTripId++),
    title: String(input.title || "Untitled trip").trim() || "Untitled trip",
    date: input.date ? new Date(input.date) : new Date(),
    ...miles,
    counties: newCounties,
    states: newStates,
    monuments: newMonuments,
    distanceAdded,
    scoreAdded
  };
  tripsByUser.get(user.id).unshift(trip);
  recalculateRanks();
  return trip;
}

function recalculateRanks() {
  const ranked = [...users.values()].sort((a, b) => {
    if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
    return a.displayName.localeCompare(b.displayName);
  });
  ranked.forEach((user, index) => {
    user.stats.rank = index + 1;
  });
}

function seedDemoTravelers() {
  createUser({
    username: "alex",
    displayName: "Alex Rivera",
    seed: {
      title: "Pacific Coast",
      milesInCar: 420,
      milesOnFoot: 18,
      counties: "Los Angeles, Monterey",
      states: "California",
      monuments: "Golden Gate Bridge"
    }
  });
  createUser({
    username: "jordan",
    displayName: "Jordan Lee",
    seed: {
      title: "Northeast rail",
      milesInTrain: 260,
      milesOnFoot: 8,
      counties: "New York County, Suffolk",
      states: "New York, Massachusetts",
      monuments: "Statue of Liberty"
    }
  });
  createUser({
    username: "sam",
    displayName: "Sam Ortiz",
    seed: {
      title: "Southwest loop",
      milesInCar: 610,
      milesFlown: 980,
      counties: "Maricopa",
      states: "Arizona, Nevada",
      monuments: "Grand Canyon, Hoover Dam"
    }
  });
  createUser({
    username: "riley",
    displayName: "Riley Chen",
    seed: {
      title: "Lakes weekend",
      milesOnBike: 42,
      milesOnFoot: 11,
      counties: "Cook",
      states: "Illinois",
      monuments: ""
    }
  });
}

function ensureCurrentUser(session) {
  if (session.userId && users.has(session.userId)) {
    return users.get(session.userId);
  }
  const you = createUser({ username: "you", displayName: "You" });
  session.userId = you.id;
  recalculateRanks();
  return you;
}

function getUser(id) {
  return users.get(id) || null;
}

function getTrips(userId) {
  return tripsByUser.get(userId) || [];
}

function logTrip(user, input) {
  return applyTrip(user, input);
}

function getLeaderboard() {
  return [...users.values()].sort((a, b) => a.stats.rank - b.stats.rank);
}

seedDemoTravelers();

module.exports = {
  ensureCurrentUser,
  getUser,
  getTrips,
  logTrip,
  getLeaderboard
};
