const jwt = require("jsonwebtoken");
const { createEventLog } = require("../utils/eventLog");

const ROLE_LEVEL = { standard: 1, supervisor: 3, alliance_admin: 5, editor: 5, master: 99 };
function getJwtSecret(){ const s=process.env.JWT_SECRET; if(!s){ console.error("Missing JWT_SECRET in environment variables."); process.exit(1);} return s; }
function toUser(decoded){ const role=decoded?.role||"supervisor"; return { userId: decoded.userId||decoded.accountId||null, accountId: decoded.accountId||decoded.userId||null, role, authLevel: ROLE_LEVEL[role]||1, allianceCode: decoded.allianceCode||null, serverNumber: decoded.serverNumber||null, allianceKey: decoded.allianceKey||null, isMaster: role==="master" || decoded.isMaster===true }; }
function requireAuth(req,res,next){ try{ const token=req.cookies?.lw_token; if(!token) return res.redirect("/auth/login"); req.user=toUser(jwt.verify(token,getJwtSecret())); return next(); }catch(e){ res.clearCookie("lw_token"); return res.redirect("/auth/login"); } }
function requireLevel(minLevel){ return async (req,res,next)=>{ if(!req.user) return res.redirect("/auth/login"); if(req.user.authLevel < minLevel){ await createEventLog(req,"admin_access_denied",`requiredLevel=${minLevel}|role=${req.user.role}`); return res.status(403).send("403 - Forbidden"); } return next(); }; }
function requireMaster(req,res,next){ if(!req.user) return res.redirect("/auth/login"); if(!req.user.isMaster) return res.status(403).send("403 - Forbidden"); return next(); }
const requireSupervisor=requireLevel(ROLE_LEVEL.supervisor); const requireAdmin=requireLevel(ROLE_LEVEL.alliance_admin);
module.exports={ ROLE_LEVEL, requireAuth, requireLevel, requireSupervisor, requireAdmin, requireMaster };
