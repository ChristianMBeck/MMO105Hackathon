require("dotenv").config();

const path = require("path");
const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const { connectDb } = require("./config/db");
const { seedIfEmpty } = require("./scripts/seed");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.locals.currentUser = null;
  next();
});

async function start() {
  const { uri } = await connectDb();

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "travelog-dev-secret",
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({ mongoUrl: uri, collectionName: "sessions" }),
      cookie: { maxAge: 1000 * 60 * 60 * 24 * 14 }
    })
  );

  app.use((req, res, next) => {
    res.locals.currentUser = req.session.user || null;
    next();
  });

  app.use("/", require("./routes/index"));

  app.use((req, res) => {
    res.status(404).render("error", { title: "Not found", message: "That page does not exist." });
  });

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(error.status || 500).render("error", {
      title: "Error",
      message: error.message || "Something went wrong."
    });
  });

  await seedIfEmpty();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Travelog running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start:", error);
    process.exit(1);
  });
}

module.exports = { app, start };
