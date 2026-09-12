require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const {
  connect,
  mongoose,
  User,
  TravelLog,
  STAT_META,
  WEIGHTS,
  LADDER,
  logTripFromForm,
  recordTripFromForm,
  setUserStats,
  createTraveler,
  presentTraveler,
  rankFromScore,
  formatScore,
  formatStat,
} = require("./db");

const DEFAULT_URI = "mongodb://127.0.0.1:27017/travel-log";
const PORT = Number(process.env.PORT) || 3000;

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "waypoint-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

app.locals.STAT_META = STAT_META;
app.locals.WEIGHTS = WEIGHTS;
app.locals.LADDER = LADDER;
app.locals.formatScore = formatScore;
app.locals.formatStat = formatStat;
app.locals.rankFromScore = rankFromScore;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function flash(req, type, message) {
  req.session.flash = { type, message };
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function currentUser(req) {
  if (req.session.travelerId) {
    const found = await User.findById(req.session.travelerId);
    if (found) return found;
  }
  const first = await User.findOne().sort({ score: -1, username: 1 });
  if (first) req.session.travelerId = String(first._id);
  return first;
}

function requireTraveler(req, res, next) {
  if (res.locals.traveler) return next();
  flash(req, "error", "Create or pick a traveler first.");
  return res.redirect("/profile");
}

app.use(
  asyncHandler(async (req, res, next) => {
    res.locals.page = "";
    res.locals.title = "";
    res.locals.q = "";
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
    req.userDoc = await currentUser(req);
    res.locals.traveler = presentTraveler(req.userDoc);
    next();
  })
);

app.get("/", (_req, res) => res.redirect("/hub"));

app.get(
  "/hub",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const traveler = res.locals.traveler;
    const [trips, board, total] = await Promise.all([
      TravelLog.find({ user: traveler._id }).sort({ occurredAt: -1 }).limit(8).lean(),
      User.leaderboard(5),
      User.countDocuments(),
    ]);
    res.render("hub", {
      page: "hub",
      title: "Hub",
      rank: rankFromScore(traveler.score),
      position: traveler.rank || "—",
      total,
      trips: trips.map((trip) => ({
        ...trip,
        occurredOn: trip.occurredAt,
        note: trip.notes,
      })),
      board: board.map(presentTraveler),
    });
  })
);

app.get("/log", requireTraveler, (_req, res) => {
  res.render("log", { page: "log", title: "Log a trip", today: todayStamp() });
});

app.get("/record", requireTraveler, (_req, res) => {
  const now = new Date();
  res.render("record", {
    page: "record",
    title: "Record",
    today: todayStamp(),
    time: now.toTimeString().slice(0, 5),
  });
});

app.post(
  "/record",
  requireTraveler,
  asyncHandler(async (req, res) => {
    try {
      const awarded = await recordTripFromForm(req.userDoc._id, req.body);
      flash(req, "success", `Activity recorded. +${formatScore(awarded)} XP`);
      return req.session.save(() => res.redirect("/hub"));
    } catch (err) {
      flash(req, "error", err.message);
      res.redirect("/record");
    }
  })
);

app.post(
  "/log",
  requireTraveler,
  asyncHandler(async (req, res) => {
    try {
      const awarded = await logTripFromForm(req.userDoc._id, req.body);
      flash(req, "success", `Trip saved. +${formatScore(awarded)} XP`);
      return req.session.save(() => res.redirect("/hub"));
    } catch (err) {
      flash(req, "error", err.message);
      res.redirect("/log");
    }
  })
);

app.get("/stats", requireTraveler, (_req, res) => {
  res.render("stats", { page: "stats", title: "Stats" });
});

app.post(
  "/stats",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const score = await setUserStats(req.userDoc._id, req.body);
    flash(req, "success", `Totals saved. Score is now ${formatScore(score)} XP`);
    res.redirect("/hub");
  })
);

app.get(
  "/leaderboard",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = q
      ? {
          $or: [
            { username: new RegExp(safe, "i") },
            { displayName: new RegExp(safe, "i") },
            { homeBase: new RegExp(safe, "i") },
          ],
        }
      : {};
    const rows = await User.find(filter).sort({ score: -1, username: 1 }).lean();
    const travelers = rows.map((row, index) => ({
      ...presentTraveler(row),
      place: index + 1,
    }));
    const me = res.locals.traveler;
    const mine = me ? travelers.find((row) => String(row._id) === String(me._id)) : null;
    res.render("leaderboard", {
      page: "leaderboard",
      title: "Leaderboard",
      q,
      travelers,
      position: mine ? mine.place : "—",
      total: await User.countDocuments(),
    });
  })
);

app.get("/ranks", requireTraveler, (_req, res) => {
  res.render("ranks", {
    page: "ranks",
    title: "Ranks",
    rank: rankFromScore(res.locals.traveler.score),
  });
});

app.get(
  "/profile",
  asyncHandler(async (_req, res) => {
    const others = (await User.find().sort({ displayName: 1, username: 1 }).lean()).map(presentTraveler);
    res.render("profile", { page: "profile", title: "Profile", others });
  })
);

app.post(
  "/profile",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const displayName = String(req.body.displayName || "").trim();
    const nextHandle = String(req.body.handle || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!displayName || nextHandle.length < 3) {
      flash(req, "error", "Name and a handle of at least 3 letters are required.");
      return res.redirect("/profile");
    }
    const taken = await User.exists({ username: nextHandle, _id: { $ne: req.userDoc._id } });
    if (taken) {
      flash(req, "error", "That handle is already taken.");
      return res.redirect("/profile");
    }
    req.userDoc.displayName = displayName;
    req.userDoc.username = nextHandle;
    req.userDoc.homeBase = String(req.body.homeBase || "").trim();
    req.userDoc.bio = String(req.body.bio || "").trim();
    req.userDoc.avatarHue = Math.min(360, Math.max(0, Number(req.body.avatarHue) || 200));
    await req.userDoc.save();
    flash(req, "success", "Profile updated.");
    res.redirect("/profile");
  })
);

app.post(
  "/session/switch",
  asyncHandler(async (req, res) => {
    const next = await User.findById(req.body.travelerId);
    if (!next) {
      flash(req, "error", "Could not switch travelers.");
      return res.redirect("/profile");
    }
    req.session.travelerId = String(next._id);
    flash(req, "success", `Now traveling as ${next.displayName || next.username}.`);
    res.redirect("/hub");
  })
);

app.post(
  "/travelers",
  asyncHandler(async (req, res) => {
    const created = await createTraveler({
      displayName: req.body.displayName,
      handle: req.body.handle,
      homeBase: req.body.homeBase,
    });
    req.session.travelerId = String(created._id);
    flash(req, "success", "Traveler created. Log a trip to start scoring.");
    res.redirect("/hub");
  })
);

app.get("/api/health", (_req, res) => {
  const { readyState, name, host } = mongoose.connection;
  res.json({ ok: readyState === 1, database: name || null, host: host || null, readyState });
});

app.use((req, res) => {
  res.status(404).render("404", { page: "", title: "Not found" });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render("500", {
    page: "",
    title: "Server error",
    message: err.message,
    traveler: res.locals.traveler || null,
    flash: null,
  });
});

async function start() {
  const uri = process.env.MONGODB_URI || DEFAULT_URI;
  await connect(uri);
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB did not reach a connected state");
  }
  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    console.log(`App listening on http://127.0.0.1:${PORT}`);
  });
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start app:", err.message);
    process.exit(1);
  });
}

module.exports = { app, start };
