const express = require("express");
const { requireAuth } = require("../middleware/auth");
const WordGameScore = require("../models/WordGameScore");
const crypto = require("crypto");
const { calculateWordScore } = require("../services/wordGameScoring");
const {
  loadItalianDictionary,
  generateLetters,
  timeBonusForWord,
  validateItalianWord
} = require("../services/wordGameDictionary");

const router = express.Router();
const PLAYER_NAME_RE = /^[\p{L}\p{N} _-]{1,30}$/u;
const UNAVAILABLE_MESSAGE = "Word Game disponibile solo in italiano.";

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

function signGameState(req, letters, round, score = 0, wordsFound = 0) {
  const payload = Buffer.from(JSON.stringify({ letters, round, score, wordsFound, player: playerKey(req) })).toString("base64url");
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
    if (state.player !== playerKey(req) || !/^[A-Z]{10}$/.test(state.letters) || !Number.isInteger(state.round)) return null;
    if (!Number.isInteger(state.score) || state.score < 0 || !Number.isInteger(state.wordsFound) || state.wordsFound < 0) return null;
    return state;
  } catch (_) { return null; }
}

function leaderboardFilter(user) {
  const allianceId = Number(user?.allianceId);
  return !user?.isMaster && Number.isInteger(allianceId) ? { allianceId, language: "it" } : { language: "it" };
}

function refillUsedLetters(currentLetters, usedSlots, round) {
  const slots = [...new Set(usedSlots)].sort((a, b) => a - b);
  if (!slots.length || slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= 10)) return null;
  const source = generateLetters(round);
  const nextLetters = [...currentLetters];
  const replacements = slots.map((slot, index) => {
    const letter = source[index];
    nextLetters[slot] = letter;
    return { slot, letter };
  });
  return { letters: nextLetters.join(""), replacements };
}

async function loadLeaderboard(user) {
  return WordGameScore.find(leaderboardFilter(user))
    .sort({ score: -1, totalTimeMs: 1, createdAt: 1 })
    .limit(20)
    .select("playerName score levelReached wordsFound totalTimeMs totalTimeSeconds language createdAt")
    .lean();
}

function validateScore(body) {
  const playerName = String(body.playerName || "").trim();
  const score = Number(body.score);
  const wordsFound = Number(body.wordsFound);
  const totalTimeMs = Number(body.totalTimeMs);

  if (!PLAYER_NAME_RE.test(playerName)) return { error: "invalidName" };
  if (!Number.isInteger(score) || score < 0 || score > 10000000) return { error: "invalidScore" };
  if (!Number.isInteger(wordsFound) || wordsFound < 0 || wordsFound > 999) return { error: "invalidScore" };
  if (!Number.isFinite(totalTimeMs) || totalTimeMs < 1 || totalTimeMs > 24 * 60 * 60 * 1000) return { error: "invalidScore" };
  return { playerName, score, levelReached: wordsFound + 1, wordsFound, totalTimeMs: Math.round(totalTimeMs), language: "it" };
}

router.get("/", requireAuth, (req, res) => {
  if (!isItalianLanguage(res.locals.currentLang)) return res.status(403).send(UNAVAILABLE_MESSAGE);
  try { loadItalianDictionary(); } catch (error) {
    console.error(error.message);
    return res.status(503).render("word-game", {
      user: req.user,
      title: res.locals.t("wordGame.title"),
      wordGameLanguage: "it",
      wordGameLoadError: true,
      extraCss: ["/css/word-game.css"],
      extraJs: ["/js/word-game-loader.js"]
    });
  }
  res.render("word-game", {
    user: req.user,
    title: res.locals.t("wordGame.title"),
    wordGameLanguage: "it",
    extraCss: ["/css/word-game.css"],
    extraJs: ["/js/word-game-loader.js", "/js/word-game.js"]
  });
});

router.post("/start", requireAuth, requireItalianApi, (req, res) => {
  try {
    const letters = generateLetters(1);
    res.json({ success: true, letters, round: 1, score: 0, wordsFound: 0, gameToken: signGameState(req, letters, 1) });
  } catch (error) {
    console.error(error.message);
    res.status(503).json({ success: false, message: DICTIONARY_UNAVAILABLE_MESSAGE });
  }
});

router.post("/validate", requireAuth, requireItalianApi, (req, res) => {
  const state = readGameState(req, req.body?.gameToken);
  if (!state) return res.status(400).json({ success: false, message: "Partita non valida." });
  try {
    const usedSlots = Array.isArray(req.body?.usedSlots) ? req.body.usedSlots.map(Number) : [];
    if (usedSlots.length !== String(req.body?.word || "").length || new Set(usedSlots).size !== usedSlots.length) {
      return res.status(400).json({ success: false, message: "Selezione tessere non valida." });
    }
    const selectedWord = usedSlots.map((slot) => state.letters[slot] || "").join("");
    if (selectedWord !== String(req.body.word || "").toUpperCase()) {
      return res.status(400).json({ success: false, message: "Selezione tessere non valida." });
    }
    const result = validateItalianWord(req.body?.word, state.letters);
    if (!result.valid) return res.json({ success: true, valid: false, reason: result.reason });
    const scoreDetail = calculateWordScore(result.word);
    const nextRound = state.round + 1;
    const score = state.score + scoreDetail.totalScore;
    const wordsFound = state.wordsFound + 1;
    const refill = refillUsedLetters(state.letters, usedSlots, nextRound);
    if (!refill) return res.status(400).json({ success: false, message: "Selezione tessere non valida." });
    return res.json({
      success: true,
      valid: true,
      word: result.word,
      bonusSeconds: timeBonusForWord(result.word),
      scoreDetail,
      score,
      wordsFound,
      replacements: refill.replacements,
      round: nextRound,
      gameToken: signGameState(req, refill.letters, nextRound, score, wordsFound)
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
    const state = readGameState(req, req.body?.gameToken);
    if (!state || state.score !== valid.score || state.wordsFound !== valid.wordsFound) return res.status(400).json({ error: "invalidScore" });
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
module.exports.refillUsedLetters = refillUsedLetters;
