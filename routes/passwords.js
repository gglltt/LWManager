const express = require("express");
const bcrypt = require("bcryptjs");
const Account = require("../models/account");
const { requireAuth } = require("../middleware/auth");
const { createEventLog } = require("../utils/eventLog");

const router = express.Router();
const MANAGED_ROLES = ["supervisor", "standard", "alliance_admin"];

function requirePasswordManager(req, res, next) {
  if (!req.user) return res.redirect("/auth/login");
  if (req.user.isMaster || req.user.role === "supervisor") return next();
  return res.status(403).send(`403 - ${(res.locals.t || ((k) => k))("forbidden")}`);
}

function cleanPin(value) {
  return String(value || "").trim();
}

function isValidPin(value) {
  return /^\d{6}$/.test(value);
}

function accountScope(user) {
  const query = { isActive: true };
  if (user.isMaster) return query;
  query.role = { $in: MANAGED_ROLES };
  query.allianceId = user.allianceId;
  return query;
}

function canManageAccount(user, account) {
  if (!account || account.isActive === false) return false;
  if (user.isMaster) return true;
  if (!MANAGED_ROLES.includes(account.role)) return false;
  return account.allianceId && Number(account.allianceId) === Number(user.allianceId);
}

async function renderIndex(req, res, statusCode = 200, message = "", error = "") {
  const accounts = await Account.find(accountScope(req.user))
    .select("username allianceId role updatedAt")
    .sort({ allianceId: 1, role: -1 })
    .lean();

  return res.status(statusCode).render("passwords/index", {
    user: req.user,
    accounts,
    message,
    error
  });
}

router.get("/", requireAuth, requirePasswordManager, async (req, res) => {
  return renderIndex(req, res, 200, req.query.message || "", req.query.error || "");
});

router.post("/:id", requireAuth, requirePasswordManager, async (req, res) => {
  const oldPin = cleanPin(req.body.oldPin);
  const newPin = cleanPin(req.body.newPin);
  const confirmPin = cleanPin(req.body.confirmPin);

  if (!isValidPin(newPin) || newPin !== confirmPin) {
    return renderIndex(req, res, 400, "", (res.locals.t || ((k) => k))("err_new_pin_mismatch"));
  }

  if (!req.user.isMaster && !isValidPin(oldPin)) {
    return renderIndex(req, res, 400, "", (res.locals.t || ((k) => k))("err_old_pin_required"));
  }

  const account = await Account.findById(req.params.id);
  if (!canManageAccount(req.user, account)) {
    await createEventLog(req, "password_change_denied", `target=${req.params.id}`);
    return renderIndex(req, res, 403, "", (res.locals.t || ((k) => k))("err_cannot_edit_user"));
  }

  if (!req.user.isMaster) {
    const matchesOldPin = await bcrypt.compare(oldPin, account.pinHash);
    if (!matchesOldPin) {
      await createEventLog(req, "password_change_failed", `target=${account.username}|reason=old_pin`);
      return renderIndex(req, res, 400, "", (res.locals.t || ((k) => k))("err_old_pin_wrong"));
    }
  }

  account.pinHash = await bcrypt.hash(newPin, 10);
  await account.save();

  const eventType = req.user.isMaster ? "password_reset" : "password_change";
  await createEventLog(req, eventType, `target=${account.username}|targetRole=${account.role}|targetAllianceId=${account.allianceId}`);
  return renderIndex(req, res, 200, req.user.isMaster ? (res.locals.t || ((k) => k))("pin_reset_success") : (res.locals.t || ((k) => k))("pin_changed_success"), "");
});

module.exports = router;
