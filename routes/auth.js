const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { sendEmail, baseUrl } = require("../utils/email");

const router = express.Router();

function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("Missing JWT_SECRET in environment variables.");
    process.exit(1);
  }
  return secret;
}

function isValidEmail(email) {
  // Simple, robust-enough email check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").toLowerCase());
}

function signAuthCookie(res, userId) {
  const token = jwt.sign({ sub: userId }, jwtSecret(), { expiresIn: "7d" });
  res.cookie("lw_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

// Views
router.get("/login", (req, res) => {
  return res.render("login", { error: null, message: null });
});

router.get("/register", (req, res) => {
  return res.render("register", { error: null, message: null });
});

router.get("/forgot", (req, res) => {
  return res.render("forgot", { error: null, message: null });
});

router.get("/reset/:token", (req, res) => {
  return res.render("reset", { error: null, message: null, token: req.params.token });
});

// Register
router.post("/register", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const nickname = String(req.body.nickname || "").trim();
    const password = String(req.body.password || "");

    if (!isValidEmail(email)) {
      return res.render("register", { error: "Email non valida.", message: null });
    }
    if (nickname.length < 2) {
      return res.render("register", { error: "Nickname troppo corto (min 2 caratteri).", message: null });
    }
    if (password.length < 8) {
      return res.render("register", { error: "Password troppo corta (min 8 caratteri).", message: null });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.render("register", { error: "Esiste già un account con questa email.", message: null });
    }

    // Determine first-user admin rule
    const userCount = await User.countDocuments({});
    const authLevel = userCount === 0 ? 5 : 1;

    const passwordHash = await bcrypt.hash(password, 12);

    // create verification token
    const verifyToken = randomToken();
    const verifyTokenHash = hashToken(verifyToken);
    const verifyExpires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

    const user = await User.create({
      email,
      nickname,
      passwordHash,
      authLevel,
      isVerified: false,
      emailVerifyTokenHash: verifyTokenHash,
      emailVerifyTokenExpiresAt: verifyExpires
    });

    const verifyLink = `${baseUrl()}/auth/verify-email/${verifyToken}`;
    await sendEmail({
      to: user.email,
      subject: "LWManager - Conferma la tua email",
      html: `
        <p>Ciao <b>${user.nickname}</b>,</p>
        <p>Per completare la registrazione su <b>LWManager</b>, conferma la tua email cliccando qui:</p>
        <p><a href="${verifyLink}">${verifyLink}</a></p>
        <p>Il link scade tra 24 ore.</p>
      `
    });

    return res.render("register", {
      error: null,
      message: "Registrazione effettuata! Controlla la tua email per confermare l'account."
    });
  } catch (err) {
    console.error(err);
    return res.render("register", { error: "Errore interno. Riprova.", message: null });
  }
});

// Verify email
router.get("/verify-email/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const tokenHash = hashToken(token);

    const user = await User.findOne({
      emailVerifyTokenHash: tokenHash,
      emailVerifyTokenExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.render("verify-result", {
        success: false,
        message: "Link non valido o scaduto. Richiedi una nuova registrazione o contatta l'assistenza."
      });
    }

    user.isVerified = true;
    user.emailVerifyTokenHash = null;
    user.emailVerifyTokenExpiresAt = null;
    await user.save();

    return res.render("verify-result", {
      success: true,
      message: "Email verificata con successo! Ora puoi effettuare il login."
    });
  } catch (err) {
    console.error(err);
    return res.render("verify-result", {
      success: false,
      message: "Errore interno durante la verifica. Riprova."
    });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!isValidEmail(email) || !password) {
      return res.render("login", { error: "Credenziali non valide.", message: null });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.render("login", { error: "Email o password errate.", message: null });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.render("login", { error: "Email o password errate.", message: null });
    }

    if (!user.isVerified) {
      return res.render("login", {
        error: "Account non verificato. Controlla la tua email e conferma la registrazione.",
        message: null
      });
    }

    signAuthCookie(res, user._id.toString());
    return res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    return res.render("login", { error: "Errore interno. Riprova.", message: null });
  }
});

// Forgot password (send reset email)
router.post("/forgot", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    // Always show same message for privacy
    const genericMsg = "Se l'email esiste nel sistema, riceverai un link per reimpostare la password.";

    if (!isValidEmail(email)) {
      return res.render("forgot", { error: null, message: genericMsg });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      return res.render("forgot", { error: null, message: genericMsg });
    }

    const resetToken = randomToken();
    const resetTokenHash = hashToken(resetToken);
    const resetExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 min

    user.passwordResetTokenHash = resetTokenHash;
    user.passwordResetTokenExpiresAt = resetExpires;
    await user.save();

    const resetLink = `${baseUrl()}/auth/reset/${resetToken}`;
    await sendEmail({
      to: user.email,
      subject: "LWManager - Reset password",
      html: `
        <p>Ciao <b>${user.nickname}</b>,</p>
        <p>Hai richiesto il reset della password. Clicca qui per impostarne una nuova:</p>
        <p><a href="${resetLink}">${resetLink}</a></p>
        <p>Il link scade tra 30 minuti. Se non sei stato tu, ignora questa email.</p>
      `
    });

    return res.render("forgot", { error: null, message: genericMsg });
  } catch (err) {
    console.error(err);
    return res.render("forgot", { error: "Errore interno. Riprova.", message: null });
  }
});

// Reset password
router.post("/reset/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "");
    const password = String(req.body.password || "");
    const confirm = String(req.body.confirm || "");

    if (password.length < 8) {
      return res.render("reset", { error: "Password troppo corta (min 8 caratteri).", message: null, token });
    }
    if (password !== confirm) {
      return res.render("reset", { error: "Le password non coincidono.", message: null, token });
    }

    const tokenHash = hashToken(token);

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetTokenExpiresAt: { $gt: new Date() }
    });

    if (!user) {
      return res.render("reset", { error: "Link non valido o scaduto.", message: null, token });
    }

    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = null;
    user.passwordResetTokenExpiresAt = null;
    await user.save();

    return res.render("login", {
      error: null,
      message: "Password aggiornata! Ora puoi effettuare il login."
    });
  } catch (err) {
    console.error(err);
    return res.render("reset", { error: "Errore interno. Riprova.", message: null, token: req.params.token });
  }
});

module.exports = router;