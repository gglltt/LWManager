const test = require("node:test");
const assert = require("node:assert/strict");
const { canExportPowers, buildPowerExportFilter } = require("../utils/powerExportScope");

test("standard users cannot export powers", () => {
  const user = { role: "standard", authLevel: 1, allianceId: 1, isMaster: false };
  assert.equal(canExportPowers(user), false);
  assert.equal(buildPowerExportFilter(user, 2), null);
});

test("supervisors are always scoped to the alliance stored in their session", () => {
  const user = { role: "supervisor", authLevel: 3, allianceId: 1, isMaster: false };
  assert.equal(canExportPowers(user), true);
  assert.deepEqual(buildPowerExportFilter(user), { allianceId: 1 });
  assert.deepEqual(buildPowerExportFilter(user, 2), { allianceId: 1 });
});

test("master can export all alliances or one selected alliance", () => {
  const user = { role: "master", authLevel: 99, allianceId: null, isMaster: true };
  assert.deepEqual(buildPowerExportFilter(user), {});
  assert.deepEqual(buildPowerExportFilter(user, 2), { allianceId: 2 });
});
