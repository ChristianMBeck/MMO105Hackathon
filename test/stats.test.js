const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const User = require("../models/User");
const {
  applyTripToUser,
  logTrip,
  getLeaderboard,
  recalculateRanks
} = require("../services/statsService");
const { computeScoreDelta, emptyStats } = require("../config/scoring");

const TEST_URI = process.env.MONGO_URI_TEST || "mongodb://127.0.0.1:27017/travelog_test";

describe("travel stats database", async () => {
  test.before(async () => {
    await mongoose.connect(TEST_URI);
  });

  test.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  test.beforeEach(async () => {
    await mongoose.connection.db.dropDatabase();
  });

  test("new users start with every required stat at zero", () => {
    const stats = emptyStats();
    assert.equal(stats.distanceTraveled, 0);
    assert.equal(stats.countiesVisited, 0);
    assert.equal(stats.statesVisited, 0);
    assert.equal(stats.monumentsVisited, 0);
    assert.equal(stats.milesInCar, 0);
    assert.equal(stats.milesFlown, 0);
    assert.equal(stats.milesInTrain, 0);
    assert.equal(stats.milesOnBike, 0);
    assert.equal(stats.milesOnFoot, 0);
    assert.equal(stats.score, 0);
  });

  test("logging a trip writes every mile type and unique place count", async () => {
    const user = await User.create({
      username: "pat",
      displayName: "Pat",
      email: "pat@example.com",
      passwordHash: "hash"
    });

    await logTrip(user._id, {
      title: "Mixed travel day",
      milesInCar: 40,
      milesFlown: 500,
      milesInTrain: 20,
      milesOnBike: 8,
      milesOnFoot: 2,
      counties: ["Travis County", "Hays County"],
      states: ["Texas"],
      monuments: ["State Capitol"]
    });

    const saved = await User.findById(user._id);
    assert.equal(saved.stats.milesInCar, 40);
    assert.equal(saved.stats.milesFlown, 500);
    assert.equal(saved.stats.milesInTrain, 20);
    assert.equal(saved.stats.milesOnBike, 8);
    assert.equal(saved.stats.milesOnFoot, 2);
    assert.equal(saved.stats.distanceTraveled, 570);
    assert.equal(saved.stats.countiesVisited, 2);
    assert.equal(saved.stats.statesVisited, 1);
    assert.equal(saved.stats.monumentsVisited, 1);
    assert.ok(saved.stats.score > 0);
    assert.equal(saved.rank, 1);
  });

  test("repeat counties, states, and monuments do not increase visited counts or score twice", () => {
    const user = { stats: emptyStats() };
    applyTripToUser(user, {
      milesOnFoot: 5,
      counties: ["King County"],
      states: ["Washington"],
      monuments: ["Space Needle"]
    });
    const scoreAfterFirst = user.stats.score;

    applyTripToUser(user, {
      milesOnFoot: 0,
      counties: ["King County"],
      states: ["Washington"],
      monuments: ["Space Needle"]
    });

    assert.equal(user.stats.countiesVisited, 1);
    assert.equal(user.stats.statesVisited, 1);
    assert.equal(user.stats.monumentsVisited, 1);
    assert.equal(user.stats.score, scoreAfterFirst);
  });

  test("score uses mile and unique-place point values", () => {
    const score = computeScoreDelta(
      { milesInCar: 10, milesFlown: 0, milesInTrain: 0, milesOnBike: 0, milesOnFoot: 1 },
      { counties: 1, states: 1, monuments: 1 }
    );
    assert.equal(score, 405);
  });

  test("leaderboard ranks users by score", async () => {
    const low = await User.create({
      username: "low",
      displayName: "Low",
      email: "low@example.com",
      passwordHash: "hash"
    });
    const high = await User.create({
      username: "high",
      displayName: "High",
      email: "high@example.com",
      passwordHash: "hash"
    });

    await logTrip(low._id, { milesInCar: 10, states: ["Ohio"] });
    await logTrip(high._id, {
      milesFlown: 1000,
      states: ["Hawaii"],
      monuments: ["Pearl Harbor"]
    });
    await recalculateRanks();

    const board = await getLeaderboard();
    assert.equal(board[0].username, "high");
    assert.equal(board[0].rank, 1);
    assert.equal(board[1].username, "low");
    assert.equal(board[1].rank, 2);
  });
});
