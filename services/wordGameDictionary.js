const fs = require("fs");
const path = require("path");

const DICTIONARY_DIR = path.join(__dirname, "..", "data", "word-game", "it");
const BOARD_SIZE = 10;
const MIN_VOWELS = 3;
const VOWEL_LETTERS = Object.freeze(["A", "E", "I", "O", "U"]);
const VOWELS = new Set(VOWEL_LETTERS);
const LETTER_POOL = "AAAAAAAAAAAAEEEEEEEEEEEEIIIIIIIIIOOOOOOOUUUUUBBBBBCCCCCCDDDDDFFFFGGGGHHHLLLLLLMMMMMNNNNNNNNPPPPPQRRRRRRRRSSSSSSSSTTTTTTTVVZZ";
const VOWEL_POOL = [...LETTER_POOL].filter((letter) => VOWELS.has(letter)).join("");
const CONSONANT_POOL = [...LETTER_POOL].filter((letter) => !VOWELS.has(letter)).join("");
let dictionaryCache;

function randomFrom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

function isVowel(letter) {
  return VOWELS.has(String(letter || "").toUpperCase());
}

function countVowels(tiles) {
  return [...String(Array.isArray(tiles) ? tiles.join("") : tiles || "")].filter(isVowel).length;
}

function generateRandomVowel() {
  return randomFrom(VOWEL_POOL);
}

function generateRandomConsonant() {
  return randomFrom(CONSONANT_POOL);
}

function generateRandomLetter() {
  return randomFrom(LETTER_POOL);
}

function ensureMinimumVowels(tiles, mutableIndexes) {
  const result = Array.isArray(tiles) ? [...tiles] : [...String(tiles || "")];
  const missingVowels = Math.max(0, MIN_VOWELS - countVowels(result));
  if (!missingVowels) return result;

  const allowedIndexes = mutableIndexes == null
    ? result.map((_, index) => index)
    : [...new Set(mutableIndexes)];
  const replaceableIndexes = shuffle(allowedIndexes.filter((index) => (
    Number.isInteger(index)
    && index >= 0
    && index < result.length
    && !isVowel(result[index])
  )));

  for (const index of replaceableIndexes.slice(0, missingVowels)) {
    result[index] = generateRandomVowel();
  }
  return result;
}

function normalizeItalianWord(value) {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  // Apostrophes, hyphens, digits and punctuation are rejected rather than silently removed.
  return /^[A-Z]+$/.test(normalized) ? normalized : "";
}

function letterCounts(value) {
  const counts = Object.create(null);
  for (const letter of value) counts[letter] = (counts[letter] || 0) + 1;
  return counts;
}

function canBuildWord(word, availableLetters) {
  const available = typeof availableLetters === "string" ? letterCounts(availableLetters) : availableLetters;
  const used = Object.create(null);
  for (const letter of word) {
    used[letter] = (used[letter] || 0) + 1;
    if (used[letter] > (available[letter] || 0)) return false;
  }
  return true;
}

function loadItalianDictionary() {
  if (dictionaryCache) return dictionaryCache;
  if (!fs.existsSync(DICTIONARY_DIR)) throw new Error(`Word Game IT dictionary directory not found: ${DICTIONARY_DIR}`);

  const files = fs.readdirSync(DICTIONARY_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".txt")
    .map((entry) => entry.name)
    .sort();
  if (!files.length) throw new Error(`Word Game IT dictionary has no txt files: ${DICTIONARY_DIR}`);

  const words = new Set();
  for (const file of files) {
    const content = fs.readFileSync(path.join(DICTIONARY_DIR, file), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const word = normalizeItalianWord(trimmed);
      if (word.length >= 3) words.add(word);
    }
  }
  if (!words.size) throw new Error(`Word Game IT dictionary contains no valid words: ${DICTIONARY_DIR}`);

  const playableWords = [...words].filter((word) => word.length <= 10);
  if (!playableWords.length) throw new Error("Word Game IT dictionary contains no words between 3 and 10 letters");
  const generationSeeds = playableWords.filter((word) => word.length >= 5 && word.length <= 8);
  dictionaryCache = { words, playableWords, generationSeeds, files: files.length };
  console.info(`Word Game IT dictionary loaded: ${words.size} words from ${files.length} txt files.`);
  return dictionaryCache;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function targetForLevel(level) {
  return level <= 10 ? 8 : level <= 25 ? 6 : 5;
}

function countPossibleWords(letters, words, stopAt) {
  const available = letterCounts(letters);
  let found = 0;
  for (const word of words) {
    if (canBuildWord(word, available) && ++found >= stopAt) break;
  }
  return found;
}

function makeCandidate(seed) {
  const letters = [...seed].slice(0, BOARD_SIZE);
  while (letters.length < BOARD_SIZE) letters.push(generateRandomLetter());
  return shuffle(ensureMinimumVowels(letters)).join("");
}

function generateLetters(level = 1) {
  const { playableWords, generationSeeds } = loadItalianDictionary();
  const needed = targetForLevel(level);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const seed = generationSeeds[Math.floor(Math.random() * generationSeeds.length)];
    const candidate = makeCandidate(seed);
    if (countPossibleWords(candidate, playableWords, needed) >= needed) return candidate;
  }

  const safeCandidate = "AEIORSTNLC";
  if (countPossibleWords(safeCandidate, playableWords, needed) >= needed) return shuffle(safeCandidate).join("");
  throw new Error(`Unable to generate a playable Italian letter set for level ${level}`);
}

function validateItalianWord(value, letters) {
  const word = normalizeItalianWord(value);
  if (word.length < 3) return { valid: false, reason: "minimumLength" };
  if (!loadItalianDictionary().words.has(word)) return { valid: false, reason: "notInDictionary" };
  if (!canBuildWord(word, letterCounts(String(letters || "")))) return { valid: false, reason: "unavailableLetters" };
  return { valid: true, word };
}

function timeBonusForWord(word) {
  return normalizeItalianWord(word).length;
}

function refillUsedTiles(currentLetters, usedIndexes, level = 1) {
  const board = String(currentLetters || "").toUpperCase();
  const slots = [...new Set(usedIndexes)].sort((a, b) => a - b);
  if (!new RegExp(`^[A-Z]{${BOARD_SIZE}}$`).test(board)) return null;
  if (!slots.length || slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot >= BOARD_SIZE)) return null;

  const generatedLetters = generateLetters(level);
  let nextLetters = [...board];
  slots.forEach((slot, index) => { nextLetters[slot] = generatedLetters[index]; });
  nextLetters = ensureMinimumVowels(nextLetters, slots);

  const replacements = slots.map((slot) => ({ slot, letter: nextLetters[slot] }));
  return { letters: nextLetters.join(""), replacements };
}

function clearDictionaryCache() { dictionaryCache = undefined; }

module.exports = {
  DICTIONARY_DIR,
  BOARD_SIZE,
  MIN_VOWELS,
  VOWEL_LETTERS,
  isVowel,
  countVowels,
  generateRandomVowel,
  generateRandomConsonant,
  generateRandomLetter,
  ensureMinimumVowels,
  normalizeItalianWord,
  canBuildWord,
  loadItalianDictionary,
  generateLetters,
  refillUsedTiles,
  targetForLevel,
  timeBonusForWord,
  validateItalianWord,
  clearDictionaryCache
};
