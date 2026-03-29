const express = require("express");
const XLSX = require("xlsx");
const Player = require("../models/player.js"); // p minuscola
const { requireAuth, requireLevel } = require("../middleware/auth");
const { TEAM_TYPE_OPTIONS } = require("../config/i18n");
const { buildPlayerDetails, createEventLog } = require("../utils/eventLog");
const PlayerPowerHistory = require("../models/playerPowerHistory");
const { savePlayerPowerSnapshot } = require("../utils/playerPowerHistory");

const router = express.Router();

const TYPE_OPTIONS = TEAM_TYPE_OPTIONS;
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

function validateNickname(nickname, t) {
  const n = String(nickname ?? "").trim();
  if (n.length < 2) return { ok: false, msg: t("err_nickname_short") };
  if (n.length > 40) return { ok: false, msg: t("err_nickname_long") };
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

async function addAutoTranslatedNotes(players, targetLang) {
  if (!Array.isArray(players) || players.length === 0) return players;

  const cache = new Map();
  const translatedPlayers = await Promise.all(
    players.map(async (player) => {
      const noteText = String(player?.notes ?? "").trim();
      if (!noteText) return player;

      if (!cache.has(noteText)) {
        cache.set(noteText, translateTextAuto(noteText, targetLang));
      }

      try {
        const translated = await cache.get(noteText);
        if (!translated?.ok || translated.sameLanguage || !translated.translatedText) return player;
        return {
          ...player,
          autoTranslatedNote: translated.translatedText,
          autoTranslatedSourceLang: translated.sourceLang || null
        };
      } catch (err) {
        return player;
      }
    })
  );

  return translatedPlayers;
}

async function translateTextAuto(text, targetLang) {
  const cleanText = String(text ?? "").trim();
  const cleanTarget = String(targetLang ?? "").trim().toLowerCase();
  if (!cleanText || !["it", "en", "fr", "es", "de", "ar", "pl", "sv", "da"].includes(cleanTarget)) {
    return { ok: false, errorCode: "invalid_input" };
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) return null;
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function isProviderErrorText(value) {
    const textValue = String(value ?? "").trim().toLowerCase();
    if (!textValue) return true;
    return (
      textValue.includes("invalid source language") ||
      textValue.includes("invalid target language") ||
      textValue.includes("langpair=") ||
      textValue.includes("example:")
    );
  }

  const providers = [
    {
      name: "google_public",
      run: async () => {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(cleanTarget)}&dt=t&q=${encodeURIComponent(cleanText)}`;
        const data = await fetchJsonWithTimeout(url, { method: "GET" });
        if (!Array.isArray(data) || !Array.isArray(data[0])) return null;

        const translatedText = data[0].map((part) => String(part?.[0] ?? "")).join("").trim();
        const sourceLang = String(data?.[2] ?? "").trim().toLowerCase();
        if (!translatedText) return null;
        return { translatedText, sourceLang: sourceLang || null };
      }
    },
    {
      name: "mymemory",
      run: async () => {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=auto|${encodeURIComponent(cleanTarget)}`;
        const data = await fetchJsonWithTimeout(url, { method: "GET" });
        if (Number(data?.responseStatus) !== 200) return null;
        const translatedText = String(data?.responseData?.translatedText ?? "").trim();
        if (isProviderErrorText(translatedText)) return null;
        const sourceLang = String(data?.responseData?.match ?? "").trim(); // MyMemory does not expose source lang reliably
        if (!translatedText) return null;
        return { translatedText, sourceLang: sourceLang && sourceLang.length === 2 ? sourceLang.toLowerCase() : null };
      }
    },
    {
      name: "libretranslate",
      run: async () => {
        const data = await fetchJsonWithTimeout("https://translate.argosopentech.com/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: cleanText,
            source: "auto",
            target: cleanTarget,
            format: "text"
          })
        });
        const translatedText = String(data?.translatedText ?? "").trim();
        const sourceLang = String(data?.detectedLanguage?.language ?? "").trim().toLowerCase();
        if (!translatedText) return null;
        return { translatedText, sourceLang: sourceLang || null };
      }
    }
  ];

  for (const provider of providers) {
    try {
      const translated = await provider.run();
      if (!translated?.translatedText) continue;
      if (isProviderErrorText(translated.translatedText)) continue;
      const detectedLanguage = String(translated.sourceLang || "").toLowerCase();
      if (detectedLanguage && detectedLanguage === cleanTarget) {
        return { ok: true, translatedText: cleanText, sourceLang: detectedLanguage, sameLanguage: true };
      }
      return { ok: true, translatedText: translated.translatedText, sourceLang: detectedLanguage || null, sameLanguage: false };
    } catch (err) {
      // try next provider
    }
  }

  return { ok: false, errorCode: "provider_unavailable" };
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
    const t = res.locals.t;
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

    let players = await Player.aggregate([
      { $match: search },
      { $addFields: { total: totalExpr } },
      { $sort: { ...sortStage, ...secondary } }
    ]);
    players = await addAutoTranslatedNotes(players, res.locals.currentLang || "it");

    const playerCount = await Player.countDocuments();

    return res.render("potenze/index", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      players,
      playerCount,
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
    const t = res.locals.t || ((k) => k);
    return res.render("potenze/index", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      players: [],
      playerCount: 0,
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: t("err_internal_loading_list"),
      message: null,
      sort: "powerT1",
      dir: "desc",
      q: ""
    });
  }
});

// NEW (FORM)
router.get("/new", requireAuth, async (req, res) => {
  const playerCount = await Player.countDocuments();
  return res.render("potenze/new", {
    user: req.user,
    isAdmin: isAdmin(req.user),
    playerCount,
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
    const t = res.locals.t;
    const playerCount = await Player.countDocuments();
    const nickCheck = validateNickname(req.body.nickname, t);
    if (!nickCheck.ok) {
      return res.render("potenze/new", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        playerCount,
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
        playerCount,
        types: TYPE_OPTIONS,
        roles: ROLE_OPTIONS,
        error: t("err_nickname_exists"),
        message: null,
        form: { ...req.body }
      });
    }

    const createdPlayer = await Player.create({
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

    await savePlayerPowerSnapshot(createdPlayer);
    await createEventLog(req, "nuovo_player", buildPlayerDetails(createdPlayer));
    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    const playerCount = await Player.countDocuments();
    return res.render("potenze/new", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      playerCount,
      types: TYPE_OPTIONS,
      roles: ROLE_OPTIONS,
      error: (res.locals.t || ((k) => k))("err_internal_create_player"),
      message: null,
      form: { ...req.body }
    });
  }
});

router.get("/export", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const players = await Player.find().sort({ nickname: 1 }).lean();

    const rows = players.map((p) => ({
      Nickname: p.nickname || "",
      Role: p.role || "",
      "Power T1": p.powerT1 ?? "",
      "Type T1": p.typeT1 || "",
      "Power T2": p.powerT2 ?? "",
      "Type T2": p.typeT2 || "",
      "Power T3": p.powerT3 ?? "",
      "Type T3": p.typeT3 || "",
      "Power T4": p.powerT4 ?? "",
      "Type T4": p.typeT4 || "",
      Total: (p.powerT1 || 0) + (p.powerT2 || 0) + (p.powerT3 || 0) + (p.powerT4 || 0),
      Note: p.notes || "",
      "Created At": p.createdAt ? new Date(p.createdAt).toLocaleString(res.locals.localeTag || "it-IT") : "",
      "Updated At": p.updatedAt ? new Date(p.updatedAt).toLocaleString(res.locals.localeTag || "it-IT") : ""
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Players");

    const fileBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="players-export-${timestamp}.xlsx"`);
    return res.send(fileBuffer);
  } catch (err) {
    console.error(err);
    return res.status(500).send(`500 - ${(res.locals.t || ((k) => k))("err_excel_export")}`);
  }
});

router.post("/translate-note", requireAuth, async (req, res) => {
  try {
    const t = res.locals.t || ((k) => k);
    const text = sanitizeText(req.body?.text, 2000);
    const targetLang = String(req.body?.targetLang || res.locals.currentLang || "it").toLowerCase();

    if (!text) {
      return res.status(400).json({ ok: false, error: t("translation_error") });
    }

    const translated = await translateTextAuto(text, targetLang);
    if (!translated.ok) {
      return res.status(503).json({ ok: false, error: t("translation_error") });
    }

    if (translated.sameLanguage) {
      return res.json({
        ok: true,
        translatedText: text,
        sourceLang: translated.sourceLang || null,
        sameLanguage: true,
        message: t("translation_same_language")
      });
    }

    return res.json({
      ok: true,
      translatedText: translated.translatedText,
      sourceLang: translated.sourceLang || null,
      sameLanguage: false
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: (res.locals.t || ((k) => k))("translation_error") });
  }
});

// EDIT (FORM)
router.get("/:id/edit", requireAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).send(`404 - ${(res.locals.t || ((k) => k))("err_player_not_found")}`);

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
    return res.status(500).send(`500 - ${(res.locals.t || ((k) => k))("err_internal")}`);
  }
});

// EDIT (UPDATE)
router.post("/:id/edit", requireAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).send(`404 - ${(res.locals.t || ((k) => k))("err_player_not_found")}`);

    const nickCheck = validateNickname(req.body.nickname, res.locals.t || ((k) => k));
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
        error: (res.locals.t || ((k) => k))("err_nickname_exists"),
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
    await savePlayerPowerSnapshot(player);
    await createEventLog(req, "modifica_player", buildPlayerDetails(player));

    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    return res.status(500).send(`500 - ${(res.locals.t || ((k) => k))("err_internal")}`);
  }
});


router.get("/:id/history-data", requireAuth, async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).select("nickname").lean();
    if (!player) {
      return res.status(404).json({ ok: false, error: (res.locals.t || ((k) => k))("err_player_not_found") });
    }

    const daysRaw = Number(req.query.days || 30);
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(Math.floor(daysRaw), 1), 365) : 30;

    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 0, 0, 0, 0));
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

    const records = await PlayerPowerHistory.find({
      player: player.nickname,
      snapshotDate: { $gte: from, $lte: to }
    })
      .sort({ snapshotDate: 1 })
      .lean();

    const history = records
      .filter((record) => record && record.snapshotDay)
      .map((record) => {
        const t1 = Math.round(Number(record.t1 || 0) * 100) / 100;
        const t2 = Math.round(Number(record.t2 || 0) * 100) / 100;
        const t3 = Math.round(Number(record.t3 || 0) * 100) / 100;
        const t4 = Math.round(Number(record.t4 || 0) * 100) / 100;
        const total = Math.round((t1 + t2 + t3 + t4) * 100) / 100;
        return {
          id: record.seqId ?? "-",
          player: player.nickname,
          date: record.snapshotDay,
          t1,
          t2,
          t3,
          t4,
          total
        };
      });

    return res.json({ ok: true, player: player.nickname, days, history });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: (res.locals.t || ((k) => k))("err_internal") });
  }
});

// DELETE
router.post("/:id/delete", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const player = await Player.findById(req.params.id).lean();
    await Player.deleteOne({ _id: req.params.id });
    if (player) {
      await createEventLog(req, "cancellazione_player", buildPlayerDetails(player));
    }
    return res.redirect("/potenze");
  } catch (err) {
    console.error(err);
    return res.status(500).send(`500 - ${(res.locals.t || ((k) => k))("err_internal")}`);
  }
});

module.exports = router;
