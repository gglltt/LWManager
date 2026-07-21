const test = require("node:test");
const assert = require("node:assert/strict");
const { getLetterScore, getLengthBonus, calculateWordScore } = require("../services/wordGameScoring");
const { timeBonusForWord } = require("../services/wordGameDictionary");

test("Scarabeo Italian letter values are applied", () => {
  assert.deepEqual(["A", "L", "P", "B", "Z", "Q"].map(getLetterScore), [1, 2, 3, 4, 8, 10]);
});

test("word length bonuses follow the scoring table", () => {
  assert.deepEqual([4, 5, 6, 7, 8, 9, 12].map(getLengthBonus), [0, 5, 10, 30, 50, 100, 100]);
});

test("a five-letter word gets five seconds and five score bonus points separately", () => {
  assert.equal(timeBonusForWord("CITTA"), 5);
  assert.equal(getLengthBonus(5), 5);
});

test("calculateWordScore returns a reusable score breakdown", () => {
  assert.deepEqual(calculateWordScore(" casa ", { comboMultiplier: 2 }), {
    word: "CASA", baseScore: 4, lengthBonus: 0, comboMultiplier: 2, totalScore: 8
  });
  assert.equal(calculateWordScore("LETTERA").lengthBonus, 30);
  assert.equal(calculateWordScore("CITTA").lengthBonus, 5);
});
