const LETTER_SCORES = Object.freeze({
  A: 1, C: 1, E: 1, I: 1, O: 1, R: 1, S: 1, T: 1,
  L: 2, M: 2, N: 2, P: 3, B: 4, D: 4, F: 4, G: 4,
  U: 4, V: 4, H: 8, Z: 8, Q: 10
});

const LENGTH_BONUSES = Object.freeze({ 5: 5, 6: 10, 7: 30, 8: 50 });

function normalizeWord(value) {
  const normalized = String(value ?? "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return /^[A-Z]+$/.test(normalized) ? normalized : "";
}

function getLetterScore(letter) {
  return LETTER_SCORES[normalizeWord(letter)] || 0;
}

function getLengthBonus(wordLength) {
  const length = Number(wordLength);
  if (length >= 9) return 100;
  return LENGTH_BONUSES[length] || 0;
}

function calculateWordScore(word, options = {}) {
  const normalizedWord = normalizeWord(word);
  const baseScore = [...normalizedWord].reduce((sum, letter) => sum + getLetterScore(letter), 0);
  const lengthBonus = getLengthBonus(normalizedWord.length);
  const requestedMultiplier = Number(options.comboMultiplier ?? 1);
  const comboMultiplier = Number.isFinite(requestedMultiplier) && requestedMultiplier >= 1
    ? requestedMultiplier : 1;
  return {
    word: normalizedWord,
    baseScore,
    lengthBonus,
    comboMultiplier,
    totalScore: Math.round((baseScore + lengthBonus) * comboMultiplier)
  };
}

module.exports = { LETTER_SCORES, LENGTH_BONUSES, normalizeWord, getLetterScore, getLengthBonus, calculateWordScore };
