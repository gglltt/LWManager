const { ensureCollection, ensureIndex } = require('../migrationLib/db');
module.exports = {
  name: '001_create_schema_migrations',
  async up({ db, dryRun }) {
    const created = await ensureCollection(db, 'schema_migrations', { dryRun });
    const index = await ensureIndex(db, 'schema_migrations', { name: 1 }, { unique: true }, { dryRun });
    return { created, indexes: [index] };
  }
};
