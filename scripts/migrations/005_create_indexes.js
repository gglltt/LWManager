const { collectionExists, ensureIndex } = require('../migrationLib/db');
module.exports = {
  name: '005_create_indexes',
  async up({ db, dryRun }) {
    const plan = [
      ['alliances', { allianceId: 1 }, { unique: true }], ['alliances', { serverNumber: 1, codeNormalized: 1 }, { unique: true }],
      ['accounts', { username: 1 }, { unique: true, sparse: true }], ['accounts', { allianceId: 1, role: 1 }, {}], ['accounts', { isActive: 1 }, {}],
      ['players', { allianceId: 1, nickname: 1 }, {}], ['players', { allianceId: 1, updatedAt: -1 }, {}],
      ['playerpowerhistories', { allianceId: 1, player: 1, createdAt: -1 }, {}], ['playerpowerhistories', { allianceId: 1, createdAt: -1 }, {}],
      ['performanceevents', { allianceId: 1, createdAt: -1 }, {}], ['performancevsevents', { allianceId: 1, createdAt: -1 }, {}],
      ['performancesrows', { allianceId: 1, eventId: 1 }, {}], ['performancesrows', { allianceId: 1, playerId: 1 }, {}],
      ['performancevsrows', { allianceId: 1, eventId: 1 }, {}], ['performancevsrows', { allianceId: 1, playerId: 1 }, {}],
      ['eventlogs', { allianceId: 1, createdAt: -1 }, {}], ['eventlogs', { eventType: 1, createdAt: -1 }, {}]
    ];
    const indexes = [];
    for (const [name, keys, options] of plan) if (await collectionExists(db, name)) indexes.push(await ensureIndex(db, name, keys, options, { dryRun }));
    return { indexes };
  }
};
