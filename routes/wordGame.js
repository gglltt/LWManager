const express = require("express");
const { requireAuth } = require("../middleware/auth");
const WordGameScore = require("../models/WordGameScore");
const crypto = require("crypto");
const {
  loadItalianDictionary,
  generateLetters,
  timeBonusForWord,
  validateItalianWord
} = require("../services/wordGameDictionary");

const router = express.Router();
const PLAYER_NAME_RE = /^[\p{L}\p{N} _-]{1,30}$/u;
const UNAVAILABLE_MESSAGE = "Word Game disponibile solo in italiano.";
const DICTIONARY_UNAVAILABLE_MESSAGE = "Dizionario italiano non disponibile.";

function isItalianLanguage(appLanguage) {
  return /^it/i.test(String(appLanguage || ""));
}

function requireItalianApi(req, res, next) {
  if (!isItalianLanguage(res.locals.currentLang)) {
    return res.status(403).json({ success: false, message: UNAVAILABLE_MESSAGE });
  }
  return next();
}

function gameSecret() {
  return process.env.JWT_SECRET || "lwmanager-word-game-development";
}

function playerKey(req) {
  return String(req.user?.userId || req.user?.accountId || req.user?.username || "authenticated");
}

function signGameState(req, letters, level) {
  const payload = Buffer.from(JSON.stringify({ letters, level, player: playerKey(req) })).toString("base64url");
  const signature = crypto.createHmac("sha256", gameSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function readGameState(req, token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;
  const expected = crypto.createHmac("sha256", gameSecret()).update(payload).digest();
  let supplied;
  try { supplied = Buffer.from(signature, "base64url"); } catch (_) { return null; }
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  try {
    const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (state.player !== playerKey(req) || !/^[A-Z]{10}$/.test(state.letters) || !Number.isInteger(state.level)) return null;
    return state;
  } catch (_) { return null; }
}

function leaderboardFilter(user) {
  const allianceId = Number(user?.allianceId);
  return !user?.isMaster && Number.isInteger(allianceId) ? { allianceId, language: "it" } : { language: "it" };
}

async function loadLeaderboard(user) {
  return WordGameScore.find(leaderboardFilter(user))
    .sort({ levelReached: -1, wordsFound: -1, totalTimeMs: 1, createdAt: 1 })
    .limit(20)
    .select("playerName levelReached wordsFound totalTimeMs totalTimeSeconds language createdAt")
    .lean();
}

function validateScore(body) {
  const playerName = String(body.playerName || "").trim();
  const levelReached = Number(body.levelReached);
  const wordsFound = Number(body.wordsFound);
  const totalTimeMs = Number(body.totalTimeMs);

  if (!PLAYER_NAME_RE.test(playerName)) return { error: "invalidName" };
  if (!Number.isInteger(levelReached) || levelReached < 1 || levelReached > 1000) return { error: "invalidScore" };
  if (!Number.isInteger(wordsFound) || wordsFound < 0 || wordsFound > 999 || levelReached !== wordsFound + 1) return { error: "invalidScore" };
  if (!Number.isFinite(totalTimeMs) || totalTimeMs < 1 || totalTimeMs > 24 * 60 * 60 * 1000) return { error: "invalidScore" };
  return { playerName, levelReached, wordsFound, totalTimeMs: Math.round(totalTimeMs), language: "it" };
}

router.get("/", requireAuth, (req, res) => {
  if (!isItalianLanguage(res.locals.currentLang)) return res.status(403).send(UNAVAILABLE_MESSAGE);
  try { loadItalianDictionary(); } catch (error) {
    console.error(error.message);
    return res.status(503).send(DICTIONARY_UNAVAILABLE_MESSAGE);
  }
  res.render("word-game", {
    user: req.user,
    title: res.locals.t("wordGame.title"),
    wordGameLanguage: "it",
    extraCss: ["/css/word-game.css"],
    extraJs: ["/js/word-game.js"]
  });
});

router.post("/start", requireAuth, requireItalianApi, (req, res) => {
  try {
    const letters = generateLetters(1);
    res.json({ success: true, letters, level: 1, gameToken: signGameState(req, letters, 1) });
  } catch (error) {
    console.error(error.message);
    res.status(503).json({ success: false, message: DICTIONARY_UNAVAILABLE_MESSAGE });
  }
});

router.post("/validate", requireAuth, requireItalianApi, (req, res) => {
  const state = readGameState(req, req.body?.gameToken);
  if (!state) return res.status(400).json({ success: false, message: "Partita non valida." });
  try {
    const result = validateItalianWord(req.body?.word, state.letters);
    if (!result.valid) return res.json({ success: true, valid: false, reason: result.reason });
    const nextLevel = state.level + 1;
    const letters = generateLetters(nextLevel);
    return res.json({
      success: true,
      valid: true,
      word: result.word,
      bonusSeconds: timeBonusForWord(result.word),
      letters,
      level: nextLevel,
      gameToken: signGameState(req, letters, nextLevel)
    });
  } catch (error) {
    console.error(error.message);
    return res.status(503).json({ success: false, message: DICTIONARY_UNAVAILABLE_MESSAGE });
  }
});

router.get("/leaderboard", requireAuth, requireItalianApi, async (req, res, next) => {
  try { res.json({ leaderboard: await loadLeaderboard(req.user) }); } catch (error) { next(error); }
});

router.post("/score", requireAuth, requireItalianApi, async (req, res, next) => {
  try {
    const valid = validateScore(req.body || {});
    if (valid.error) return res.status(400).json({ error: valid.error });
    const allianceId = Number(req.user?.allianceId);
    await WordGameScore.create({
      ...valid,
      totalTimeSeconds: Math.round(valid.totalTimeMs / 100) / 10,
      allianceId: Number.isInteger(allianceId) ? allianceId : null,
      serverNumber: Number.isInteger(Number(req.user?.serverNumber)) ? Number(req.user.serverNumber) : null,
      allianceCode: req.user?.allianceCode || null
    });
    res.json({ message: "scoreSaved", leaderboard: await loadLeaderboard(req.user) });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.isItalianLanguage = isItalianLanguage;
module.exports.readGameState = readGameState;
