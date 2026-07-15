require('dotenv').config();
const mongoose = require('mongoose');
const { getMigrationConfig } = require('./migrationLib/config');
const appCollections = require('./migrationLib/appCollections');
const { collectionExists } = require('./migrationLib/db');
async function hasIndex(col, key) { return (await col.indexes()).some((idx) => JSON.stringify(idx.key) === JSON.stringify(key)); }
async function runCheck() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI mancante');
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const config = getMigrationConfig();
  const errors = [];
  try {
    if (!(await collectionExists(db, 'alliances'))) errors.push('missing collection alliances');
    const alliance = await db.collection('alliances').findOne({ allianceId: config.allianceId });
    if (!alliance) errors.push(`missing allianceId ${config.allianceId}`);
    else if (alliance.codeNormalized !== config.codeNormalized || Number(alliance.serverNumber) !== config.serverNumber) errors.push(`allianceId ${config.allianceId} is not ${config.codeNormalized}#${config.serverNumber}`);
    for (const name of appCollections.filter((n) => !['accounts','users'].includes(n))) {
      if (await collectionExists(db, name)) {
        const missingFilter = name === 'eventlogs' ? { allianceId: { $exists: false } } : { $or: [{ allianceId: { $exists: false } }, { allianceId: null }] };
        const count = await db.collection(name).countDocuments(missingFilter);
        if (count) errors.push(`${count} ${name} without allianceId`);
      }
    }
    const accounts = db.collection('accounts');
    for (const username of [config.masterUsername, config.standardUsername, config.supervisorUsername]) if (!(await accounts.findOne({ username }))) errors.push(`missing account ${username}`);
    const nullAccounts = await accounts.countDocuments({ $or: [{ username: null }, { username: { $exists: false } }, { username: '' }] });
    if (nullAccounts) errors.push(`${nullAccounts} accounts without username`);
    const plainSecretFields = await accounts.countDocuments({ $or: [{ pin: { $exists: true } }, { password: { $exists: true } }, { plainPin: { $exists: true } }] });
    if (plainSecretFields) errors.push(`${plainSecretFields} accounts contain plain secret fields`);
    const adminAccounts = await accounts.countDocuments({ role: { $in: ['admin', 'alliance_admin'] } });
    if (adminAccounts) errors.push(`${adminAccounts} admin accounts found; only master, supervisor and standard are allowed`);
    if (!(await hasIndex(db.collection('alliances'), { allianceId: 1 }))) errors.push('missing alliances allianceId index');
    if (!(await hasIndex(db.collection('alliances'), { serverNumber: 1, codeNormalized: 1 }))) errors.push('missing alliances serverNumber/codeNormalized index');
    if (!(await hasIndex(accounts, { username: 1 }))) errors.push('missing accounts username index');
    const ids = new Set((await db.collection('alliances').find({}, { projection: { allianceId: 1 } }).toArray()).map((a) => a.allianceId));
    for (const name of appCollections) if (await collectionExists(db, name)) {
      const bad = await db.collection(name).countDocuments({ allianceId: { $nin: [...ids, null] } });
      if (bad) errors.push(`${bad} ${name} records reference missing allianceId`);
    }
    if (errors.length) { console.error('Migration check failed:'); errors.forEach((e) => console.error(`- ${e}`)); process.exitCode = 1; }
    else console.log('Migration check passed.');
  } finally { await mongoose.disconnect().catch(() => {}); }
}
if (require.main === module) runCheck().catch((err) => { console.error(err.message); process.exit(1); });
module.exports = { runCheck };
