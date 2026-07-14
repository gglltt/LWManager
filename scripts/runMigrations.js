require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getMigrationConfig } = require('./migrationLib/config');

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    check: argv.includes('--check'),
    resetDefaultPins: argv.includes('--reset-default-pins'),
    confirmProduction: argv.includes('--confirm-production') || process.env.MIGRATION_CONFIRM_PRODUCTION === 'true'
  };
}
function safeDbLabel(uri) { try { const u = new URL(uri); return `${u.protocol}//${u.host}${u.pathname}`; } catch { return '<configured database>'; } }
function loadMigrations() {
  const dir = path.join(__dirname, 'migrations');
  return fs.readdirSync(dir).filter((f) => /^\d+_.+\.js$/.test(f)).sort().map((f) => require(path.join(dir, f)));
}
async function runMigrations(options) {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI mancante');
  if (process.env.NODE_ENV === 'production' && !options.dryRun && !options.confirmProduction) {
    throw new Error('NODE_ENV=production richiede --confirm-production o MIGRATION_CONFIRM_PRODUCTION=true');
  }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const config = getMigrationConfig();
  console.log(`Migration database: ${safeDbLabel(process.env.MONGO_URI)}`);
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'real'}${options.resetDefaultPins ? ' + reset-default-pins' : ''}`);
  const migrations = loadMigrations();
  const control = db.collection('schema_migrations');
  const executed = options.dryRun ? new Set((await control.find({ status: 'success' }).toArray()).map((m) => m.name)) : new Set((await control.find({ status: 'success' }).toArray()).map((m) => m.name));
  const results = [];
  for (const migration of migrations) {
    if (executed.has(migration.name)) { console.log(`SKIP ${migration.name}`); continue; }
    console.log(`RUN  ${migration.name}`);
    const started = Date.now();
    try {
      const summary = await migration.up({ db, dryRun: options.dryRun, config, options });
      const durationMs = Date.now() - started;
      results.push({ name: migration.name, status: options.dryRun ? 'dry-run' : 'success', durationMs, summary });
      if (!options.dryRun) await control.updateOne({ name: migration.name }, { $set: { name: migration.name, executedAt: new Date(), status: 'success', summary, durationMs }, $unset: { error: '' } }, { upsert: true });
      console.log(`OK   ${migration.name} (${durationMs}ms)`);
      console.log(JSON.stringify(summary, null, 2));
    } catch (err) {
      const durationMs = Date.now() - started;
      if (!options.dryRun) await control.updateOne({ name: migration.name }, { $set: { name: migration.name, executedAt: new Date(), status: 'failed', error: err.message, durationMs } }, { upsert: true });
      console.error(`FAIL ${migration.name}: ${err.message}`);
      throw err;
    }
  }
  console.log('Migration summary:');
  for (const r of results) console.log(`- ${r.name}: ${r.status} (${r.durationMs}ms)`);
}
async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.check) return require('./migrationCheck').runCheck(options);
  try { await runMigrations(options); } finally { await mongoose.disconnect().catch(() => {}); }
}
if (require.main === module) main().catch((err) => { console.error(err.message); process.exit(1); });
module.exports = { runMigrations, parseArgs };
