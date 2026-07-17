const { fixAllianceKeyLegacyIndex } = require('./007_fix_alliance_key_legacy_index');

module.exports = {
  name: '008_ensure_alliance_canonical_keys',
  description: 'Re-run idempotent alliances canonical key cleanup for databases that already recorded migration 007.',
  up: fixAllianceKeyLegacyIndex
};
