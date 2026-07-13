const express = require("express");
const bcrypt = require("bcryptjs");
const Account = require("../models/account");
const { requireAuth } = require("../middleware/auth");
const { createEventLog } = require("../utils/eventLog");

const router = express.Router();
const MANAGED_ROLES = ["supervisor", "standard"];

function requirePasswordManager(req, res, next) {
  if (!req.user) return res.redirect("/auth/login");
  if (req.user.isMaster || req.user.role === "supervisor") return next();
  return res.status(403).send("403 - Forbidden");
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
  query.allianceKey = user.allianceKey;
  return query;
}

function canManageAccount(user, account) {
  if (!account || account.isActive === false) return false;
  if (user.isMaster) return true;
  if (!MANAGED_ROLES.includes(account.role)) return false;
  return account.allianceKey && account.allianceKey === user.allianceKey;
}

async function renderIndex(req, res, statusCode = 200, message = "", error = "") {
  const accounts = await Account.find(accountScope(req.user))
    .select("username allianceCode serverNumber allianceKey role updatedAt")
    .sort({ allianceKey: 1, role: -1 })
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
    return renderIndex(req, res, 400, "", "Il nuovo PIN deve essere di 6 cifre e deve combaciare in entrambi i campi.");
  }

  if (!req.user.isMaster && !isValidPin(oldPin)) {
    return renderIndex(req, res, 400, "", "Inserisci il vecchio PIN di 6 cifre.");
  }

  const account = await Account.findById(req.params.id);
  if (!canManageAccount(req.user, account)) {
    await createEventLog(req, "password_change_denied", `target=${req.params.id}`);
    return renderIndex(req, res, 403, "", "Non puoi modificare questo utente.");
  }

  if (!req.user.isMaster) {
    const matchesOldPin = await bcrypt.compare(oldPin, account.pinHash);
    if (!matchesOldPin) {
      await createEventLog(req, "password_change_failed", `target=${account.username}|reason=old_pin`);
      return renderIndex(req, res, 400, "", "Il vecchio PIN non è corretto.");
    }
  }

  account.pinHash = await bcrypt.hash(newPin, 10);
  await account.save();

  const eventType = req.user.isMaster ? "password_reset" : "password_change";
  await createEventLog(req, eventType, `target=${account.username}|targetRole=${account.role}|targetAllianceKey=${account.allianceKey}`);
  return renderIndex(req, res, 200, req.user.isMaster ? "PIN resettato correttamente." : "PIN modificato correttamente.", "");
});

module.exports = router;
