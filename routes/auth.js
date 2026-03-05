const express = require("express");
const jwt = require("jsonwebtoken");
const { createEventLog } = require("../utils/eventLog");

const router = express.Router();

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("Missing JWT_SECRET in environment variables.");
    process.exit(1);
  }
  return secret;
}

function normalizePin(pinRaw) {
  return String(pinRaw || "").trim();
}

function isSixDigitPin(pin) {
  return /^\d{6}$/.test(pin);
}

function getPins() {
  return {
    standard: String(process.env.APP_PIN_STANDARD || "111111"),
    admin: String(process.env.APP_PIN_ADMIN || "999999")
  };
}

function signAuthCookie(res, role) {
  const token = jwt.sign({ role }, jwtSecret(), { expiresIn: "7d" });
  res.cookie("lw_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

router.get("/login", async (req, res) => {
  await createEventLog(req, "login_page_view", "Accesso pagina login");
  return res.render("login", { error: null, message: null });
});

router.post("/login", async (req, res) => {
  const pin = normalizePin(req.body.pin);

  if (!isSixDigitPin(pin)) {
    await createEventLog(req, "login_failed", "Tentativo login: formato PIN non valido");
    return res.render("login", { error: "Inserisci un PIN valido di 6 cifre.", message: null });
  }

  const pins = getPins();
  let role = null;

  if (pin === pins.admin) {
    role = "admin";
  } else if (pin === pins.standard) {
    role = "standard";
  }

  if (!role) {
    await createEventLog(req, "login_failed", "Tentativo login: PIN errato");
    return res.render("login", { error: "PIN non valido.", message: null });
  }

  await createEventLog(req, "login_success", `Login effettuato con ruolo=${role}`);
  signAuthCookie(res, role);
  return res.redirect("/dashboard");
});

module.exports = router;
