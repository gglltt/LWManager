require("dotenv").config();
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const Player = require("../models/player");
const PlayerPowerHistory = require("../models/playerPowerHistory");
const PerformanceVsEvent = require("../models/performanceVsEvent");
const PerformanceVsRow = require("../models/performanceVsRow");
const { EventLog } = require("../models/eventLog");
const Account = require("../models/account");
const { DEFAULT_ALLIANCE_CODE, DEFAULT_SERVER_NUMBER, tenantFields, GLOBAL_ALLIANCE_KEY } = require("../utils/tenant");
async function upsertPin(query, doc, pin){ const found=await Account.findOne(query); if(found) return false; await Account.create({...doc,pinHash:await bcrypt.hash(String(pin),12)}); return true; }
async function main(){ await connectDB(); const tf=tenantFields(process.env.DEFAULT_ALLIANCE_CODE||DEFAULT_ALLIANCE_CODE, process.env.DEFAULT_SERVER_NUMBER||DEFAULT_SERVER_NUMBER); const missing={$or:[{allianceKey:{$exists:false}},{allianceKey:null},{allianceKey:""}]}; const models=[Player,PlayerPowerHistory,PerformanceVsEvent,PerformanceVsRow,EventLog]; for(const M of models){ const set=M===EventLog?{...tf}:{...tf}; const r=await M.updateMany(missing,{$set:set}); console.log(`${M.modelName}: matched=${r.matchedCount} modified=${r.modifiedCount}`); }
 const created=[]; if(await upsertPin({allianceKey:tf.allianceKey,role:"alliance_admin"},{...tf,role:"alliance_admin",isActive:true},process.env.DEFAULT_ALLIANCE_ADMIN_PIN||"111111")) created.push("alliance_admin"); if(await upsertPin({allianceKey:tf.allianceKey,role:"supervisor"},{...tf,role:"supervisor",isActive:true},process.env.DEFAULT_ALLIANCE_SUPERVISOR_PIN||"151515")) created.push("supervisor"); if(await upsertPin({username:process.env.MASTER_LOGIN||"master",role:"master"},{username:process.env.MASTER_LOGIN||"master",role:"master",allianceKey:GLOBAL_ALLIANCE_KEY,isActive:true},process.env.MASTER_PIN||"550130")) created.push("master"); console.log(`accounts_created=${created.join(",")||"none"}`); await require("mongoose").disconnect(); }
main().catch(e=>{ console.error(e); process.exit(1); });
