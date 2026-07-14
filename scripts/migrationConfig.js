"use strict";

module.exports = {
  defaults: {
    allianceId: 1,
    allianceCode: "BISS",
    serverNumber: 833,
    pins: {
      standard: "111111",
      supervisor: "151515",
      admin: "999999",
      master: "550130"
    }
  },
  collectionsWithAllianceId: [
    "users",
    "players",
    "playerpowerhistories",
    "events",
    "eventlogs",
    "performancevsevents",
    "performancevsrows",
    "counters"
  ]
};
