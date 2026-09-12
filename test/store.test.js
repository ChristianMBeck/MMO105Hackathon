const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const store = require("../lib/store");

describe("store", () => {
  beforeEach(() => {
    store.reset();
  });

  it("keeps a single You traveler across sessions", () => {
    const first = store.ensureCurrentUser({});
    const second = store.ensureCurrentUser({});
    const youRows = store.getLeaderboard().filter((traveler) => traveler.username === "you");

    assert.equal(first.id, second.id);
    assert.equal(youRows.length, 1);
  });

  it("saves the trip name from the log form", () => {
    const you = store.ensureCurrentUser({});
    const trip = store.logTrip(you, {
      tripName: "Coast highway",
      milesInCar: 120,
      milesOnFoot: 4,
      states: "California"
    });

    assert.equal(trip.title, "Coast highway");
    assert.equal(store.getTrips(you.id)[0].title, "Coast highway");
  });
});
