const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Engine = require("../public/js/memory-game-engine");
const { validateScore, leaderboardFilter } = require("../routes/memoryGame");
const { SUPPORTED_LANGS, getTranslator } = require("../config/i18n");

function countSymbols(deck) {
  return deck.reduce((counts, card) => {
    counts[card.symbolId] = (counts[card.symbolId] || 0) + 1;
    return counts;
  }, {});
}

function findPair(deck, different = false) {
  for (let first = 0; first < deck.length; first += 1) {
    for (let second = first + 1; second < deck.length; second += 1) {
      if ((deck[first].symbolId === deck[second].symbolId) !== different) return [first, second];
    }
  }
  throw new Error("Required cards not found");
}

function solveLevel(state) {
  let current = state;
  const indexesBySymbol = current.deck.reduce((groups, card, index) => {
    (groups[card.symbolId] ||= []).push(index);
    return groups;
  }, {});
  Object.values(indexesBySymbol).forEach(([first, second]) => {
    current = Engine.selectCard(current, first).state;
    current = Engine.selectCard(current, second).state;
  });
  return current;
}

test("level configuration creates the requested pairs and a 6x6 final grid", () => {
  const levelOne = Engine.createDeck(1, () => 0.25);
  const levelTen = Engine.createDeck(10, () => 0.75);
  assert.equal(levelOne.length, 6);
  assert.equal(levelTen.length, 36);
  assert.equal(Object.keys(countSymbols(levelTen)).length, 18);
  assert.deepEqual([...new Set(Object.values(countSymbols(levelTen)))], [2]);
  assert.deepEqual(Engine.levelConfig(10), { level: 10, rows: 6, columns: 6, pairs: 18, timeLimit: 100, previewMs: 1500 });
  Engine.LEVELS.forEach(({ level, pairs }) => {
    const counts = countSymbols(Engine.createDeck(level, () => 0.37));
    assert.equal(Object.keys(counts).length, pairs);
    assert.ok(Object.values(counts).every((count) => count === 2));
  });
});

test("Fisher-Yates keeps every card and pair without duplicates", () => {
  const ordered = Engine.SYMBOL_IDS.slice(0, 8).flatMap((symbolId) => [`${symbolId}-a`, `${symbolId}-b`]);
  const shuffled = Engine.shuffleCards(ordered, () => 0.31);
  assert.notDeepEqual(shuffled, ordered);
  assert.deepEqual([...shuffled].sort(), [...ordered].sort());
  assert.equal(new Set(shuffled).size, ordered.length);
});

test("adjacency validation detects horizontal, vertical and optional diagonal pairs", () => {
  const deck = (symbols) => symbols.map((symbolId, index) => ({ id: `${symbolId}-${index}`, symbolId }));
  const horizontal = deck(["a", "a", "b", "c", "b", "c"]);
  const vertical = deck(["a", "b", "c", "a", "c", "b"]);
  const orthogonallyValid = deck(["a", "b", "c", "b", "c", "a"]);

  assert.equal(Engine.hasAdjacentPairs(horizontal, 2, 3), true);
  assert.equal(Engine.hasAdjacentPairs(vertical, 2, 3), true);
  assert.equal(Engine.hasAdjacentPairs(orthogonallyValid, 2, 3), false);
  assert.equal(Engine.hasAdjacentPairs(orthogonallyValid, 2, 3, true), true);
});

test("every configured level avoids orthogonally adjacent pairs", () => {
  Engine.LEVELS.forEach(({ level, rows, columns, pairs }) => {
    const deck = Engine.createDeck(level);
    assert.equal(deck.length, rows * columns);
    assert.equal(Object.keys(countSymbols(deck)).length, pairs);
    assert.ok(Object.values(countSymbols(deck)).every((count) => count === 2));
    assert.equal(Engine.hasAdjacentPairs(deck, rows, columns), false, `level ${level}`);
    if (level > 1) assert.equal(Engine.hasAdjacentPairs(deck, rows, columns, true), false, `level ${level} diagonal`);
  });
});

test("level 10 remains valid across twenty independent generations", () => {
  const config = Engine.levelConfig(10);
  for (let generation = 0; generation < 20; generation += 1) {
    const deck = Engine.createDeck(10);
    assert.equal(deck.length, 36);
    assert.equal(Object.keys(countSymbols(deck)).length, 18);
    assert.ok(Object.values(countSymbols(deck)).every((count) => count === 2));
    assert.equal(Engine.hasAdjacentPairs(deck, config.rows, config.columns), false);
    assert.equal(Engine.hasAdjacentPairs(deck, config.rows, config.columns, true), false);
  }
});

test("the repair fallback preserves cards and removes mandatory adjacency", () => {
  const config = Engine.levelConfig(10);
  const deck = Engine.createDeck(10, () => 0.5);
  assert.equal(deck.length, 36);
  assert.equal(new Set(deck.map((card) => card.id)).size, 36);
  assert.ok(Object.values(countSymbols(deck)).every((count) => count === 2));
  assert.equal(Engine.hasAdjacentPairs(deck, config.rows, config.columns), false);
});

test("a matching pair remains matched and cannot be selected again", () => {
  let state = Engine.startLevel(Engine.createGameState(1, {}, () => 0.42));
  const [first, second] = findPair(state.deck);
  state = Engine.selectCard(state, first).state;
  assert.equal(Engine.selectCard(state, first).accepted, false);
  const result = Engine.selectCard(state, second);
  assert.equal(result.match, true);
  assert.deepEqual(result.state.matchedIndexes.sort((a, b) => a - b), [first, second].sort((a, b) => a - b));
  assert.equal(result.state.score, Engine.pairPoints(1));
  assert.equal(Engine.selectCard(result.state, first).accepted, false);
});

test("a mismatch applies the penalty and can be covered again", () => {
  let state = Engine.startLevel(Engine.createGameState(1, { score: 5 }, () => 0.58));
  const [first, second] = findPair(state.deck, true);
  state = Engine.selectCard(state, first).state;
  const result = Engine.selectCard(state, second);
  assert.equal(result.match, false);
  assert.equal(result.state.errors, 1);
  assert.equal(result.state.score, 0);
  assert.equal(result.state.selectedIndexes.length, 2);
  assert.deepEqual(Engine.clearSelection(result.state).selectedIndexes, []);
});

test("level completion adds the time bonus and advances progress", () => {
  const solved = solveLevel(Engine.startLevel(Engine.createGameState(1, {}, () => 0.63)));
  assert.equal(solved.matchedIndexes.length, 6);
  const completed = Engine.completeLevel(solved, 12.9);
  assert.equal(completed.status, "levelComplete");
  assert.equal(completed.score, (3 * Engine.pairPoints(1)) + 24);
  const next = Engine.nextLevel(completed, () => 0.2);
  assert.equal(next.level, 2);
  assert.equal(next.totalPairsFound, 3);
  assert.equal(next.status, "preview");
});

test("solving level 10 wins while an expired timer ends the game", () => {
  const solvedFinal = solveLevel(Engine.startLevel(Engine.createGameState(10, {}, () => 0.47)));
  assert.equal(Engine.completeLevel(solvedFinal, 4).status, "won");
  const active = Engine.startLevel(Engine.createGameState(4, {}, () => 0.19));
  const expired = Engine.expireLevel(active);
  assert.equal(expired.status, "gameOver");
  assert.equal(expired.lastResult, "timeout");
});

test("score validation enforces the ten-level progress model", () => {
  assert.equal(validateScore({ playerName: "Player_1", score: 0, levelsCompleted: 0, levelReached: 1, pairsFound: 0, errors: 0, totalTimeMs: 1000 }).error, undefined);
  assert.equal(validateScore({ playerName: "Player_1", score: 500, levelsCompleted: 3, levelReached: 3, pairsFound: 17, errors: 1, totalTimeMs: 5000 }).error, "invalidScore");
  assert.equal(validateScore({ playerName: "Winner", score: 15000, levelsCompleted: 10, levelReached: 10, pairsFound: 111, errors: 5, totalTimeMs: 180000 }).error, undefined);
  assert.equal(validateScore({ playerName: "Winner", score: 15000, levelsCompleted: 10, levelReached: 10, pairsFound: 110, errors: 5, totalTimeMs: 180000 }).error, "invalidScore");
  assert.deepEqual(leaderboardFilter({ allianceId: 12, isMaster: false }), { allianceId: 12 });
  assert.deepEqual(leaderboardFilter({ allianceId: 12, isMaster: true }), {});
  assert.deepEqual(leaderboardFilter({ isMaster: false }), { _id: { $exists: false } });
});

test("every Memory key is available in all supported languages", () => {
  const keys = [
    "title", "eyebrow", "subtitle", "howToPlay", "start", "restart", "level", "score", "time", "errors", "pairs",
    "memorize", "cardsHidden", "matchFound", "noMatch", "levelComplete", "nextLevel", "gameOver", "victory", "saveScore",
    "leaderboard", "backToMinigames", "instructionsTitle", "instructionPreview", "instructionPairs", "instructionScore",
    "instructionPenalty", "instructionTimer", "instructionLevels", "instructionFinal", "instructionRanking", "close", "playerName",
    "invalidName", "saveError", "resultSaved", "noScores", "loading", "totalTime", "levelReached", "points", "hiddenCard",
    "matchedCard", "revealCard", "timeBonus", "ready", "gameStats", "boardLabel", "finalSummary", "date",
    ...Engine.SYMBOL_IDS.map((symbolId) => `symbols.${symbolId}`)
  ];

  for (const lang of SUPPORTED_LANGS) {
    const translate = getTranslator(lang);
    assert.notEqual(translate("minigames.memoryTitle"), "minigames.memoryTitle", `${lang}: missing card title`);
    assert.notEqual(translate("minigames.memoryDesc"), "minigames.memoryDesc", `${lang}: missing card description`);
    keys.forEach((key) => assert.notEqual(translate(`memoryGame.${key}`), `memoryGame.${key}`, `${lang}: missing ${key}`));
  }
});

test("Memory reuses the Math Game button controls without a separate button design", () => {
  const root = path.join(__dirname, "..");
  const memoryView = fs.readFileSync(path.join(root, "views", "memory-game.ejs"), "utf8");
  const mathView = fs.readFileSync(path.join(root, "views", "math-game.ejs"), "utf8");
  const memoryCss = fs.readFileSync(path.join(root, "public", "css", "memory-game.css"), "utf8");
  const memoryRoute = fs.readFileSync(path.join(root, "routes", "memoryGame.js"), "utf8");

  assert.match(mathView, /class="button mathAudioToggle"/);
  assert.match(mathView, /class="button mathAction mathLeaderboardBtn"/);
  assert.match(mathView, /class="button mathAction mathStart"/);
  assert.match(memoryView, /class="button mathAudioToggle"[^>]+id="memoryHelpButton"/);
  assert.match(memoryView, /class="button mathAction mathLeaderboardBtn"[^>]+id="memoryLeaderboardButton"/);
  assert.match(memoryView, /class="button mathAction mathStart"[^>]+id="memoryStartButton"/);
  assert.match(memoryView, /class="button secondary memoryBackAction"/);
  assert.match(memoryRoute, /"\/css\/math-game\.css"/);
  assert.doesNotMatch(memoryView, /memoryButton|memoryModal__close/);
  assert.doesNotMatch(memoryCss, /\.memoryButton|\.memoryModal__close/);
});
