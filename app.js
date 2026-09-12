const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { extractGps, matchFamous } = require("./lib/identify");
const { identifyLandmarks } = require("./lib/landmarks");
const { canonicalCountryName } = require("./lib/geo");
const { guessCountriesAlongRoute, listCountryNames, countryAtLatLon } = require("./lib/countries-along");
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
  recordMonumentVisit,
  listMonumentVisits,
  listMapData,
  setUserStats,
  createTraveler,
  seedDemoMapForUser,
  seedSocialDemo,
  followUser,
  unfollowUser,
  createSocialPost,
  setTripPrivacy,
  listSocialFeed,
  listPeopleToFollow,
  presentTraveler,
  rankFromScore,
  formatScore,
  formatStat,
  SCORE_WEIGHTS,
} = require("./db");

const DEFAULT_URI = "mongodb://127.0.0.1:27017/travel-log";
const PORT = Number(process.env.PORT) || 3000;

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PHOTOS_DIR = path.join(__dirname, "public", "monument-photos");
const SOCIAL_PHOTOS_DIR = path.join(__dirname, "public", "social-photos");
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(SOCIAL_PHOTOS_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const typeOk = /image\/(jpeg|png|webp|heic|heif)/i.test(file.mimetype);
    const nameOk = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.originalname || "");
    if (typeOk || nameOk) return cb(null, true);
    cb(new Error("Please upload a JPEG, PNG, WebP, or HEIC photo."));
  },
});
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
  if (!req.session.travelerId) return null;
  return User.findById(req.session.travelerId);
}

async function enterAsTestUser(req) {
  let user = await User.findOne({ username: "jordan" });
  if (!user) user = await User.findOne().sort({ score: -1, username: 1 });
  if (!user) {
    user = await createTraveler({
      displayName: "Jordan Lee",
      handle: "jordan",
      homeBase: "Demo",
    });
  }
  await seedDemoMapForUser(user._id);
  await seedSocialDemo(user._id);
  req.session.travelerId = String(user._id);
  return user;
}

async function finishMonumentVisit(req, res, match) {
  const result = await recordMonumentVisit(req.userDoc._id, match);
  flash(
    req,
    "success",
    result.newVisit ? `${match.name} added. +${formatScore(SCORE_WEIGHTS.firstMonument)} XP` : `${match.name} was already in your log. Photo updated.`
  );
  req.session.latestMonument = {
    ...result.visit,
    newVisit: result.newVisit,
    photoPath: match.photoPath,
    source: match.source || result.visit.source || "",
  };
  return req.session.save(() => res.redirect("/monuments"));
}

function requireTraveler(req, res, next) {
  if (res.locals.traveler) return next();
  flash(req, "error", "Log in to continue.");
  return res.redirect("/login");
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

app.get("/", (_req, res) => {
  res.render("home", { page: "home", title: "Home" });
});

app.get("/login", (req, res) => {
  if (res.locals.traveler) return res.redirect("/hub");
  res.render("login", { page: "login", title: "Log in" });
});

app.get("/signup", (req, res) => {
  if (res.locals.traveler) return res.redirect("/hub");
  res.render("signup", { page: "signup", title: "Create account" });
});

app.post(
  "/login",
  asyncHandler(async (req, res) => {
    await enterAsTestUser(req);
    flash(req, "success", "Signed in as the test traveler.");
    return req.session.save(() => res.redirect("/hub"));
  })
);

app.post(
  "/signup",
  asyncHandler(async (req, res) => {
    await enterAsTestUser(req);
    flash(req, "success", "Account created — entering as the test traveler.");
    return req.session.save(() => res.redirect("/hub"));
  })
);

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

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

function placeFromNominatim(hit) {
  const address = hit.address || {};
  const name = hit.name || address.city || address.town || address.village || address.state || hit.display_name;
  return {
    name: String(name || "").split(",")[0].trim(),
    displayName: hit.display_name || name || "",
    lat: Number(hit.lat),
    lon: Number(hit.lon),
    country: countryAtLatLon(Number(hit.lat), Number(hit.lon)) || canonicalCountryName(address.country || ""),
    state: address.state || "",
  };
}

async function nominatimGet(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "WaypointHackathon/1.0 (travel log prototype)",
    },
  });
  if (!response.ok) throw new Error("Could not look up that place.");
  return response.json();
}

app.get("/log", requireTraveler, (_req, res) => {
  res.render("log", {
    page: "log",
    title: "Log a trip",
    today: todayStamp(),
    cartoApiKey: process.env.CARTO_API_KEY || "",
  });
});

app.get(
  "/api/geocode",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    if (q.length < 2) return res.json([]);
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
    const hits = await nominatimGet(url);
    res.json((Array.isArray(hits) ? hits : []).map(placeFromNominatim).filter((place) => Number.isFinite(place.lat)));
  })
);

app.get(
  "/api/geocode/reverse",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "Need lat and lon." });
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
    const hit = await nominatimGet(url);
    res.json(placeFromNominatim(hit));
  })
);

app.get("/api/countries", requireTraveler, (_req, res) => {
  res.json(listCountryNames());
});

app.post(
  "/api/route-countries",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const stops = Array.isArray(req.body.stops) ? req.body.stops : [];
    const modes = Array.isArray(req.body.modes) ? req.body.modes : [];
    res.json({ countries: guessCountriesAlongRoute(stops, modes) });
  })
);

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

app.get(
  "/social",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").trim();
    const [feed, people] = await Promise.all([
      listSocialFeed(req.userDoc._id),
      listPeopleToFollow(req.userDoc._id, q),
    ]);
    res.render("social", {
      page: "social",
      title: "Social",
      feed,
      people,
      q,
    });
  })
);

app.post(
  "/social",
  requireTraveler,
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (!err) return next();
      flash(req, "error", err.message || "Could not upload that photo.");
      res.redirect("/social");
    });
  },
  asyncHandler(async (req, res) => {
    try {
      let photoPath = "";
      if (req.file) {
        const extMatch = path.extname(req.file.originalname || "").toLowerCase();
        const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(extMatch) ? extMatch : ".jpg";
        const filename = `${crypto.randomUUID()}${safeExt}`;
        fs.writeFileSync(path.join(SOCIAL_PHOTOS_DIR, filename), req.file.buffer);
        photoPath = filename;
      }
      await createSocialPost(req.userDoc._id, {
        body: req.body.body,
        place: req.body.place,
        photoPath,
      });
      flash(req, "success", "Posted.");
    } catch (err) {
      flash(req, "error", err.message);
    }
    res.redirect("/social");
  })
);

app.post(
  "/social/follow",
  requireTraveler,
  asyncHandler(async (req, res) => {
    try {
      await followUser(req.userDoc._id, req.body.travelerId);
      flash(req, "success", "Following.");
    } catch (err) {
      flash(req, "error", err.message);
    }
    const q = String(req.body.q || "").trim();
    res.redirect(q ? `/social?q=${encodeURIComponent(q)}` : "/social");
  })
);

app.post(
  "/social/unfollow",
  requireTraveler,
  asyncHandler(async (req, res) => {
    await unfollowUser(req.userDoc._id, req.body.travelerId);
    const q = String(req.body.q || "").trim();
    res.redirect(q ? `/social?q=${encodeURIComponent(q)}` : "/social");
  })
);

app.post(
  "/social/trips/:id/share",
  requireTraveler,
  asyncHandler(async (req, res) => {
    try {
      await setTripPrivacy(req.userDoc._id, req.params.id, "followers");
      flash(req, "success", "Trip shared.");
    } catch (err) {
      flash(req, "error", err.message);
    }
    res.redirect(req.get("referer")?.includes("/social") ? "/social" : "/hub");
  })
);

app.post(
  "/social/trips/:id/unshare",
  requireTraveler,
  asyncHandler(async (req, res) => {
    try {
      await setTripPrivacy(req.userDoc._id, req.params.id, "onlyme");
      flash(req, "success", "Trip is private.");
    } catch (err) {
      flash(req, "error", err.message);
    }
    res.redirect(req.get("referer")?.includes("/social") ? "/social" : "/hub");
  })
);

app.get("/stats", requireTraveler, (_req, res) => {
  res.render("stats", { page: "stats", title: "Stats" });
});

app.get("/map", requireTraveler, (_req, res) => {
  res.render("map", {
    page: "map",
    title: "Map",
    cartoApiKey: process.env.CARTO_API_KEY || "",
  });
});

app.get(
  "/api/map",
  requireTraveler,
  asyncHandler(async (req, res) => {
    res.json(await listMapData(req.userDoc._id));
  })
);

app.get(
  "/monuments",
  requireTraveler,
  asyncHandler(async (req, res) => {
    res.render("monuments", {
      page: "monuments",
      title: "Monuments",
      error: null,
      latest: req.session.latestMonument || null,
      pending: req.session.pendingMonument || null,
      entries: await listMonumentVisits(req.userDoc._id),
    });
    delete req.session.latestMonument;
  })
);

app.post(
  "/monuments/upload",
  requireTraveler,
  (req, res, next) => {
    upload.single("photo")(req, res, (err) => {
      if (!err) return next();
      const message =
        err.code === "LIMIT_FILE_SIZE" ? "Photo must be 5MB or smaller." : err.message || "Could not upload that photo.";
      flash(req, "error", message);
      res.redirect("/monuments");
    });
  },
  asyncHandler(async (req, res) => {
    if (!req.file) {
      flash(req, "error", "Choose a photo to upload.");
      return res.redirect("/monuments");
    }

    const extMatch = path.extname(req.file.originalname || "").toLowerCase();
    const safeExt = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"].includes(extMatch) ? extMatch : ".jpg";
    const filename = `${crypto.randomUUID()}${safeExt}`;
    fs.writeFileSync(path.join(PHOTOS_DIR, filename), req.file.buffer);

    const gps = await extractGps(req.file.buffer);
    const gpsMatch = gps ? matchFamous(gps.lat, gps.lon) : null;
    if (gpsMatch) {
      return finishMonumentVisit(req, res, {
        ...gpsMatch,
        lat: gps.lat,
        lon: gps.lon,
        photoPath: filename,
        source: "exif",
      });
    }

    let candidates = [];
    try {
      candidates = await identifyLandmarks(req.file.buffer);
    } catch (err) {
      flash(req, "error", err.message || "Could not identify that photo.");
      return res.redirect("/monuments");
    }

    if (!candidates.length) {
      flash(req, "error", "No listed monument matched this photo. Try another angle, or a photo with location on.");
      return res.redirect("/monuments");
    }

    req.session.pendingMonument = {
      photoPath: filename,
      candidates,
      source: "vision",
    };
    flash(req, "success", "Photo matched. Confirm the monument to add it.");
    return req.session.save(() => res.redirect("/monuments"));
  })
);

app.post(
  "/monuments/confirm",
  requireTraveler,
  asyncHandler(async (req, res) => {
    const pending = req.session.pendingMonument;
    if (!pending || !pending.photoPath) {
      flash(req, "error", "Upload a photo first.");
      return res.redirect("/monuments");
    }

    const famousId = String(req.body.famousId || "");
    const match = (pending.candidates || []).find((row) => row.famousId === famousId);
    if (!match) {
      flash(req, "error", "Pick one of the suggested monuments.");
      return res.redirect("/monuments");
    }

    delete req.session.pendingMonument;
    return finishMonumentVisit(req, res, {
      ...match,
      photoPath: pending.photoPath,
      source: pending.source || "vision",
    });
  })
);

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
      rank: me ? rankFromScore(me.score) : null,
    });
  })
);

app.get("/ranks", (_req, res) => {
  res.redirect("/leaderboard");
});

app.get(
  "/profile",
  requireTraveler,
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
  const demo = (await User.findOne({ username: "jordan" })) || (await createTraveler({
    displayName: "Jordan Lee",
    handle: "jordan",
    homeBase: "Demo",
  }));
  await seedDemoMapForUser(demo._id);
  await seedSocialDemo(demo._id);
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
