let express;
try {
  express = require("express");
} catch (error) {
  console.error("\nNode is working, but this project's packages are not installed yet.");
  console.error("In the VS Code terminal, run:\n");
  console.error("  npm install");
  console.error("  npm start\n");
  process.exit(1);
}

const path = require("path");
const session = require("express-session");
const store = require("./lib/store");
const { POINT_VALUES } = require("./lib/scoring");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.get("/favicon.ico", (req, res) => res.status(204).end());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: "travelog-local-dev",
    resave: false,
    saveUninitialized: true
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = store.ensureCurrentUser(req.session);
  res.locals.formatNumber = (value) =>
    Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
  res.locals.pointValues = POINT_VALUES;
  next();
});

function statCards(stats) {
  return [
    { label: "Distance Traveled", value: stats.distanceTraveled, suffix: " mi" },
    { label: "Counties Visited", value: stats.countiesVisited, suffix: "" },
    { label: "States Visited", value: stats.statesVisited, suffix: "" },
    { label: "Monuments Visited", value: stats.monumentsVisited, suffix: "" },
    { label: "Miles in Car", value: stats.milesInCar, suffix: " mi" },
    { label: "Miles Flown", value: stats.milesFlown, suffix: " mi" },
    { label: "Miles in Train", value: stats.milesInTrain, suffix: " mi" },
    { label: "Miles on Bike", value: stats.milesOnBike, suffix: " mi" },
    { label: "Miles on Foot", value: stats.milesOnFoot, suffix: " mi" }
  ];
}

app.get("/", (req, res) => {
  res.render("index", { title: "Travelog" });
});

app.get("/hub", (req, res) => {
  const user = res.locals.currentUser;
  res.render("hub", {
    title: "Hub",
    user,
    cards: statCards(user.stats),
    trips: store.getTrips(user.id)
  });
});

app.get("/log", (req, res) => {
  res.render("log", { title: "Log travel", error: null, form: {} });
});

app.post("/log", (req, res) => {
  const user = res.locals.currentUser;
  try {
    store.logTrip(user, req.body);
    res.redirect("/hub");
  } catch (error) {
    res.status(400).render("log", {
      title: "Log travel",
      error: error.message || "Could not save that trip.",
      form: req.body
    });
  }
});

app.get("/leaderboard", (req, res) => {
  res.render("leaderboard", {
    title: "Leaderboard",
    travelers: store.getLeaderboard()
  });
});

app.use((req, res) => {
  res.status(404).render("error", { title: "Not found", message: "That page does not exist." });
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("");
    console.log("  Travelog is running.");
    console.log(`  Open this link in your browser: http://localhost:${PORT}`);
    console.log("");
    console.log("  VS Code tip: Ctrl+click (Windows) or Cmd+click (Mac) the link.");
    console.log("  Press Ctrl+C in this terminal to stop the server.");
    console.log("");
  });
}

module.exports = { app };
