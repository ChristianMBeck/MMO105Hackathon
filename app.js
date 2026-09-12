require("dotenv").config();

const path = require("path");
const express = require("express");
const { connect, mongoose, User, TravelLog } = require("./db");

const DEFAULT_URI = "mongodb://127.0.0.1:27017/travel-log";
const PORT = Number(process.env.PORT) || 3000;

const STAT_CARDS = [
  { key: "distanceTraveled", label: "Distance traveled", suffix: " mi" },
  { key: "countiesVisited", label: "Counties visited", suffix: "" },
  { key: "statesVisited", label: "States visited", suffix: "" },
  { key: "monumentsVisited", label: "Monuments visited", suffix: "" },
  { key: "milesCar", label: "Miles in car", suffix: " mi" },
  { key: "milesFlown", label: "Miles flown", suffix: " mi" },
  { key: "milesTrain", label: "Miles in train", suffix: " mi" },
  { key: "milesBike", label: "Miles on bike", suffix: " mi" },
  { key: "milesFoot", label: "Miles on foot", suffix: " mi" },
];

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.locals.statCards = STAT_CARDS;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

app.get(
  "/",
  asyncHandler(async (_req, res) => {
    const leaderboard = await User.leaderboard(25);
    res.render("home", {
      title: "Travel Log",
      dbName: mongoose.connection.name,
      dbReady: mongoose.connection.readyState === 1,
      leaderboard,
    });
  })
);

app.get(
  "/hub/:username",
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ username: req.params.username }).lean();
    if (!user) {
      return res.status(404).render("home", {
        title: "Not found",
        dbName: mongoose.connection.name,
        dbReady: mongoose.connection.readyState === 1,
        leaderboard: await User.leaderboard(25),
        error: `No traveler named "${req.params.username}".`,
      });
    }

    const logs = await TravelLog.find({ user: user._id }).sort({ occurredAt: -1 }).lean();
    res.render("hub", {
      title: `${user.displayName || user.username} · Hub`,
      dbName: mongoose.connection.name,
      dbReady: mongoose.connection.readyState === 1,
      user,
      logs,
    });
  })
);

app.get("/api/health", (_req, res) => {
  const { readyState, name, host } = mongoose.connection;
  res.json({
    ok: readyState === 1,
    database: name || null,
    host: host || null,
    readyState,
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).send("Something went wrong.");
});

async function start() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  await connect(uri);
  const { host, name, readyState } = mongoose.connection;
  if (readyState !== 1) {
    throw new Error("MongoDB did not reach a connected state");
  }
  app.listen(PORT, () => {
    console.log(`MongoDB connected: ${host}/${name}`);
    console.log(`App listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start app:", err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
