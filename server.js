require("dotenv").config();

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const potenzeRoutes = require("./routes/potenze");
const registroRoutes = require("./routes/registro");
const adminRoutes = require("./routes/admin");
const passwordsRoutes = require("./routes/passwords");
const season6StrategyRoutes = require("./routes/season6Strategy");
const performanceVsRoutes = require("./routes/performanceVs");
const { requireAuth } = require("./middleware/auth");
const { cleanupOldEventLogs } = require("./utils/eventLog");
const {
  SUPPORTED_LANGS,
  FLAG_BY_LANG,
  NAME_BY_LANG,
  LOCALE_BY_LANG,
  resolveLang,
  getTranslator,
  translateTeamType
} = require("./config/i18n");

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

app.use((req, res, next) => {
  const qLang = typeof req.query?.lang === "string" ? req.query.lang.toLowerCase() : "";
  const cookieLang = typeof req.cookies?.lw_lang === "string" ? req.cookies.lw_lang.toLowerCase() : "";
  const currentLang = resolveLang(qLang || cookieLang || "it");

  if (cookieLang !== currentLang) {
    res.cookie("lw_lang", currentLang, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: "lax" });
  }

  res.locals.currentLang = currentLang;
  res.locals.isRTL = currentLang === "ar";
  res.locals.currentFlag = FLAG_BY_LANG[currentLang];
  res.locals.localeTag = LOCALE_BY_LANG[currentLang] || "it-IT";
  res.locals.availableLanguages = SUPPORTED_LANGS.map((code) => ({
    code,
    name: NAME_BY_LANG[code],
    flag: FLAG_BY_LANG[code],
    active: code === currentLang
  }));
  res.locals.currentUrl = req.originalUrl || "/";
  res.locals.t = getTranslator(currentLang);
  res.locals.translateTeamType = (type) => translateTeamType(type, currentLang);
  next();
});

app.get("/set-language", (req, res) => {
  const lang = resolveLang(typeof req.query.lang === "string" ? req.query.lang.toLowerCase() : "it");
  const returnToRaw = typeof req.query.returnTo === "string" ? req.query.returnTo : "/auth/login";
  const returnTo = returnToRaw.startsWith("/") ? returnToRaw : "/auth/login";

  res.cookie("lw_lang", lang, { maxAge: 365 * 24 * 60 * 60 * 1000, sameSite: "lax" });
  return res.redirect(returnTo);
});

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

app.get("/novita", requireAuth, (req, res) => {
  res.render("novita", { user: req.user });
});

app.get("/stagione-6", requireAuth, (req, res) => {
  const seasonContentLang = req.resolvedSeason6Lang || (["it", "fr"].includes(res.locals.currentLang) ? res.locals.currentLang : "en");
  res.render("stagione6", { user: req.user, seasonContentLang, extraJs: ["/js/stagione6-guides.js"] });
});

app.get("/stagione-6/altari", requireAuth, (req, res) => {
  const seasonContentLang = req.resolvedSeason6Lang || (["it", "fr"].includes(res.locals.currentLang) ? res.locals.currentLang : "en");
  const titleByLang = {
    it: "Altari Stagione 6",
    fr: "Autels Saison 6",
    en: "Season 6 Altars"
  };
  res.render("stagione6-altari", { user: req.user, seasonContentLang, title: titleByLang[seasonContentLang] || titleByLang.en });
});

app.use("/potenze", potenzeRoutes);
app.use("/admin", adminRoutes);
app.use("/passwords", passwordsRoutes);
app.use("/registro", registroRoutes);
app.use("/season6-strategy", season6StrategyRoutes);
app.use("/performance-vs", performanceVsRoutes);

app.get("/logout", requireAuth, async (req, res) => {
  await cleanupOldEventLogs().catch(() => {});
  const { createEventLog } = require("./utils/eventLog");
  await createEventLog(req, "logout", `role=${req.user.role}`);
  res.clearCookie("lw_token");
  return res.redirect("/auth/login");
});

// 404
app.use((req, res) => {
  res.status(404).send("404 - Not Found");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LWManager running on port ${PORT}`));
