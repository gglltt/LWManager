const express = require("express");
const { requireAuth } = require("../middleware/auth");
const WordGameScore = require("../models/WordGameScore");

const router = express.Router();
const PLAYER_NAME_RE = /^[\p{L}\p{N} _-]{1,30}$/u;
const GAME_LANGUAGES = new Set(["it", "en", "fr"]);

function gameLanguage(appLanguage) {
  return GAME_LANGUAGES.has(appLanguage) ? appLanguage : "en";
}

function leaderboardFilter(user) {
  const allianceId = Number(user?.allianceId);
  return !user?.isMaster && Number.isInteger(allianceId) ? { allianceId } : {};
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
  const language = gameLanguage(String(body.language || "en").toLowerCase());

  if (!PLAYER_NAME_RE.test(playerName)) return { error: "invalidName" };
  if (!Number.isInteger(levelReached) || levelReached < 1 || levelReached > 1000) return { error: "invalidScore" };
  if (!Number.isInteger(wordsFound) || wordsFound < 0 || wordsFound > 999 || levelReached !== wordsFound + 1) return { error: "invalidScore" };
  if (!Number.isFinite(totalTimeMs) || totalTimeMs < 1 || totalTimeMs > 24 * 60 * 60 * 1000) return { error: "invalidScore" };
  return { playerName, levelReached, wordsFound, totalTimeMs: Math.round(totalTimeMs), language };
}

router.get("/", requireAuth, (req, res) => {
  const language = gameLanguage(res.locals.currentLang);
  res.render("word-game", {
    user: req.user,
    title: res.locals.t("wordGame.title"),
    wordGameLanguage: language,
    extraCss: ["/css/word-game.css"],
    extraJs: ["/js/word-game.js"]
  });
});

router.get("/leaderboard", requireAuth, async (req, res, next) => {
  try { res.json({ leaderboard: await loadLeaderboard(req.user) }); } catch (error) { next(error); }
});

router.post("/score", requireAuth, async (req, res, next) => {
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
