const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  computeDistance,
  computeScoreDelta,
  uniqueNewPlaces
} = require("../lib/scoring");

describe("scoring", () => {
  it("adds every mile field into distance traveled", () => {
    assert.equal(
      computeDistance({
        milesInCar: 10,
        milesFlown: 20,
        milesInTrain: 5,
        milesOnBike: 2,
        milesOnFoot: 1
      }),
      38
    );
  });

  it("scores miles and first-time places", () => {
    const score = computeScoreDelta(
      { milesOnFoot: 2, milesInCar: 10 },
      { counties: 1, states: 1, monuments: 1 }
    );
    assert.equal(score, 2 * 10 + 10 * 2 + 50 + 200 + 125);
  });

  it("ignores repeat place names", () => {
    const added = uniqueNewPlaces(["California"], ["california", "Nevada"]);
    assert.deepEqual(added, ["Nevada"]);
  });
});
