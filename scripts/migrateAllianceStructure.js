// Backward-compatible wrapper: use the versioned, safe migration runner.
const mongoose = require('mongoose');
const { runMigrations, parseArgs } = require('./runMigrations');

runMigrations(parseArgs(process.argv.slice(2)))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect().catch(() => {}));
