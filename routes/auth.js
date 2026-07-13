const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Account = require("../models/account");
const { createEventLog } = require("../utils/eventLog");
const { parseAllianceInput, isValidAllianceCode, isValidServerNumber, GLOBAL_ALLIANCE_KEY } = require("../utils/tenant");

const router = express.Router();
const WINDOW_MS = 15*60*1000, MAX_FAILED = 5;
const attempts = new Map();
function jwtSecret(){ const s=process.env.JWT_SECRET; if(!s){ console.error("Missing JWT_SECRET in environment variables."); process.exit(1);} return s; }
function pin(v){ return String(v||"").trim(); }
function isPin(v){ return /^\d{6}$/.test(v); }
function key(ip, ak){ return `${ip}|${ak||"UNKNOWN"}`; }
function isBlocked(ip, ak){ const now=Date.now(); return [key(ip,"*"), key("*",ak), key(ip,ak)].some(k=>{ const a=attempts.get(k); return a && a.blockedUntil>now; }); }
function addFail(ip, ak){ const now=Date.now(); for(const k of [key(ip,"*"),key("*",ak),key(ip,ak)]){ const a=attempts.get(k)||{count:0, first:now, blockedUntil:0}; if(now-a.first>WINDOW_MS){ a.count=0; a.first=now; } a.count++; if(a.count>=MAX_FAILED) a.blockedUntil=now+WINDOW_MS; attempts.set(k,a); } }
function clearFail(ip, ak){ [key(ip,"*"),key("*",ak),key(ip,ak)].forEach(k=>attempts.delete(k)); }
function sign(res, account){ const payload={accountId:String(account._id),userId:String(account._id),role:account.role,allianceCode:account.allianceCode,serverNumber:account.serverNumber,allianceKey:account.allianceKey,isMaster:account.role==="master"}; const token=jwt.sign(payload,jwtSecret(),{expiresIn:"7d"}); res.cookie("lw_token",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000}); }
router.get("/login", async (req,res)=>{ await createEventLog(req,"login_page_view","Accesso pagina login"); res.render("login",{error:null,message:null,form:{}}); });
router.post("/login", async (req,res)=>{ const p=pin(req.body.pin); const codeRaw=String(req.body.allianceCode||"").trim(); const isMaster=codeRaw.toLowerCase()==="master"; const tenant=isMaster ? {allianceKey:GLOBAL_ALLIANCE_KEY} : parseAllianceInput(codeRaw, req.body.serverNumber); const ip=req.ip||"unknown"; const generic="Credenziali non valide.";
  if(!isPin(p) || (!isMaster && (!isValidAllianceCode(tenant.allianceCode)||!isValidServerNumber(tenant.serverNumber)))){ await createEventLog(req,"login_failed",`allianceKey=${tenant.allianceKey||"invalid"}`); return res.status(401).render("login",{error:generic,message:null,form:req.body}); }
  if(isBlocked(ip, tenant.allianceKey)){ await createEventLog(req,"login_rate_limited",`allianceKey=${tenant.allianceKey}`); return res.status(429).render("login",{error:"Troppi tentativi. Riprova più tardi.",message:null,form:req.body}); }
  const query=isMaster ? {username:"master",role:"master",isActive:true} : {allianceKey:tenant.allianceKey,isActive:true}; const accounts=await Account.find(query).lean();
  let matched=null; for(const acc of accounts){ if(await bcrypt.compare(p, acc.pinHash)){ matched=acc; break; } }
  if(!matched){ addFail(ip, tenant.allianceKey); await createEventLog(req,"login_failed",`allianceKey=${tenant.allianceKey}`); return res.status(401).render("login",{error:generic,message:null,form:req.body}); }
  clearFail(ip, tenant.allianceKey); sign(res, matched); req.user={accountId:String(matched._id),role:matched.role,allianceCode:matched.allianceCode,serverNumber:matched.serverNumber,allianceKey:matched.allianceKey,isMaster:matched.role==="master"}; await createEventLog(req,"login_success",`role=${matched.role}`); res.redirect("/dashboard"); });
module.exports=router;
