(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const page = document.querySelector(".wordGamePage");
  if (!page) return;

  const i18n = JSON.parse($("wordGameTranslations")?.textContent || "{}");
  const FALLBACKS = {
    it: "AEIORSTNLC".split(""), en: "AEIORSTNLD".split(""), fr: "AEIORSTNLU".split("")
  };
  const VOWELS = new Set("AEIOU".split(""));
  const POOLS = {
    it: "AAAAAAAAAAAAEEEEEEEEEEEEIIIIIIIIIOOOOOOOUUUUUBBBBBCCCCCCDDDDDFFFFGGGGHHHLLLLLLMMMMMNNNNNNNNPPPPPQRRRRRRRRSSSSSSSSTTTTTTTVVZZ",
    en: "AAAAAAAAAAAAEEEEEEEEEEEEEEEEIIIIIIIIIOOOOOOOOUUUUUBBBBCCCCDDDDDDFFFFGGGGGHHHHHHLLLLLLMMMMNNNNNNNNPPPPQRRRRRRSSSSSSSSTTTTTTTTVVWWYY",
    fr: "AAAAAAAAAAAAEEEEEEEEEEEEEEEEIIIIIIIIOOOOOOOUUUUUUUBBBBCCCCCDDDDDDFFFFGGGGHHHHLLLLLLMMMMMNNNNNNNNPPPPQRRRRRRRSSSSSSSSTTTTTTTTVV"
  };
  const state = {
    level: 1, wordsFound: 0, currentLetters: [], selectedTiles: [], remainingTime: 10,
    totalTimeMs: 0, timerId: null, isRunning: false, language: page.dataset.language || "en",
    dictionary: [], dictionarySet: new Set(), levelLimitMs: 10000, levelStartedAt: 0,
    deadline: 0, audioContext: null, audioEnabled: localStorage.getItem("wordGameAudio") !== "off",
    transitionId: null, toastId: null
  };

  function normalizeWord(word) {
    return String(word || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
  }
  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  }
  function counts(value) { const map = Object.create(null); for (const char of value) map[char] = (map[char] || 0) + 1; return map; }
  function canBuild(word, lettersCount) {
    const used = Object.create(null);
    for (const char of word) { used[char] = (used[char] || 0) + 1; if (used[char] > (lettersCount[char] || 0)) return false; }
    return true;
  }
  function possibleWords(letters, stopAt = Infinity) {
    const available = counts(letters);
    const result = [];
    for (const word of state.dictionary) { if (word.length <= 10 && canBuild(word, available)) { result.push(word); if (result.length >= stopAt) break; } }
    return result;
  }
  function targetForLevel() { return state.level <= 10 ? 8 : state.level <= 25 ? 6 : 5; }
  function randomCandidate() {
    const pool = POOLS[state.language] || POOLS.en;
    const letters = [];
    const consonants = [...pool].filter((c) => !VOWELS.has(c));
    for (let i = 0; i < 3; i += 1) letters.push("AEIOU"[Math.floor(Math.random() * 5)]);
    for (let i = 0; i < 4; i += 1) letters.push(consonants[Math.floor(Math.random() * consonants.length)]);
    while (letters.length < 10) letters.push(pool[Math.floor(Math.random() * pool.length)]);
    return shuffle(letters);
  }
  function generateLetters() {
    const needed = targetForLevel();
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = randomCandidate();
      if (possibleWords(candidate, needed).length >= needed) return candidate;
    }
    return shuffle(FALLBACKS[state.language] || FALLBACKS.en);
  }
  async function loadDictionary() {
    const language = ["it", "en", "fr"].includes(state.language) ? state.language : "en";
    state.language = language;
    const response = await fetch(`/data/word-game/words-${language}.json`, { cache: "force-cache" });
    if (!response.ok) throw new Error("dictionary");
    const words = await response.json();
    state.dictionary = [...new Set(words.map(normalizeWord).filter((word) => word.length >= 3 && word.length <= 10))];
    state.dictionarySet = new Set(state.dictionary);
    if (state.dictionary.length < 25) throw new Error("dictionary");
  }

  function tileButton(tile, selected = false) {
    const button = document.createElement("button");
    button.type = "button"; button.className = "letterTile"; button.textContent = tile.letter;
    button.dataset.tileId = tile.id;
    if (selected) button.setAttribute("aria-label", `${tile.letter}, remove`);
    else { button.classList.toggle("isUsed", state.selectedTiles.includes(tile.id)); button.disabled = state.selectedTiles.includes(tile.id) || !state.isRunning; }
    return button;
  }
  function renderRack() {
    const rack = $("wordRack"); rack.replaceChildren();
    state.currentLetters.forEach((tile) => rack.appendChild(tileButton(tile)));
  }
  function renderBoard() {
    const board = $("wordBoard"); board.replaceChildren();
    if (!state.selectedTiles.length) { const p = document.createElement("span"); p.className = "wordPlaceholder"; p.textContent = i18n.compose; board.appendChild(p); return; }
    state.selectedTiles.forEach((id) => { const tile = state.currentLetters.find((item) => item.id === id); if (tile) board.appendChild(tileButton(tile, true)); });
  }
  function render() {
    $("wordLevel").textContent = state.level; $("wordFound").textContent = state.wordsFound;
    $("wordLanguage").textContent = state.language.toUpperCase(); $("wordTime").textContent = Math.max(0, Math.ceil(state.remainingTime));
    $("wordTimer").classList.toggle("isLow", state.isRunning && state.remainingTime <= 3);
    $("wordConfirmBtn").disabled = !state.isRunning; $("wordClearBtn").disabled = !state.isRunning;
    renderBoard(); renderRack();
  }
  function setFeedback(kind, text) {
    const wrap = $("wordBoardWrap"), feedback = $("wordFeedback");
    wrap.classList.remove("good", "bad"); feedback.className = `wordFeedback ${kind}`; feedback.textContent = text;
    void wrap.offsetWidth; if (kind) wrap.classList.add(kind);
  }
  function initAudio() { if (!state.audioContext && (window.AudioContext || window.webkitAudioContext)) state.audioContext = new (window.AudioContext || window.webkitAudioContext)(); }
  function tone(frequency, duration, type = "sine", volume = .025, delay = 0) {
    if (!state.audioEnabled) return; initAudio(); const context = state.audioContext; if (!context) return;
    const oscillator = context.createOscillator(), gain = context.createGain(), start = context.currentTime + delay;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start); gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(.0001, start + duration / 1000);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + duration / 1000);
  }
  const sound = {
    tap: () => tone(360, 45, "sine", .018),
    good: () => { tone(520, 90, "sine", .028); tone(760, 130, "sine", .025, .08); },
    bad: () => { tone(180, 130, "square", .015); tone(130, 160, "square", .012, .09); },
    over: () => { tone(310, 180, "triangle", .022); tone(220, 240, "triangle", .02, .16); }
  };
  function syncHeight() {
    const top = page.getBoundingClientRect().top; document.documentElement.style.setProperty("--word-game-height", `${Math.max(320, window.innerHeight - top)}px`);
  }
  function startLevel() {
    clearInterval(state.timerId); state.currentLetters = generateLetters().map((letter, index) => ({ id: `L${state.level}-${index}-${Math.random().toString(36).slice(2, 7)}`, letter }));
    state.selectedTiles = []; state.levelStartedAt = performance.now(); state.deadline = state.levelStartedAt + state.levelLimitMs; state.remainingTime = state.levelLimitMs / 1000;
    setFeedback("", ""); render(); state.timerId = setInterval(tick, 100);
  }
  function tick() {
    const remainingMs = Math.max(0, state.deadline - performance.now()); state.remainingTime = remainingMs / 1000; $("wordTime").textContent = Math.ceil(state.remainingTime); $("wordTimer").classList.toggle("isLow", state.remainingTime <= 3);
    if (remainingMs <= 0) endGame();
  }
  function startGame() {
    clearTimeout(state.transitionId); clearInterval(state.timerId); closeModal("wordGameOverModal");
    Object.assign(state, { level: 1, wordsFound: 0, selectedTiles: [], totalTimeMs: 0, levelLimitMs: 10000, remainingTime: 10, isRunning: true });
    startLevel();
  }
  function clearWord(play = true) { if (!state.isRunning) return; state.selectedTiles = []; if (play) sound.tap(); renderBoard(); renderRack(); }
  function selectedWord() { return state.selectedTiles.map((id) => state.currentLetters.find((tile) => tile.id === id)?.letter || "").join(""); }
  function confirmWord() {
    if (!state.isRunning) return; const word = selectedWord();
    if (word.length < 3 || !state.dictionarySet.has(word)) { sound.bad(); setFeedback("bad", i18n.invalidWord); return; }
    const now = performance.now(), consumed = Math.min(state.levelLimitMs, now - state.levelStartedAt), remaining = Math.max(0, state.deadline - now);
    clearInterval(state.timerId); state.totalTimeMs += consumed; state.wordsFound += 1; state.level += 1; state.levelLimitMs = remaining + 10000; state.remainingTime = state.levelLimitMs / 1000;
    sound.good(); setFeedback("good", i18n.validWord); state.transitionId = setTimeout(startLevel, 420); render();
  }
  function endGame() {
    if (!state.isRunning) return; clearInterval(state.timerId); state.timerId = null; state.totalTimeMs += state.levelLimitMs; state.remainingTime = 0; state.isRunning = false; sound.over(); render();
    $("wordOverLevel").textContent = state.level; $("wordOverFound").textContent = state.wordsFound; $("wordOverTime").textContent = `${(state.totalTimeMs / 1000).toFixed(1)}s`;
    $("wordPlayerName").value = ""; $("wordScoreMessage").textContent = ""; $("wordSaveScoreBtn").disabled = false; openModal("wordGameOverModal");
  }
  function resetInitial() {
    clearInterval(state.timerId); clearTimeout(state.transitionId); Object.assign(state, { level: 1, wordsFound: 0, currentLetters: [], selectedTiles: [], remainingTime: 10, totalTimeMs: 0, isRunning: false, levelLimitMs: 10000 }); setFeedback("", ""); render();
  }
  function openModal(id) { const modal = $(id); modal.classList.add("isOpen"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("wordModalOpen"); }
  function closeModal(id) { const modal = $(id); modal.classList.remove("isOpen"); modal.setAttribute("aria-hidden", "true"); if (!document.querySelector(".wordModalOverlay.isOpen")) document.body.classList.remove("wordModalOpen"); }
  function escapeHtml(value) { const span = document.createElement("span"); span.textContent = value; return span.innerHTML; }
  function showToast(message) { const toast = $("wordToast"); toast.textContent = message; toast.classList.add("isVisible"); clearTimeout(state.toastId); state.toastId = setTimeout(() => toast.classList.remove("isVisible"), 2200); }
  async function loadLeaderboard(rows) {
    if (!rows) { const response = await fetch("/word-game/leaderboard"); if (!response.ok) throw new Error("leaderboard"); rows = (await response.json()).leaderboard || []; }
    const list = $("wordLeaderboardList"), top = rows.slice(0, 20);
    if (!top.length) { list.innerHTML = `<p>${escapeHtml(i18n.noScores)}</p>`; return; }
    list.innerHTML = top.map((row, index) => `<div class="wordLeaderboardRow ${index === 0 ? "rank1" : ""}"><b>#${index + 1}</b><span>${escapeHtml(row.playerName)}</span><small>${escapeHtml(String(row.language || "en").toUpperCase())}</small><small>${escapeHtml(i18n.level)}: ${Number(row.levelReached)}</small><small>${escapeHtml(i18n.wordsFound)}: ${Number(row.wordsFound)} · ${escapeHtml(i18n.time)}: ${(Number(row.totalTimeMs) / 1000).toFixed(1)}s</small></div>`).join("");
  }
  async function saveScore() {
    const playerName = $("wordPlayerName").value.trim();
    if (!/^[\p{L}\p{N} _-]{1,30}$/u.test(playerName)) { $("wordScoreMessage").textContent = i18n.invalidName; sound.bad(); return; }
    try {
      const response = await fetch("/word-game/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerName, levelReached: state.level, wordsFound: state.wordsFound, totalTimeMs: Math.max(1, Math.round(state.totalTimeMs)), language: state.language }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      $("wordSaveScoreBtn").disabled = true; closeModal("wordGameOverModal"); showToast(i18n.resultSaved); resetInitial();
    } catch (_) { $("wordScoreMessage").textContent = i18n.saveError; sound.bad(); }
  }

  $("wordRack").addEventListener("click", (event) => { const button = event.target.closest(".letterTile"); if (!button || !state.isRunning || state.selectedTiles.includes(button.dataset.tileId)) return; sound.tap(); state.selectedTiles.push(button.dataset.tileId); renderBoard(); renderRack(); });
  $("wordBoard").addEventListener("click", (event) => { const button = event.target.closest(".letterTile"); if (!button || !state.isRunning) return; sound.tap(); const index = state.selectedTiles.indexOf(button.dataset.tileId); if (index >= 0) state.selectedTiles.splice(index, 1); renderBoard(); renderRack(); });
  $("wordStartBtn").addEventListener("click", startGame); $("wordClearBtn").addEventListener("click", () => clearWord()); $("wordConfirmBtn").addEventListener("click", confirmWord);
  $("wordCloseGameOverBtn").addEventListener("click", () => { closeModal("wordGameOverModal"); resetInitial(); }); $("wordSaveScoreBtn").addEventListener("click", saveScore);
  $("wordPlayerName").addEventListener("keydown", (event) => { if (event.key === "Enter") saveScore(); });
  $("wordLeaderboardBtn").addEventListener("click", () => { openModal("wordLeaderboardModal"); loadLeaderboard().catch(() => { $("wordLeaderboardList").innerHTML = `<p>${escapeHtml(i18n.loadingError)}</p>`; }); });
  $("wordCloseLeaderboardBtn").addEventListener("click", () => closeModal("wordLeaderboardModal")); $("wordLeaderboardModal").addEventListener("click", (event) => { if (event.target.id === "wordLeaderboardModal") closeModal("wordLeaderboardModal"); });
  $("wordAudioBtn").addEventListener("click", () => { state.audioEnabled = !state.audioEnabled; localStorage.setItem("wordGameAudio", state.audioEnabled ? "on" : "off"); $("wordAudioBtn").textContent = state.audioEnabled ? "🔊" : "🔇"; if (state.audioEnabled) sound.tap(); });
  document.addEventListener("pointerdown", initAudio, { once: true }); window.addEventListener("resize", syncHeight); window.addEventListener("orientationchange", syncHeight);
  window.__LWWordGame = { normalizeWord, canBuild, possibleWords, generateLetters, state };
  $("wordAudioBtn").textContent = state.audioEnabled ? "🔊" : "🔇"; syncHeight(); render();
  loadDictionary().then(() => { $("wordStartBtn").disabled = false; state.currentLetters = generateLetters().map((letter, index) => ({ id: `preview-${index}`, letter })); render(); }).catch(() => { $("wordFeedback").textContent = i18n.loadingError; $("wordStartBtn").disabled = true; });
})();
