const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ejs = require("ejs");

const viewPath = path.join(__dirname, "..", "views", "potenze", "index.ejs");

function renderFor(user, { canExport, tenantFilter = {}, alliances = [] } = {}) {
  return ejs.renderFile(viewPath, {
    user,
    isAdmin: Boolean(user.isMaster),
    canExport,
    canEdit: true,
    tenantFilter,
    alliances,
    players: [],
    playerCount: 0,
    types: [],
    roles: [],
    error: null,
    message: null,
    sort: "powerT1",
    dir: "desc",
    q: "",
    historyRetentionDays: 365,
    query: {},
    currentLang: "it",
    currentUrl: "/potenze",
    currentFlag: "IT",
    availableLanguages: [],
    localeTag: "it-IT",
    isRTL: false,
    buildVersion: "test",
    translateTeamType: (value) => value,
    t: (key) => key
  });
}

test("power export UI follows standard, supervisor and master permissions", async () => {
  const standard = await renderFor({ role: "standard", authLevel: 1, allianceId: 1, isMaster: false }, { canExport: false });
  assert.doesNotMatch(standard, /href="\/potenze\/export/);
  assert.doesNotMatch(standard, /export_admin_only/);

  const supervisor = await renderFor({ role: "supervisor", authLevel: 3, allianceId: 1, isMaster: false }, { canExport: true });
  assert.match(supervisor, /href="\/potenze\/export"/);
  assert.doesNotMatch(supervisor, /export_admin_only/);

  const master = await renderFor(
    { role: "master", authLevel: 99, allianceId: null, isMaster: true },
    { canExport: true, tenantFilter: { allianceId: 2 }, alliances: [{ allianceId: 2, displayName: "Other", serverNumber: 999 }] }
  );
  assert.match(master, /href="\/potenze\/export\?allianceId=2"/);
});
