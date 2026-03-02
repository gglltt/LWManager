const jwt = require("jsonwebtoken");
const User = require("../models/user");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("Missing JWT_SECRET in environment variables.");
    process.exit(1);
  }
  return secret;
}

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.lw_token;
    if (!token) return res.redirect("/auth/login");

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.sub).select("-passwordHash");
    if (!user) return res.redirect("/auth/login");

    req.user = user;
    return next();
  } catch (err) {
    res.clearCookie("lw_token");
    return res.redirect("/auth/login");
  }
}

function requireLevel(minLevel) {
  return (req, res, next) => {
    if (!req.user) return res.redirect("/auth/login");
    if (req.user.authLevel < minLevel) return res.status(403).send("403 - Forbidden");
    return next();
  };
}

module.exports = { requireAuth, requireLevel };