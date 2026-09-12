const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Trip = require("../models/Trip");
const { requireAuth, requireGuest } = require("../middleware/auth");
const { logTrip, getLeaderboard } = require("../services/statsService");
const { POINT_VALUES } = require("../config/scoring");

const router = express.Router();

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function statCards(stats) {
  return [
    { key: "distanceTraveled", label: "Distance Traveled", value: stats.distanceTraveled, suffix: " mi" },
    { key: "countiesVisited", label: "Counties Visited", value: stats.countiesVisited, suffix: "" },
    { key: "statesVisited", label: "States Visited", value: stats.statesVisited, suffix: "" },
    { key: "monumentsVisited", label: "Monuments Visited", value: stats.monumentsVisited, suffix: "" },
    { key: "milesInCar", label: "Miles in Car", value: stats.milesInCar, suffix: " mi" },
    { key: "milesFlown", label: "Miles Flown", value: stats.milesFlown, suffix: " mi" },
    { key: "milesInTrain", label: "Miles in Train", value: stats.milesInTrain, suffix: " mi" },
    { key: "milesOnBike", label: "Miles on Bike", value: stats.milesOnBike, suffix: " mi" },
    { key: "milesOnFoot", label: "Miles on Foot", value: stats.milesOnFoot, suffix: " mi" }
  ];
}

router.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/hub");
  res.render("index", { title: "Travelog" });
});

router.get("/register", requireGuest, (req, res) => {
  res.render("register", { title: "Create account", error: null, form: {} });
});

router.post("/register", requireGuest, async (req, res) => {
  const { username, displayName, email, password } = req.body;
  try {
    if (!username || !displayName || !email || !password) {
      throw Object.assign(new Error("All fields are required."), { status: 400 });
    }
    if (String(password).length < 6) {
      throw Object.assign(new Error("Password must be at least 6 characters."), { status: 400 });
    }

    const user = await User.create({
      username,
      displayName,
      email,
      passwordHash: await bcrypt.hash(password, 10)
    });

    req.session.user = {
      id: user._id.toString(),
      username: user.username,
      displayName: user.displayName
    };
    res.redirect("/hub");
  } catch (error) {
    const message =
      error.code === 11000
        ? "That username or email is already in use."
        : error.message || "Could not create account.";
    res.status(error.status || 400).render("register", {
      title: "Create account",
      error: message,
      form: { username, displayName, email }
    });
  }
});

router.get("/login", requireGuest, (req, res) => {
  res.render("login", { title: "Log in", error: null });
});

router.post("/login", requireGuest, async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({
    $or: [{ username: String(username || "").toLowerCase() }, { email: String(username || "").toLowerCase() }]
  });

  if (!user || !(await bcrypt.compare(password || "", user.passwordHash))) {
    return res.status(401).render("login", { title: "Log in", error: "Invalid username or password." });
  }

  req.session.user = {
    id: user._id.toString(),
    username: user.username,
    displayName: user.displayName
  };
  res.redirect("/hub");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

router.get("/hub", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.user.id);
  const trips = await Trip.find({ user: user._id }).sort({ date: -1, createdAt: -1 }).limit(8);
  res.render("hub", {
    title: "Hub",
    user,
    trips,
    cards: statCards(user.stats),
    formatNumber
  });
});

router.get("/log", requireAuth, (req, res) => {
  res.render("log", {
    title: "Log travel",
    error: null,
    pointValues: POINT_VALUES
  });
});

router.post("/log", requireAuth, async (req, res) => {
  try {
    await logTrip(req.session.user.id, req.body);
    res.redirect("/hub");
  } catch (error) {
    res.status(error.status || 400).render("log", {
      title: "Log travel",
      error: error.message,
      pointValues: POINT_VALUES
    });
  }
});

router.get("/leaderboard", async (req, res) => {
  const board = await getLeaderboard(50);
  res.render("leaderboard", {
    title: "Leaderboard",
    board,
    formatNumber
  });
});

router.get("/api/leaderboard", async (req, res) => {
  const board = await getLeaderboard(50);
  res.json(board);
});

router.get("/api/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.session.user.id).select("-passwordHash");
  res.json(user);
});

module.exports = router;
