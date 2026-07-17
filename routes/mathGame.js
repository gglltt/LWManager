const express = require("express");
const { requireAuth } = require("../middleware/auth");
const MathGameScore = require("../models/MathGameScore");

const router = express.Router();
const PLAYER_NAME_RE = /^[\p{L}\p{N} _-]{1,30}$/u;

function leaderboardFilter(user) {
  const allianceId = Number(user?.allianceId);
  return !user?.isMaster && Number.isInteger(allianceId) ? { allianceId } : {};
}

async function loadLeaderboard(user) {
  return MathGameScore.find(leaderboardFilter(user))
    .sort({ levelsCompleted: -1, totalTimeMs: 1, createdAt: 1 })
    .limit(20)
    .select("playerName levelsCompleted reachedLevel totalTimeMs totalTimeSeconds createdAt")
    .lean();
}

function validateScore(body) {
  const playerName = String(body.playerName || "").trim();
  const levelsCompleted = Number(body.levelsCompleted);
  const reachedLevel = Number(body.reachedLevel);
  const totalTimeMs = Number(body.totalTimeMs);

  if (!PLAYER_NAME_RE.test(playerName)) return { error: "invalidName" };
  if (!Number.isInteger(levelsCompleted) || levelsCompleted < 0 || levelsCompleted > 500) return { error: "invalidScore" };
  if (!Number.isInteger(reachedLevel) || reachedLevel < 1 || reachedLevel !== levelsCompleted + 1) return { error: "invalidScore" };
  if (!Number.isFinite(totalTimeMs) || totalTimeMs <= 0 || totalTimeMs < levelsCompleted * 300) return { error: "invalidScore" };
  if (totalTimeMs > 60 * 60 * 1000) return { error: "invalidScore" };

  return { playerName, levelsCompleted, reachedLevel, totalTimeMs: Math.round(totalTimeMs) };
}

router.get("/", requireAuth, (req, res) => {
  res.render("math-game", {
    user: req.user,
    title: res.locals.t("mathGame.title"),
    extraCss: ["/css/math-game.css"],
    extraJs: ["/js/math-game.js"]
  });
});

router.get("/leaderboard", requireAuth, async (req, res) => {
  res.json({ leaderboard: await loadLeaderboard(req.user) });
});

router.post("/score", requireAuth, async (req, res) => {
  const valid = validateScore(req.body || {});
  if (valid.error) return res.status(400).json({ error: valid.error });

  const allianceId = Number(req.user?.allianceId);
  await MathGameScore.create({
    playerName: valid.playerName,
    levelsCompleted: valid.levelsCompleted,
    reachedLevel: valid.reachedLevel,
    totalTimeMs: valid.totalTimeMs,
    totalTimeSeconds: Math.round(valid.totalTimeMs / 100) / 10,
    allianceId: Number.isInteger(allianceId) ? allianceId : null,
    serverNumber: Number.isInteger(Number(req.user?.serverNumber)) ? Number(req.user.serverNumber) : null,
    allianceCode: req.user?.allianceCode || null
  });

  res.json({ message: "scoreSaved", leaderboard: await loadLeaderboard(req.user) });
});

module.exports = router;
