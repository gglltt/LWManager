"use strict";

const { normalizeSchemaMigrations, ensureUniqueNameIndex } = require("../migrationLib/schemaMigrations");

module.exports = {
  name: "001_create_schema_migrations",
  description: "Create and normalize schema_migrations with canonical unique name tracking.",
  async up({ db, dryRun }) {
    const normalization = await normalizeSchemaMigrations(db, { dryRun });
    const index = await ensureUniqueNameIndex(db, { dryRun });
    return { created: normalization.created, inspected: normalization.inspected, normalized: normalization.normalized, indexes: [index] };
  }
};
