require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const potenzeRoutes = require("./routes/potenze");
const registroRoutes = require("./routes/registro");
const speseRoutes = require("./routes/spese");
const { requireAuth } = require("./middleware/auth");
const { cleanupOldEventLogs } = require("./utils/eventLog");

const app = express();

app.set("trust proxy", true);

// DB
connectDB()
  .then(() => cleanupOldEventLogs())
  .catch((err) => console.error("Event log cleanup skipped:", err.message));

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.locals.buildVersion = process.env.APP_BUILD_VERSION || process.env.npm_package_version || "dev";

// Static + parsing
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Rate limit
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false
});

app.use("/auth", authLimiter);

// Routes
app.get("/", (req, res) => res.redirect("/auth/login"));
app.use("/auth", authRoutes);

// App routes
app.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard", { user: req.user });
});

app.use("/potenze", potenzeRoutes);
app.use("/registro", registroRoutes);
app.use("/spese", speseRoutes);

app.get("/logout", (req, res) => {
  res.clearCookie("lw_token");
  return res.redirect("/auth/login");
});

// 404
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LWManager running on port ${PORT}`));
