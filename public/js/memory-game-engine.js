(function memoryEngineModule(root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  else root.LWMemoryEngine = engine;
}(typeof globalThis !== "undefined" ? globalThis : this, function createMemoryEngine() {
  "use strict";

  const MAX_LEVEL = 10;
  const MATCH_BASE_POINTS = 100;
  const ERROR_PENALTY = 10;
  const TIME_BONUS_MULTIPLIER = 2;
  const MAX_SHUFFLE_ATTEMPTS = 100;

  const LEVELS = Object.freeze([
    { level: 1, rows: 2, columns: 3, pairs: 3, timeLimit: 45, previewMs: 3000 },
    { level: 2, rows: 3, columns: 4, pairs: 6, timeLimit: 55, previewMs: 3000 },
    { level: 3, rows: 4, columns: 4, pairs: 8, timeLimit: 65, previewMs: 2500 },
    { level: 4, rows: 4, columns: 4, pairs: 8, timeLimit: 60, previewMs: 2500 },
    { level: 5, rows: 4, columns: 5, pairs: 10, timeLimit: 75, previewMs: 2500 },
    { level: 6, rows: 4, columns: 5, pairs: 10, timeLimit: 70, previewMs: 2000 },
    { level: 7, rows: 5, columns: 6, pairs: 15, timeLimit: 90, previewMs: 2000 },
    { level: 8, rows: 5, columns: 6, pairs: 15, timeLimit: 85, previewMs: 2000 },
    { level: 9, rows: 6, columns: 6, pairs: 18, timeLimit: 110, previewMs: 1500 },
    { level: 10, rows: 6, columns: 6, pairs: 18, timeLimit: 100, previewMs: 1500 }
  ]);

  const SYMBOL_IDS = Object.freeze([
    "tank", "jet", "missile", "zombie", "shield", "radar", "helicopter", "drone", "turret",
    "base", "medal", "resources", "explosion", "medical", "workshop", "energy", "allianceFlag", "target"
  ]);

  function levelConfig(level) {
    const numericLevel = Number(level);
    return LEVELS.find((item) => item.level === numericLevel) || null;
  }

  function randomIndex(max, random) {
    if (!Number.isInteger(max) || max <= 0) throw new RangeError("Random range must be a positive integer");
    if (typeof random === "function") {
      const value = Number(random());
      const normalized = Number.isFinite(value) ? value - Math.floor(value) : Math.random();
      return Math.floor(normalized * max);
    }

    const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : null;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      const values = new Uint32Array(1);
      const range = 0x100000000;
      const unbiasedLimit = Math.floor(range / max) * max;
      do cryptoApi.getRandomValues(values); while (values[0] >= unbiasedLimit);
      return values[0] % max;
    }
    return Math.floor(Math.random() * max);
  }

  function shuffleCards(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = randomIndex(index + 1, random);
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }

  function pairPositions(cards) {
    const positions = new Map();
    cards.forEach((card, index) => {
      if (!positions.has(card.symbolId)) positions.set(card.symbolId, []);
      positions.get(card.symbolId).push(index);
    });
    return positions;
  }

  function hasAdjacentPairs(cards, rows, columns, includeDiagonal = false) {
    if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows * columns !== cards.length) {
      throw new RangeError("Grid dimensions do not match the card count");
    }
    for (const indexes of pairPositions(cards).values()) {
      if (indexes.length !== 2) continue;
      const [first, second] = indexes;
      const rowDistance = Math.abs(Math.floor(first / columns) - Math.floor(second / columns));
      const columnDistance = Math.abs((first % columns) - (second % columns));
      const orthogonallyAdjacent = rowDistance + columnDistance === 1;
      const diagonallyAdjacent = includeDiagonal && rowDistance === 1 && columnDistance === 1;
      if (orthogonallyAdjacent || diagonallyAdjacent) return true;
    }
    return false;
  }

  function repairAdjacentPairs(cards, rows, columns, random) {
    const groups = shuffleCards([...pairPositions(cards).values()].map((indexes) => indexes.map((index) => cards[index])), random);
    const firstHalf = groups.map((pair) => pair[0]);
    let orthogonalFallback = null;

    for (let offset = 1; offset <= groups.length; offset += 1) {
      const secondHalf = groups.map((_, position) => groups[(position + offset) % groups.length][1]);
      const candidate = [...firstHalf, ...secondHalf];
      if (hasAdjacentPairs(candidate, rows, columns)) continue;
      if (!hasAdjacentPairs(candidate, rows, columns, true)) return candidate;
      if (!orthogonalFallback) orthogonalFallback = candidate;
    }

    if (orthogonalFallback) return orthogonalFallback;
    throw new Error("Unable to distribute Memory pairs safely");
  }

  function shuffleCardsForGrid(cards, rows, columns, random) {
    let orthogonalFallback = null;
    for (let attempt = 0; attempt < MAX_SHUFFLE_ATTEMPTS; attempt += 1) {
      const candidate = shuffleCards(cards, random);
      if (hasAdjacentPairs(candidate, rows, columns)) continue;
      if (!hasAdjacentPairs(candidate, rows, columns, true)) return candidate;
      if (!orthogonalFallback) orthogonalFallback = candidate;
    }

    const repaired = repairAdjacentPairs(cards, rows, columns, random);
    if (!hasAdjacentPairs(repaired, rows, columns, true)) return repaired;
    return orthogonalFallback || repaired;
  }

  function createDeck(level, random) {
    const config = levelConfig(level);
    if (!config) throw new RangeError("Invalid memory level");
    const symbols = SYMBOL_IDS.slice(0, config.pairs);
    const cards = symbols.flatMap((symbolId) => ([
      { id: `${config.level}-${symbolId}-a`, symbolId },
      { id: `${config.level}-${symbolId}-b`, symbolId }
    ]));
    return shuffleCardsForGrid(cards, config.rows, config.columns, random);
  }

  function normalizeProgress(progress = {}) {
    return {
      score: Math.max(0, Number(progress.score) || 0),
      totalPairsFound: Math.max(0, Number(progress.totalPairsFound) || 0),
      errors: Math.max(0, Number(progress.errors) || 0)
    };
  }

  function createGameState(level = 1, progress = {}, random) {
    const config = levelConfig(level);
    if (!config) throw new RangeError("Invalid memory level");
    return {
      level: config.level,
      deck: createDeck(config.level, random),
      selectedIndexes: [],
      matchedIndexes: [],
      pairsFound: 0,
      ...normalizeProgress(progress),
      status: "preview",
      timeBonusApplied: false,
      lastResult: null
    };
  }

  function startLevel(state) {
    if (!state || state.status !== "preview") return state;
    return { ...state, status: "playing", selectedIndexes: [], lastResult: null };
  }

  function pairPoints(level) {
    return MATCH_BASE_POINTS + (Number(level) * 10);
  }

  function selectCard(state, cardIndex) {
    const index = Number(cardIndex);
    if (!state || state.status !== "playing" || !Number.isInteger(index) || index < 0 || index >= state.deck.length) {
      return { state, accepted: false, resolved: false };
    }
    if (state.matchedIndexes.includes(index) || state.selectedIndexes.includes(index) || state.selectedIndexes.length >= 2) {
      return { state, accepted: false, resolved: false };
    }

    const selectedIndexes = [...state.selectedIndexes, index];
    if (selectedIndexes.length < 2) {
      return { state: { ...state, selectedIndexes, lastResult: null }, accepted: true, resolved: false };
    }

    const [firstIndex, secondIndex] = selectedIndexes;
    const isMatch = state.deck[firstIndex].symbolId === state.deck[secondIndex].symbolId;
    if (!isMatch) {
      return {
        accepted: true,
        resolved: true,
        match: false,
        state: {
          ...state,
          selectedIndexes,
          errors: state.errors + 1,
          score: Math.max(0, state.score - ERROR_PENALTY),
          lastResult: "mismatch"
        }
      };
    }

    const matchedIndexes = [...state.matchedIndexes, firstIndex, secondIndex];
    const pairsFound = state.pairsFound + 1;
    return {
      accepted: true,
      resolved: true,
      match: true,
      levelFinished: matchedIndexes.length === state.deck.length,
      state: {
        ...state,
        selectedIndexes: [],
        matchedIndexes,
        pairsFound,
        totalPairsFound: state.totalPairsFound + 1,
        score: state.score + pairPoints(state.level),
        lastResult: "match"
      }
    };
  }

  function clearSelection(state) {
    if (!state) return state;
    return { ...state, selectedIndexes: [], lastResult: null };
  }

  function completeLevel(state, remainingSeconds) {
    const config = levelConfig(state?.level);
    if (!config || state.matchedIndexes.length !== state.deck.length || state.timeBonusApplied) return state;
    const seconds = Math.max(0, Math.floor(Number(remainingSeconds) || 0));
    return {
      ...state,
      score: state.score + (seconds * TIME_BONUS_MULTIPLIER),
      status: state.level === MAX_LEVEL ? "won" : "levelComplete",
      timeBonusApplied: true,
      selectedIndexes: [],
      lastResult: "complete"
    };
  }

  function expireLevel(state) {
    if (!state || state.status !== "playing") return state;
    return { ...state, status: "gameOver", selectedIndexes: [], lastResult: "timeout" };
  }

  function nextLevel(state, random) {
    if (!state || state.status !== "levelComplete" || state.level >= MAX_LEVEL) return state;
    return createGameState(state.level + 1, state, random);
  }

  return Object.freeze({
    MAX_LEVEL,
    MATCH_BASE_POINTS,
    ERROR_PENALTY,
    TIME_BONUS_MULTIPLIER,
    MAX_SHUFFLE_ATTEMPTS,
    LEVELS,
    SYMBOL_IDS,
    levelConfig,
    randomIndex,
    shuffle: shuffleCards,
    shuffleCards,
    hasAdjacentPairs,
    repairAdjacentPairs,
    shuffleCardsForGrid,
    createDeck,
    createGameState,
    startLevel,
    pairPoints,
    selectCard,
    clearSelection,
    completeLevel,
    expireLevel,
    nextLevel
  });
}));
