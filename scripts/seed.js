require("dotenv").config();

const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Trip = require("../models/Trip");
const { connectDb, disconnectDb } = require("../config/db");
const { logTrip, recalculateRanks } = require("../services/statsService");

const DEMO_PASSWORD = "password123";

const DEMO_USERS = [
  {
    username: "alex",
    displayName: "Alex Rivera",
    email: "alex@travelog.dev",
    trips: [
      {
        title: "Pacific Coast road trip",
        date: "2026-06-12",
        milesInCar: 842,
        states: ["California", "Oregon"],
        counties: ["Los Angeles County", "Monterey County", "Lane County"],
        monuments: ["Golden Gate Bridge"]
      },
      {
        title: "Yosemite weekend",
        date: "2026-07-04",
        milesInCar: 310,
        milesOnFoot: 18,
        states: ["California"],
        counties: ["Mariposa County"],
        monuments: ["Yosemite National Park"]
      }
    ]
  },
  {
    username: "jordan",
    displayName: "Jordan Hale",
    email: "jordan@travelog.dev",
    trips: [
      {
        title: "Appalachian backpack",
        date: "2026-05-20",
        milesOnFoot: 64,
        milesOnBike: 22,
        states: ["Virginia", "Tennessee"],
        counties: ["Washington County", "Carter County"],
        monuments: ["Great Smoky Mountains"]
      },
      {
        title: "DC monuments walk",
        date: "2026-08-01",
        milesOnFoot: 11,
        milesInTrain: 45,
        states: ["Virginia", "Maryland", "District of Columbia"],
        counties: ["Arlington County"],
        monuments: ["Lincoln Memorial", "Washington Monument"]
      }
    ]
  },
  {
    username: "sam",
    displayName: "Sam Okonkwo",
    email: "sam@travelog.dev",
    trips: [
      {
        title: "Coast to coast",
        date: "2026-03-18",
        milesFlown: 2440,
        milesInCar: 38,
        states: ["New York", "California"],
        counties: ["Kings County", "San Francisco County"],
        monuments: ["Statue of Liberty"]
      }
    ]
  },
  {
    username: "riley",
    displayName: "Riley Chen",
    email: "riley@travelog.dev",
    trips: [
      {
        title: "First state park ride",
        date: "2026-08-22",
        milesOnBike: 16,
        milesOnFoot: 3,
        states: ["Colorado"],
        counties: ["Jefferson County"],
        monuments: []
      }
    ]
  }
];

async function createDemoUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const demo of DEMO_USERS) {
    const user = await User.create({
      username: demo.username,
      displayName: demo.displayName,
      email: demo.email,
      passwordHash
    });

    for (const trip of demo.trips) {
      await logTrip(user._id, trip);
    }
  }

  await recalculateRanks();
}

async function seedIfEmpty() {
  const count = await User.countDocuments();
  if (count > 0) return { seeded: false, count };
  await createDemoUsers();
  const seededCount = await User.countDocuments();
  console.log(`Seeded ${seededCount} demo travelers (password: ${DEMO_PASSWORD})`);
  return { seeded: true, count: seededCount };
}

async function resetAndSeed() {
  await Trip.deleteMany({});
  await User.deleteMany({});
  await createDemoUsers();
}

async function main() {
  await connectDb();
  await resetAndSeed();
  const users = await User.find().sort({ rank: 1 }).select("username displayName rank stats");
  console.log(
    users.map((user) => ({
      rank: user.rank,
      username: user.username,
      score: user.stats.score,
      distanceTraveled: user.stats.distanceTraveled,
      countiesVisited: user.stats.countiesVisited,
      statesVisited: user.stats.statesVisited,
      monumentsVisited: user.stats.monumentsVisited,
      milesInCar: user.stats.milesInCar,
      milesFlown: user.stats.milesFlown,
      milesInTrain: user.stats.milesInTrain,
      milesOnBike: user.stats.milesOnBike,
      milesOnFoot: user.stats.milesOnFoot
    }))
  );
  await disconnectDb();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { seedIfEmpty, resetAndSeed, DEMO_PASSWORD };
