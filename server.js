require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");

const app = express();

/**
 * RENDER FIX:
 * Must trust proxy completely so express-rate-limit
 * can read X-Forwarded-For safely.
 */
app.set("trust proxy", true);

// DB
connectDB();

// View engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static + parsing
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Rate limit (safe for proxy)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false // disable strict proxy validation
});

app.use("/auth", authLimiter);

// Routes
app.get("/", (req, res) => res.redirect("/auth/login"));
app.use("/auth", authRoutes);

// Protected route
app.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard", { user: req.user });
});

// Logout
app.get("/logout", (req, res) => {
  res.clearCookie("lw_token");
  return res.redirect("/auth/login");
});

// 404
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`LWManager running on port ${PORT}`);
});