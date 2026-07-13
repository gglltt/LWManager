const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Account = require("../models/account");
const Alliance = require("../models/alliance");
const { createEventLog } = require("../utils/eventLog");
const { parseAllianceInput, isValidAllianceCode, isValidServerNumber } = require("../utils/tenant");
const router = express.Router();
const attempts = new Map();
function jwtSecret(){ const s=process.env.JWT_SECRET; if(!s) throw new Error("Missing JWT_SECRET"); return s; }
function pin(v){ return String(v||"").trim(); }
function isPin(v){ return /^\d{6}$/.test(v); }
function key(ip, tenant){ return `${ip}|${tenant||"global"}`; }
function isBlocked(ip, tenant){ const a=attempts.get(key(ip, tenant)); return a && a.count>=8 && Date.now()-a.ts<15*60*1000; }
function addFail(ip, tenant){ const k=key(ip, tenant); const a=attempts.get(k)||{count:0,ts:Date.now()}; attempts.set(k,{count:a.count+1,ts:Date.now()}); }
function clearFail(ip, tenant){ attempts.delete(key(ip, tenant)); }
function sign(res, account, alliance){ const payload={accountId:String(account._id),userId:String(account._id),role:account.role,allianceId:account.allianceId??null,allianceCode:alliance?.code||null,serverNumber:alliance?.serverNumber||null,isMaster:account.role==="master"}; const token=jwt.sign(payload,jwtSecret(),{expiresIn:"7d"}); res.cookie("lw_token",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000}); }
router.get("/login", async (req,res)=>{ await createEventLog(req,"login_page_view","Accesso pagina login"); res.render("login",{error:null,message:null,form:{}}); });
router.post("/login", async (req,res)=>{ const p=pin(req.body.pin); const codeRaw=String(req.body.allianceCode||"").trim(); const isMaster=codeRaw.toLowerCase()==="master"; const ip=req.ip||"unknown"; const generic="Credenziali non valide."; let tenantKey="master"; let alliance=null;
  if(!isPin(p)){ await createEventLog(req,"login_failed",""); return res.status(401).render("login",{error:generic,message:null,form:req.body}); }
  if(isMaster){ if(isBlocked(ip, tenantKey)) return res.status(429).render("login",{error:"Troppi tentativi. Riprova più tardi.",message:null,form:req.body}); const account=await Account.findOne({username:"master",role:"master",isActive:true}).lean(); const ok=account && await bcrypt.compare(p, account.pinHash); if(!ok){ addFail(ip, tenantKey); await createEventLog(req,"login_failed",""); return res.status(401).render("login",{error:generic,message:null,form:req.body}); } clearFail(ip, tenantKey); sign(res, account, null); req.user={accountId:String(account._id),role:"master",isMaster:true,allianceId:null}; await createEventLog(req,"login_success","role=master"); return res.redirect("/dashboard"); }
  const tenant=parseAllianceInput(codeRaw, req.body.serverNumber); tenantKey=tenant.allianceKey;
  if(!isValidAllianceCode(tenant.allianceCode)||!isValidServerNumber(tenant.serverNumber)){ await createEventLog(req,"login_failed",""); return res.status(401).render("login",{error:generic,message:null,form:req.body}); }
  if(isBlocked(ip, tenantKey)){ await createEventLog(req,"login_rate_limited",""); return res.status(429).render("login",{error:"Troppi tentativi. Riprova più tardi.",message:null,form:req.body}); }
  alliance=await Alliance.findOne({codeNormalized:tenant.allianceCode,serverNumber:tenant.serverNumber,isActive:true}).lean();
  if(!alliance){ addFail(ip, tenantKey); await createEventLog(req,"login_failed",""); return res.status(401).render("login",{error:generic,message:null,form:req.body}); }
  const accounts=await Account.find({allianceId:alliance.allianceId,isActive:true,role:{$in:["alliance_admin","editor","supervisor","standard"]}}).lean();
  let matched=null; for(const a of accounts){ if(await bcrypt.compare(p,a.pinHash)){ matched=a; break; } }
  if(!matched){ addFail(ip, tenantKey); req.user={allianceId:alliance.allianceId}; await createEventLog(req,"login_failed",""); return res.status(401).render("login",{error:generic,message:null,form:req.body}); }
  clearFail(ip, tenantKey); sign(res, matched, alliance); req.user={accountId:String(matched._id),role:matched.role,allianceId:alliance.allianceId,allianceCode:alliance.code,serverNumber:alliance.serverNumber,isMaster:false}; await createEventLog(req,"login_success",`role=${matched.role}`); res.redirect("/dashboard"); });
module.exports = router;
