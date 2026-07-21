const express = require("express");
const { requireAuth } = require("../middleware/auth");
const MemoryGameScore = require("../models/MemoryGameScore");
const MemoryEngine = require("../public/js/memory-game-engine");

const router = express.Router();
const PLAYER_NAME_RE = /^[\p{L}\p{N} _-]{1,30}$/u;
const MAX_TOTAL_TIME_MS = 2 * 60 * 60 * 1000;
const TOTAL_PAIRS = MemoryEngine.LEVELS.reduce((sum, level) => sum + level.pairs, 0);

function leaderboardFilter(user) {
  const allianceId = Number(user?.allianceId);
  if (user?.isMaster) return {};
  return Number.isInteger(allianceId) ? { allianceId } : { _id: { $exists: false } };
}

async function loadLeaderboard(user) {
  const rows = await MemoryGameScore.find(leaderboardFilter(user))
    .sort({ score: -1, levelsCompleted: -1, totalTimeMs: 1, createdAt: 1 })
    .limit(20)
    .select("playerName score levelsCompleted levelReached pairsFound mistakes totalTimeMs totalTimeSeconds createdAt")
    .lean();
  return rows.map(({ mistakes, ...row }) => ({ ...row, errors: mistakes }));
}

function completedPairs(levelsCompleted) {
  return MemoryEngine.LEVELS
    .slice(0, levelsCompleted)
    .reduce((sum, level) => sum + level.pairs, 0);
}

function maximumScore(levelsCompleted, pairsFound) {
  let score = 0;
  for (let index = 0; index < levelsCompleted; index += 1) {
    const level = MemoryEngine.LEVELS[index];
    score += level.pairs * MemoryEngine.pairPoints(level.level);
    score += level.timeLimit * MemoryEngine.TIME_BONUS_MULTIPLIER;
  }
  if (levelsCompleted < MemoryEngine.MAX_LEVEL) {
    const currentLevel = MemoryEngine.LEVELS[levelsCompleted];
    score += (pairsFound - completedPairs(levelsCompleted)) * MemoryEngine.pairPoints(currentLevel.level);
  }
  return score;
}

function validateScore(body) {
  const playerName = String(body.playerName || "").trim();
  const score = Number(body.score);
  const levelsCompleted = Number(body.levelsCompleted);
  const levelReached = Number(body.levelReached);
  const pairsFound = Number(body.pairsFound);
  const errors = Number(body.errors);
  const totalTimeMs = Number(body.totalTimeMs);

  if (!PLAYER_NAME_RE.test(playerName)) return { error: "invalidName" };
  if (!Number.isInteger(score) || score < 0 || score > 1_000_000) return { error: "invalidScore" };
  if (!Number.isInteger(levelsCompleted) || levelsCompleted < 0 || levelsCompleted > MemoryEngine.MAX_LEVEL) return { error: "invalidScore" };

  const expectedLevel = levelsCompleted === MemoryEngine.MAX_LEVEL ? MemoryEngine.MAX_LEVEL : levelsCompleted + 1;
  if (!Number.isInteger(levelReached) || levelReached !== expectedLevel) return { error: "invalidScore" };
  const minimumPairs = completedPairs(levelsCompleted);
  const maximumPairs = levelsCompleted === MemoryEngine.MAX_LEVEL
    ? TOTAL_PAIRS
    : minimumPairs + MemoryEngine.LEVELS[levelsCompleted].pairs - 1;
  if (!Number.isInteger(pairsFound) || pairsFound < minimumPairs || pairsFound > maximumPairs) return { error: "invalidScore" };
  if (levelsCompleted === MemoryEngine.MAX_LEVEL && pairsFound !== TOTAL_PAIRS) return { error: "invalidScore" };
  if (score > maximumScore(levelsCompleted, pairsFound)) return { error: "invalidScore" };
  if (!Number.isInteger(errors) || errors < 0 || errors > 100_000) return { error: "invalidScore" };
  if (!Number.isFinite(totalTimeMs) || totalTimeMs <= 0 || totalTimeMs > MAX_TOTAL_TIME_MS) return { error: "invalidScore" };

  return {
    playerName,
    score,
    levelsCompleted,
    levelReached,
    pairsFound,
    errors,
    totalTimeMs: Math.round(totalTimeMs)
  };
}

router.get("/", requireAuth, (req, res) => {
  res.render("memory-game", {
    user: req.user,
    title: res.locals.t("memoryGame.title"),
    extraCss: ["/css/math-game.css", "/css/memory-game.css"],
    extraJs: ["/js/memory-game-engine.js", "/js/memory-game.js"]
  });
});

router.get("/leaderboard", requireAuth, async (req, res) => {
  res.json({ leaderboard: await loadLeaderboard(req.user) });
});

router.post("/score", requireAuth, async (req, res) => {
  const valid = validateScore(req.body || {});
  if (valid.error) return res.status(400).json({ error: valid.error });

  const allianceId = Number(req.user?.allianceId);
  await MemoryGameScore.create({
    playerName: valid.playerName,
    score: valid.score,
    levelsCompleted: valid.levelsCompleted,
    levelReached: valid.levelReached,
    pairsFound: valid.pairsFound,
    mistakes: valid.errors,
    totalTimeMs: valid.totalTimeMs,
    totalTimeSeconds: Math.round(valid.totalTimeMs / 100) / 10,
    allianceId: Number.isInteger(allianceId) ? allianceId : null,
    serverNumber: Number.isInteger(Number(req.user?.serverNumber)) ? Number(req.user.serverNumber) : null,
    allianceCode: req.user?.allianceCode || null
  });

  return res.json({ message: "scoreSaved", leaderboard: await loadLeaderboard(req.user) });
});

module.exports = router;
module.exports.validateScore = validateScore;
module.exports.leaderboardFilter = leaderboardFilter;
