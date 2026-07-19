const fs = require("fs");
const path = require("path");

const DICTIONARY_DIR = path.join(__dirname, "..", "data", "word-game", "it");
const VOWELS = new Set(["A", "E", "I", "O", "U"]);
const LETTER_POOL = "AAAAAAAAAAAAEEEEEEEEEEEEIIIIIIIIIOOOOOOOUUUUUBBBBBCCCCCCDDDDDFFFFGGGGHHHLLLLLLMMMMMNNNNNNNNPPPPPQRRRRRRRRSSSSSSSSTTTTTTTVVZZ";
let dictionaryCache;

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
  const letters = [...seed];
  while (letters.filter((letter) => VOWELS.has(letter)).length < 3) {
    letters.push("AEIOU"[Math.floor(Math.random() * 5)]);
  }
  while (letters.length < 10) letters.push(LETTER_POOL[Math.floor(Math.random() * LETTER_POOL.length)]);
  return shuffle(letters.slice(0, 10)).join("");
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

function clearDictionaryCache() { dictionaryCache = undefined; }

module.exports = {
  DICTIONARY_DIR,
  normalizeItalianWord,
  canBuildWord,
  loadItalianDictionary,
  generateLetters,
  targetForLevel,
  timeBonusForWord,
  validateItalianWord,
  clearDictionaryCache
};
