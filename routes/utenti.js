const express = require("express");
const User = require("../models/user.js"); // attenzione: minuscolo
const { requireAuth, requireLevel } = require("../middleware/auth");

const router = express.Router();

function isAdmin(user) {
  return user && user.authLevel >= 5;
}

function validateNickname(nickname, t) {
  const n = String(nickname ?? "").trim();
  if (n.length < 2) return { ok: false, msg: t("err_nickname_short") };
  if (n.length > 40) return { ok: false, msg: t("err_nickname_long") };
  return { ok: true, value: n };
}

function validateAuthLevel(level, t) {
  const s = String(level ?? "").trim();
  if (!s) return { ok: false, msg: t("err_invalid_level") };
  const n = Number(s);
  if (!Number.isInteger(n)) return { ok: false, msg: t("err_level_integer") };
  if (n < 1 || n > 5) return { ok: false, msg: t("err_level_range") };
  return { ok: true, value: n };
}

// LIST
router.get("/", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const message = req.query.msg ? String(req.query.msg) : null;
    const error = req.query.err ? String(req.query.err) : null;

    const users = await User.find({})
      .select("_id email nickname authLevel verified createdAt updatedAt")
      .sort({ authLevel: -1, email: 1 });

    return res.render("utenti/index", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      users,
      message,
      error
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(`500 - ${(res.locals.t || ((k) => k))("err_internal")}`);
  }
});

// EDIT (FORM)
router.get("/:id/edit", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select("_id email nickname authLevel verified");
    if (!target) return res.status(404).send(`404 - ${(res.locals.t || ((k) => k))("err_user_not_found")}`);

    return res.render("utenti/edit", {
      user: req.user,
      isAdmin: isAdmin(req.user),
      target,
      error: null,
      message: null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).send(`500 - ${(res.locals.t || ((k) => k))("err_internal")}`);
  }
});

// EDIT (UPDATE)
router.post("/:id/edit", requireAuth, requireLevel(5), async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).send(`404 - ${(res.locals.t || ((k) => k))("err_user_not_found")}`);

    // Email NON modificabile: ignoriamo qualsiasi valore arrivato
    const t = res.locals.t || ((k) => k);
    const nickCheck = validateNickname(req.body.nickname, t);
    if (!nickCheck.ok) {
      const fake = {
        _id: target._id,
        email: target.email,
        nickname: String(req.body.nickname ?? ""),
        authLevel: target.authLevel,
        verified: target.verified
      };
      return res.render("utenti/edit", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        target: fake,
        error: nickCheck.msg,
        message: null
      });
    }

    const lvlCheck = validateAuthLevel(req.body.authLevel, t);
    if (!lvlCheck.ok) {
      const fake = {
        _id: target._id,
        email: target.email,
        nickname: nickCheck.value,
        authLevel: String(req.body.authLevel ?? ""),
        verified: target.verified
      };
      return res.render("utenti/edit", {
        user: req.user,
        isAdmin: isAdmin(req.user),
        target: fake,
        error: lvlCheck.msg,
        message: null
      });
    }

    target.nickname = nickCheck.value;
    target.authLevel = lvlCheck.value;

    await target.save();

    return res.redirect("/utenti?msg=" + encodeURIComponent(t("msg_user_updated")));
  } catch (err) {
    console.error(err);
    return res.redirect("/utenti?err=" + encodeURIComponent((res.locals.t || ((k) => k))("err_internal_update")));
  }
});

// DELETE
router.post("/:id/delete", requireAuth, requireLevel(5), async (req, res) => {
  try {
    // non si può cancellare se stessi
    const selfId = String(req.user?._id || req.user?.id || "");
    if (String(req.params.id) === selfId) {
      return res.redirect("/utenti?err=" + encodeURIComponent((res.locals.t || ((k) => k))("err_cannot_delete_self")));
    }

    const target = await User.findById(req.params.id).select("_id email");
    if (!target) {
      return res.redirect("/utenti?err=" + encodeURIComponent((res.locals.t || ((k) => k))("err_user_not_found")));
    }

    await User.deleteOne({ _id: req.params.id });

    return res.redirect("/utenti?msg=" + encodeURIComponent(`${(res.locals.t || ((k) => k))("msg_user_deleted")}: ${target.email}`));
  } catch (err) {
    console.error(err);
    return res.redirect("/utenti?err=" + encodeURIComponent((res.locals.t || ((k) => k))("err_internal_delete")));
  }
});

module.exports = router;
