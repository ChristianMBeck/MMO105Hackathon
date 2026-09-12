/**
 * How logged travel stats turn into a Liftoff-style score.
 * Unique places only award points the first time they are logged.
 */
const POINT_VALUES = {
  milesOnFoot: 10,
  milesOnBike: 6,
  milesInTrain: 3,
  milesInCar: 2,
  milesFlown: 1,
  county: 50,
  state: 200,
  monument: 125
};

const MILE_FIELDS = [
  "milesInCar",
  "milesFlown",
  "milesInTrain",
  "milesOnBike",
  "milesOnFoot"
];

function toNonNegativeNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function computeDistance(miles) {
  return MILE_FIELDS.reduce((sum, field) => sum + toNonNegativeNumber(miles[field]), 0);
}

function computeScoreDelta(miles, uniqueCounts) {
  const mileScore = MILE_FIELDS.reduce((sum, field) => {
    return sum + toNonNegativeNumber(miles[field]) * POINT_VALUES[field];
  }, 0);

  const placeScore =
    toNonNegativeNumber(uniqueCounts.counties) * POINT_VALUES.county +
    toNonNegativeNumber(uniqueCounts.states) * POINT_VALUES.state +
    toNonNegativeNumber(uniqueCounts.monuments) * POINT_VALUES.monument;

  return Math.round((mileScore + placeScore) * 100) / 100;
}

function emptyStats() {
  return {
    distanceTraveled: 0,
    countiesVisited: 0,
    statesVisited: 0,
    monumentsVisited: 0,
    milesInCar: 0,
    milesFlown: 0,
    milesInTrain: 0,
    milesOnBike: 0,
    milesOnFoot: 0,
    score: 0,
    counties: [],
    states: [],
    monuments: []
  };
}

module.exports = {
  POINT_VALUES,
  MILE_FIELDS,
  toNonNegativeNumber,
  computeDistance,
  computeScoreDelta,
  emptyStats
};
