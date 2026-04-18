const express = require("express");
const { requireAuth, requireLevel } = require("../middleware/auth");
const { fetchBissPlayers } = require("../utils/lastwarApi");

const router = express.Router();

router.get("/biss-players", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const result = await fetchBissPlayers();

    return res.json({
      ok: true,
      alliance: result.alliance,
      total: result.players.length,
      players: result.players,
      meta: result.meta
    });
  } catch (err) {
    console.error("LastWar Biss players error:", err.message);
    return res.status(500).json({
      ok: false,
      error: "Impossibile recuperare i giocatori Biss da LastWar Tools API.",
      details: err.message
    });
  }
});

module.exports = router;
