const express = require("express");
const Player = require("../models/player.js");
const { requireAuth, requireLevel } = require("../middleware/auth");

const router = express.Router();

const TYPE_OPTIONS = ["Carri", "Aerei", "Missili", "Misto"];
const ROLE_OPTIONS = ["R1", "R2", "R3", "R4", "R5"];

function parseOptionalNumber(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return n;
}

function sanitizeText(v, maxLen = 2000) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizeType(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return TYPE_OPTIONS.includes(s) ? s : null;
}

function normalizeRole(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return ROLE_OPTIONS.includes(s) ? s : null;
}

function validateNickname(nickname) {
  const n = String(nickname ?? "").trim();
  if (n.length < 2) return { ok: false, msg: "Nickname troppo corto (min 2 caratteri)." };
  if (n.length > 40) return { ok: false, msg: "Nickname troppo lungo (max 40 caratteri)." };
  return { ok: true, value: n };
}

function isAdmin(user) {
  return user && user.authLevel >= 5;
}

// LIST
router.get("/", requireAuth, async (req, res) => {
  try {
    const players = await Player.find({}).sort({ updatedAt: -1, nickname: 1 });
    return res.render("potenze/index", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      players,
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: null,
      message: null
    });
  } catch (err) {
    console.error(err);
    return res.render("potenze/index", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      players: [],
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: "Errore interno nel caricamento della lista.",
      message: null
    });
  }
});

// NEW (FORM)
router.get("/new", requireAuth, requireLevel(5), async (req, res) => {
  return res.render("potenze/new", {
    user: req.user,
    types: TYPE_OPTIONS,
    roles: ROLE_OPTIONS,
    error: null,
    message: null,
    form: {
      nickname: "",
      role: "",
      powerT1: "",
      typeT1: "",
      powerT2: "",
      typeT2: "",
      powerT3: "",
      typeT3: "",
      powerT4: "",
      typeT4: "",
      notes: ""
    }
  });
});

// NEW (CREATE)
router.post("/new", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const nickCheck = validateNickname(req.body.nickname);
    if (!nickCheck.ok) {
      return res.render("potenze/new", {
        user: req.user,
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: nickCheck.msg,
        message: null,
        form: { ...req.body }
      });
    }

    const doc = {
      nickname: nickCheck.value,
      role: normalizeRole(req.body.role),

      powerT1: parseOptionalNumber(req.body.powerT1),
      typeT1: normalizeType(req.body.typeT1),

      powerT2: parseOptionalNumber(req.body.powerT2),
      typeT2: normalizeType(req.body.typeT2),

      powerT3: parseOptionalNumber(req.body.powerT3),
      typeT3: normalizeType(req.body.typeT3),

      powerT4: parseOptionalNumber(req.body.powerT4),
      typeT4: normalizeType(req.body.typeT4),

      notes: sanitizeText(req.body.notes, 2000)
    };

    await Player.create(doc);

    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    return res.render("potenze/new", {
      user: req.user,
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: "Errore interno durante la creazione del giocatore.",
      message: null,
      form: { ...req.body }
    });
  }
});

// EDIT (FORM)
router.get("/:id/edit", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).send("404 - Giocatore non trovato");

    return res.render("potenze/edit", {
      user: req.user,
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: null,
      message: null,
      player
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send("500 - Errore interno");
  }
});

// EDIT (UPDATE)
router.post("/:id/edit", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).send("404 - Giocatore non trovato");

    const nickCheck = validateNickname(req.body.nickname);
    if (!nickCheck.ok) {
      // Re-render with a "fake" player object updated with posted values
      const fake = {
        ...player.toObject(),
        ...req.body,
        nickname: String(req.body.nickname ?? "")
      };
      return res.render("potenze/edit", {
        user: req.user,
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: nickCheck.msg,
        message: null,
        player: fake
      });
    }

    player.nickname = nickCheck.value;
    player.role = normalizeRole(req.body.role);

    player.powerT1 = parseOptionalNumber(req.body.powerT1);
    player.typeT1 = normalizeType(req.body.typeT1);

    player.powerT2 = parseOptionalNumber(req.body.powerT2);
    player.typeT2 = normalizeType(req.body.typeT2);

    player.powerT3 = parseOptionalNumber(req.body.powerT3);
    player.typeT3 = normalizeType(req.body.typeT3);

    player.powerT4 = parseOptionalNumber(req.body.powerT4);
    player.typeT4 = normalizeType(req.body.typeT4);

    player.notes = sanitizeText(req.body.notes, 2000);

    await player.save(); // updatedAt will update automatically

    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    return res.status(500).send("500 - Errore interno");
  }
});

// DELETE
router.post("/:id/delete", requireAuth, requireLevel(5), async (req, res) => {
  try {
    await Player.deleteOne({ _id: req.params.id });
    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    return res.status(500).send("500 - Errore interno");
  }
});

module.exports = router;