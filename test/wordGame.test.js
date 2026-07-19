const test = require("node:test");
const assert = require("node:assert/strict");
const dictionary = require("../services/wordGameDictionary");
const { isItalianLanguage } = require("../routes/wordGame");

test("Word Game accepts only language values beginning with it", () => {
  for (const value of ["it", "it-IT", "it_IT", "IT-it", "italiano"]) assert.equal(isItalianLanguage(value), true);
  for (const value of ["en", "fr", "uk", "de", "es", ""]) assert.equal(isItalianLanguage(value), false);
});

test("Italian words use one conservative normalization", () => {
  assert.equal(dictionary.normalizeItalianWord(" città "), "CITTA");
  assert.equal(dictionary.normalizeItalianWord("perché"), "PERCHE");
  assert.equal(dictionary.normalizeItalianWord("l'amore"), "");
  assert.equal(dictionary.normalizeItalianWord("porta-a-porta"), "");
  assert.equal(dictionary.timeBonusForWord("città"), 5);
  assert.equal(dictionary.timeBonusForWord("casa"), 4);
});

test("TXT dictionary is cached and creates playable letter sets", () => {
  const first = dictionary.loadItalianDictionary();
  const second = dictionary.loadItalianDictionary();
  assert.equal(first, second);
  assert.ok(first.files > 0);
  assert.ok(first.words.size > 1000);

  for (const level of [1, 11, 26]) {
    const letters = dictionary.generateLetters(level);
    assert.match(letters, /^[A-Z]{10}$/);
    assert.ok([...letters].filter((letter) => "AEIOU".includes(letter)).length >= 2);
    const possible = first.playableWords.filter((word) => dictionary.canBuildWord(word, letters));
    assert.ok(possible.length >= dictionary.targetForLevel(level));
    assert.equal(dictionary.validateItalianWord(possible[0], letters).valid, true);
    assert.equal(dictionary.validateItalianWord("ZZZQQQ", letters).valid, false);
  }
});
