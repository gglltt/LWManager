const express = require("express");
const Player = require("../models/player.js"); // p minuscola
const { requireAuth, requireLevel } = require("../middleware/auth");

const router = express.Router();

const TYPE_OPTIONS = ["Carri", "Aerei", "Missili", "Misto"];
const ROLE_OPTIONS = ["R1", "R2", "R3", "R4", "R5"];

const SORT_FIELDS = ["nickname", "role", "powerT1", "typeT1", "powerT2", "typeT2", "powerT3", "typeT3", "powerT4", "typeT4", "total", "updatedAt"];

function parseOptionalNumber(v) {
  if (v === null || v === undefined) return null;

  let s = String(v).trim();
  if (!s) return null;

  // supporta virgola italiana
  s = s.replace(",", ".");

  const n = Number(s);
  if (Number.isNaN(n)) return null;

  // arrotonda a 2 decimali
  return Math.round(n * 100) / 100;
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

function normalizeSortParams(req) {
  const sort = SORT_FIELDS.includes(String(req.query.sort || "")) ? String(req.query.sort) : "powerT1";
  const dirRaw = String(req.query.dir || "desc").toLowerCase();
  const dir = dirRaw === "asc" ? "asc" : "desc";
  return { sort, dir };
}

function dirToMongo(dir) {
  return dir === "asc" ? 1 : -1;
}

function escapeRegex(v) {
  return String(v || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function existsNicknameInsensitive(nickname, excludeId = null) {
  const query = {
    nickname: { $regex: `^${escapeRegex(nickname)}$`, $options: "i" }
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const existing = await Player.findOne(query).select("_id").lean();
  return Boolean(existing);
}

// LIST + SORT
router.get("/", requireAuth, async (req, res) => {
  try {
    const { sort, dir } = normalizeSortParams(req);

    // compute total in DB
    const totalExpr = {
      $add: [
        { $ifNull: ["$powerT1", 0] },
        { $ifNull: ["$powerT2", 0] },
        { $ifNull: ["$powerT3", 0] },
        { $ifNull: ["$powerT4", 0] }
      ]
    };

    const sortStage = {};
    sortStage[sort] = dirToMongo(dir);

    // stable secondary sorts
    // if sorting by nickname already, secondary sort by updatedAt desc; otherwise nickname asc
    const secondary = sort === "nickname" ? { updatedAt: -1 } : { nickname: 1 };

    const q = String(req.query.q || "").trim();
    const search = q ? { nickname: { $regex: escapeRegex(q), $options: "i" } } : {};

    const players = await Player.aggregate([
      { $match: search },
      { $addFields: { total: totalExpr } },
      { $sort: { ...sortStage, ...secondary } }
    ]);

    return res.render("potenze/index", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      players,
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: null,
      message: null,
      sort,
      dir,
      q
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
      message: null,
      sort: "powerT1",
      dir: "desc",
      q: ""
    });
  }
});

// NEW (FORM)
router.get("/new", requireAuth, async (req, res) => {
  return res.render("potenze/new", {
    user: req.user,
    isAdmin: isAdmin(req.user),
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
router.post("/new", requireAuth, async (req, res) => {
  try {
    const nickCheck = validateNickname(req.body.nickname);
    if (!nickCheck.ok) {
      return res.render("potenze/new", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: nickCheck.msg,
        message: null,
        form: { ...req.body }
      });
    }

    const nicknameAlreadyExists = await existsNicknameInsensitive(nickCheck.value);
    if (nicknameAlreadyExists) {
      return res.render("potenze/new", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: "Nickname già presente (controllo non case-sensitive).",
        message: null,
        form: { ...req.body }
      });
    }

    await Player.create({
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
    });

    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    return res.render("potenze/new", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: "Errore interno durante la creazione del giocatore.",
      message: null,
      form: { ...req.body }
    });
  }
});

// EDIT (FORM)
router.get("/:id/edit", requireAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).send("404 - Giocatore non trovato");

    return res.render("potenze/edit", {
      user: req.user,
      isAdmin: isAdmin(req.user),
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
router.post("/:id/edit", requireAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).send("404 - Giocatore non trovato");

    const nickCheck = validateNickname(req.body.nickname);
    if (!nickCheck.ok) {
      const fake = { ...player.toObject(), ...req.body };
      return res.render("potenze/edit", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: nickCheck.msg,
        message: null,
        player: fake
      });
    }

    const nicknameAlreadyExists = await existsNicknameInsensitive(nickCheck.value, player._id);
    if (nicknameAlreadyExists) {
      const fake = { ...player.toObject(), ...req.body };
      return res.render("potenze/edit", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: "Nickname già presente (controllo non case-sensitive).",
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

    await player.save();

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
