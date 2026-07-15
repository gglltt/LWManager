const bcrypt = require('bcryptjs');
const { ensureCollection } = require('../migrationLib/db');
function isMissingUsernameFilter() { return { $or: [{ username: null }, { username: { $exists: false } }, { username: '' }] }; }
async function repairLegacyAccounts(accounts, config, dryRun) {
  const legacy = await accounts.find(isMissingUsernameFilter()).toArray();
  const actions = [];
  for (const acc of legacy) {
    let username = null;
    if (acc.role === 'master' || acc.allianceId === null) username = config.masterUsername;
    else if (['alliance_admin', 'admin', 'standard'].includes(acc.role) && Number(acc.allianceId) === config.allianceId) username = config.standardUsername;
    else if (acc.role === 'supervisor' && Number(acc.allianceId) === config.allianceId) username = config.supervisorUsername;
    else username = `legacy-account-${acc._id}`;
    actions.push({ id: String(acc._id), username });
    if (!dryRun) await accounts.updateOne({ _id: acc._id }, { $set: { username } });
  }
  return actions;
}
async function upsertAccount(accounts, spec, pin, dryRun, resetPins) {
  const existing = await accounts.findOne({ username: spec.username });
  const needsHash = resetPins || !existing || !(existing.pinHash || existing.passwordHash);
  const update = { $setOnInsert: { username: spec.username, createdAt: new Date() }, $set: { role: spec.role, allianceId: spec.allianceId, isActive: true, updatedAt: new Date() } };
  if (needsHash) update.$set.pinHash = await bcrypt.hash(pin, 10);
  if (dryRun) return { username: spec.username, action: existing ? 'would update' : 'would create', wouldSetPinHash: needsHash };
  await accounts.updateOne({ username: spec.username }, update, { upsert: true });
  return { username: spec.username, action: existing ? 'updated' : 'created', pinHashChanged: needsHash };
}
module.exports = {
  name: '004_create_default_accounts',
  async up({ db, dryRun, config, options }) {
    await ensureCollection(db, 'accounts', { dryRun });
    const accounts = db.collection('accounts');
    const repaired = await repairLegacyAccounts(accounts, config, dryRun);
    const specs = [
      [{ username: config.masterUsername, role: 'master', allianceId: null }, config.masterPin],
      [{ username: config.standardUsername, role: 'standard', allianceId: config.allianceId }, config.standardPin],
      [{ username: config.supervisorUsername, role: 'supervisor', allianceId: config.allianceId }, config.supervisorPin]
    ];
    const results = [];
    for (const [spec, pin] of specs) results.push(await upsertAccount(accounts, spec, pin, dryRun, options.resetDefaultPins));
    return { repairedLegacyAccounts: repaired, accounts: results };
  }
};
