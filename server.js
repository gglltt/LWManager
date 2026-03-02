require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const { requireAuth } = require("./middleware/auth");

const app = express();

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

// Basic security rate limits (adjust as needed)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false
});

app.use("/auth", authLimiter);

// Routes
app.get("/", (req, res) => res.redirect("/auth/login"));
app.use("/auth", authRoutes);

// Protected example route
app.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard", { user: req.user });
});

// Logout shortcut
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