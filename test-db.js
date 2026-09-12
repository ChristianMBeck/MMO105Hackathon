const {
  connect,
  mongoose,
  User,
  TravelLog,
  PlaceVisit,
  SCORE_WEIGHTS,
  applyTravelLog,
} = require("./db");

const TEST_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/travel-log-test";

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function almostEqual(actual, expected, label) {
  assert(Math.abs(actual - expected) < 0.001, `${label}: expected ${expected}, got ${actual}`);
}

function expectedMiles(mode, miles) {
  return miles * (SCORE_WEIGHTS.miles[mode] ?? SCORE_WEIGHTS.miles.other);
}

async function seed() {
  const alex = await User.create({
    username: "alex",
    email: "alex@example.com",
    passwordHash: "test-hash",
    displayName: "Alex Rivera",
  });
  const jordan = await User.create({
    username: "jordan",
    email: "jordan@example.com",
    passwordHash: "test-hash",
    displayName: "Jordan Lee",
  });
  const sam = await User.create({
    username: "sam",
    email: "sam@example.com",
    passwordHash: "test-hash",
    displayName: "Sam Patel",
  });

  const alexRoadTrip = await TravelLog.create({
    user: alex._id,
    occurredAt: new Date("2026-06-01"),
    title: "NYC weekend",
    mode: "car",
    distanceMiles: 120,
    counties: ["New York County"],
    states: ["New York"],
    monuments: ["Statue of Liberty"],
  });
  await applyTravelLog(alexRoadTrip);

  const alexRepeatState = await TravelLog.create({
    user: alex._id,
    occurredAt: new Date("2026-06-02"),
    title: "Brooklyn day",
    mode: "car",
    distanceMiles: 80,
    counties: ["Kings County"],
    states: ["New York"],
    monuments: [],
  });
  await applyTravelLog(alexRepeatState);

  const jordanFlight = await TravelLog.create({
    user: jordan._id,
    occurredAt: new Date("2026-07-04"),
    title: "LA flight",
    mode: "plane",
    distanceMiles: 2500,
    counties: ["Los Angeles County"],
    states: ["California"],
    monuments: ["Hollywood Sign"],
  });
  await applyTravelLog(jordanFlight);

  const samWalk = await TravelLog.create({
    user: sam._id,
    occurredAt: new Date("2026-08-12"),
    title: "Boston Freedom Trail",
    mode: "foot",
    distanceMiles: 8,
    counties: ["Suffolk County"],
    states: ["Massachusetts"],
    monuments: ["Freedom Trail"],
  });
  await applyTravelLog(samWalk);

  await User.recomputeRanks();
  return { alex, jordan, sam };
}

async function run() {
  await connect(TEST_URI);
  await mongoose.connection.dropDatabase();

  const { alex, jordan, sam } = await seed();

  const alexFresh = await User.findById(alex._id).lean();
  const jordanFresh = await User.findById(jordan._id).lean();
  const samFresh = await User.findById(sam._id).lean();

  const alexExpected =
    expectedMiles("car", 120) +
    SCORE_WEIGHTS.firstCounty +
    SCORE_WEIGHTS.firstState +
    SCORE_WEIGHTS.firstMonument +
    expectedMiles("car", 80) +
    SCORE_WEIGHTS.firstCounty;

  const jordanExpected =
    expectedMiles("plane", 2500) +
    SCORE_WEIGHTS.firstCounty +
    SCORE_WEIGHTS.firstState +
    SCORE_WEIGHTS.firstMonument;

  const samExpected =
    expectedMiles("foot", 8) +
    SCORE_WEIGHTS.firstCounty +
    SCORE_WEIGHTS.firstState +
    SCORE_WEIGHTS.firstMonument;

  almostEqual(alexFresh.score, alexExpected, "alex score");
  almostEqual(jordanFresh.score, jordanExpected, "jordan score");
  almostEqual(samFresh.score, samExpected, "sam score");

  assert(alexFresh.stats.distanceTraveled === 200, "alex distance");
  assert(alexFresh.stats.milesCar === 200, "alex car miles");
  assert(alexFresh.stats.countiesVisited === 2, "alex counties (unique)");
  assert(alexFresh.stats.statesVisited === 1, "alex states stay unique after repeat NY");
  assert(alexFresh.stats.monumentsVisited === 1, "alex monuments");

  assert(jordanFresh.stats.milesFlown === 2500, "jordan flown miles");
  assert(samFresh.stats.milesFoot === 8, "sam foot miles");

  const alexVisits = await PlaceVisit.countDocuments({ user: alex._id });
  assert(alexVisits === 4, `alex unique places (2 counties, 1 state, 1 monument), got ${alexVisits}`);

  const board = await User.leaderboard();
  assert(board[0].username === "jordan", "jordan should rank first");
  assert(board[1].username === "alex", "alex should rank second");
  assert(board[2].username === "sam", "sam should rank third");
  assert(board[0].rank === 1 && board[1].rank === 2 && board[2].rank === 3, "ranks 1-2-3");

  const userCount = await User.countDocuments();
  const logCount = await TravelLog.countDocuments();
  assert(userCount === 3, "3 users seeded");
  assert(logCount === 4, "4 travel logs seeded");

  console.log("Seeded users:");
  for (const row of board) {
    console.log(
      `  #${row.rank} ${row.displayName} (@${row.username})  score=${row.score}  states=${row.stats.statesVisited}`
    );
  }
  console.log("All database tests passed.");
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
