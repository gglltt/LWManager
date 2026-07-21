const test = require("node:test");
const assert = require("node:assert/strict");
const dictionary = require("../services/wordGameDictionary");
const { isItalianLanguage, refillUsedLetters } = require("../routes/wordGame");

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
    assert.ok(dictionary.countVowels(letters) >= 3);
    const possible = first.playableWords.filter((word) => dictionary.canBuildWord(word, letters));
    assert.ok(possible.length >= dictionary.targetForLevel(level));
    assert.equal(dictionary.validateItalianWord(possible[0], letters).valid, true);
    assert.equal(dictionary.validateItalianWord("ZZZQQQ", letters).valid, false);
  }
});

test("refill replaces only the used slots and preserves every other position", () => {
  const before = "ACEFILOPRT";
  const used = [1, 2, 6, 8];
  const result = refillUsedLetters(before, used, 2);
  assert.equal(result.letters.length, 10);
  assert.ok(dictionary.countVowels(result.letters) >= 3);
  assert.deepEqual(result.replacements.map((item) => item.slot), used);
  for (let slot = 0; slot < before.length; slot += 1) {
    if (!used.includes(slot)) assert.equal(result.letters[slot], before[slot]);
  }
});

test("refill preserves the three vowels when only consonants are used", () => {
  const before = "AEIBCDFGHJ";
  const used = [3, 4, 5];
  const result = refillUsedLetters(before, used, 2);

  assert.equal(result.letters[0], "A");
  assert.equal(result.letters[1], "E");
  assert.equal(result.letters[2], "I");
  assert.ok(dictionary.countVowels(result.letters) >= 3);
  for (let slot = 0; slot < before.length; slot += 1) {
    if (!used.includes(slot)) assert.equal(result.letters[slot], before[slot]);
  }
});

test("refill restores three vowels using only the slots consumed", () => {
  const before = "AEIBCDFGHJ";
  const used = [0, 1, 2];
  const result = refillUsedLetters(before, used, 3);

  assert.ok(dictionary.countVowels(result.letters) >= 3);
  assert.deepEqual(result.replacements.map((item) => item.slot), used);
  for (let slot = 0; slot < before.length; slot += 1) {
    if (!used.includes(slot)) assert.equal(result.letters[slot], before[slot]);
  }
});

test("refill adds as many vowels as possible when too few slots are replaceable", () => {
  const before = "ABCDFGHJKL";
  const used = [1];
  const result = refillUsedLetters(before, used, 4);

  assert.equal(dictionary.countVowels(result.letters), 2);
  for (let slot = 0; slot < before.length; slot += 1) {
    if (!used.includes(slot)) assert.equal(result.letters[slot], before[slot]);
  }
});
