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
    SCORE_WEIGHTS.firstState +
    SCORE_WEIGHTS.firstCountry +
    SCORE_WEIGHTS.firstMonument +
    expectedMiles("car", 80);

  const jordanExpected =
    expectedMiles("plane", 2500) +
    SCORE_WEIGHTS.firstState +
    SCORE_WEIGHTS.firstCountry +
    SCORE_WEIGHTS.firstMonument;

  const samExpected =
    expectedMiles("foot", 8) +
    SCORE_WEIGHTS.firstState +
    SCORE_WEIGHTS.firstMonument;

  almostEqual(alexFresh.score, alexExpected, "alex score");
  almostEqual(jordanFresh.score, jordanExpected, "jordan score");
  almostEqual(samFresh.score, samExpected, "sam score");

  assert(alexFresh.stats.distanceTraveled === 200, "alex distance");
  assert(alexFresh.stats.milesCar === 200, "alex car miles");
  assert(alexFresh.stats.statesVisited === 1, "alex states stay unique after repeat NY");
  assert(alexFresh.stats.monumentsVisited === 1, "alex monuments");
  assert(alexFresh.stats.countriesVisited === 1, "alex countries from Statue of Liberty");

  assert(jordanFresh.stats.milesFlown === 2500, "jordan flown miles");
  assert(jordanFresh.stats.countriesVisited === 1, "jordan countries from Hollywood Sign");
  assert(samFresh.stats.milesFoot === 8, "sam foot miles");

  const alexVisits = await PlaceVisit.countDocuments({ user: alex._id });
  assert(alexVisits === 3, `alex unique places (1 state, 1 country, 1 monument), got ${alexVisits}`);

  const board = await User.leaderboard();
  assert(board[0].username === "jordan", "jordan should rank first");
  assert(board[1].username === "alex", "alex should rank second");
  assert(board[2].username === "sam", "sam should rank third");
  assert(board[0].rank === 1 && board[1].rank === 2 && board[2].rank === 3, "ranks 1-2-3");

  const userCount = await User.countDocuments();
  const logCount = await TravelLog.countDocuments();
  assert(userCount === 3, "3 users seeded");
  assert(logCount === 4, "4 travel logs seeded");

  await seedMapForJordan(jordan);
  await User.recomputeRanks();

  const mapVisits = await PlaceVisit.find({ user: jordan._id, kind: { $in: ["country", "monument"] } }).lean();
  const mapCountries = mapVisits.filter((row) => row.kind === "country").length;
  const mapPins = mapVisits.filter((row) => row.kind === "monument" && Number.isFinite(row.lat) && Number.isFinite(row.lon)).length;
  assert(mapCountries >= 8, `jordan should have several countries for the map, got ${mapCountries}`);
  assert(mapPins >= 8, `jordan should have monument pins with coordinates, got ${mapPins}`);

  console.log("Seeded users:");
  const boardAfterMap = await User.leaderboard();
  for (const row of boardAfterMap) {
    console.log(
      `  #${row.rank} ${row.displayName} (@${row.username})  score=${row.score}  states=${row.stats.statesVisited}  countries=${row.stats.countriesVisited}`
    );
  }
  console.log("All database tests passed.");
}

async function seedMapForJordan(jordan) {
  const trips = [
    { title: "Paris weekend", mode: "plane", miles: 3600, date: "2025-04-12", monuments: ["Eiffel Tower"] },
    { title: "Rome ruins", mode: "plane", miles: 4200, date: "2025-05-03", monuments: ["Colosseum"] },
    { title: "London walk", mode: "foot", miles: 12, date: "2025-05-18", monuments: ["Big Ben"] },
    { title: "Barcelona", mode: "plane", miles: 3900, date: "2025-06-09", monuments: ["Sagrada Família"] },
    { title: "Tokyo temples", mode: "plane", miles: 5500, date: "2025-07-21", monuments: ["Sensō-ji"] },
    { title: "Cairo", mode: "plane", miles: 6800, date: "2025-08-02", monuments: ["Pyramids of Giza"] },
    { title: "Rio", mode: "plane", miles: 5300, date: "2025-09-14", monuments: ["Christ the Redeemer"] },
    { title: "Cusco to Machu Picchu", mode: "train", miles: 70, date: "2025-10-05", monuments: ["Machu Picchu"] },
    { title: "Sydney harbour", mode: "plane", miles: 7500, date: "2026-01-11", monuments: ["Sydney Opera House"] },
    { title: "Agra", mode: "plane", miles: 8000, date: "2026-02-20", monuments: ["Taj Mahal"] },
    { title: "Beijing", mode: "plane", miles: 6500, date: "2026-03-08", monuments: ["Great Wall of China (Badaling)"] },
    { title: "Toronto", mode: "plane", miles: 2200, date: "2026-04-02", monuments: ["CN Tower"] },
  ];

  for (const trip of trips) {
    const log = await TravelLog.create({
      user: jordan._id,
      occurredAt: new Date(trip.date),
      title: trip.title,
      mode: trip.mode,
      distanceMiles: trip.miles,
      monuments: trip.monuments,
    });
    await applyTravelLog(log);
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
