const jwt = require("jsonwebtoken");

const ROLE_LEVEL = {
  standard: 1,
  supervisor: 3,
  admin: 5
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    console.error("Missing JWT_SECRET in environment variables.");
    process.exit(1);
  }
  return secret;
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.lw_token;
    if (!token) return res.redirect("/auth/login");

    const decoded = jwt.verify(token, getJwtSecret());
    const role = ["admin", "supervisor"].includes(decoded?.role) ? decoded.role : "standard";

    req.user = {
      role,
      authLevel: ROLE_LEVEL[role]
    };

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

const requireSupervisor = requireLevel(ROLE_LEVEL.supervisor);
const requireAdmin = requireLevel(ROLE_LEVEL.admin);

module.exports = { ROLE_LEVEL, requireAuth, requireLevel, requireSupervisor, requireAdmin };
