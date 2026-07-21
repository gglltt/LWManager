(() => {
  "use strict";

  const Engine = window.LWMemoryEngine;
  const byId = (id) => document.getElementById(id);
  if (!Engine || !byId("memoryBoard")) return;

  const i18n = JSON.parse(byId("memoryGameTranslations")?.textContent || "{}");
  const locale = document.querySelector(".memory-game-page")?.dataset.locale || undefined;
  const state = {
    game: Engine.createGameState(1),
    started: false,
    previewActive: false,
    inputLocked: false,
    remainingSeconds: Engine.levelConfig(1).timeLimit,
    deadline: 0,
    levelStartedAt: 0,
    totalTimeMs: 0,
    levelsCompleted: 0,
    timerId: null,
    previewId: null,
    mismatchId: null,
    toastId: null,
    scoreSaved: false,
    activeModal: null,
    previousFocus: null
  };

  const numberFormatter = new Intl.NumberFormat(locale);
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  }[character]));
  const formatDuration = (milliseconds) => `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;

  function clearTimers() {
    clearInterval(state.timerId);
    clearInterval(state.previewId);
    clearTimeout(state.mismatchId);
    state.timerId = null;
    state.previewId = null;
    state.mismatchId = null;
  }

  function levelConfig() {
    return Engine.levelConfig(state.game.level);
  }

  function setStatus(message) {
    byId("memoryStatus").textContent = message;
  }

  function renderStats() {
    const config = levelConfig();
    byId("memoryLevelValue").textContent = `${state.game.level}/${Engine.MAX_LEVEL}`;
    byId("memoryScoreValue").textContent = numberFormatter.format(state.game.score);
    byId("memoryTimeValue").textContent = state.remainingSeconds;
    byId("memoryErrorsValue").textContent = state.game.errors;
    byId("memoryPairsValue").textContent = `${state.game.pairsFound}/${config.pairs}`;
    byId("memoryTimerStat").classList.toggle("is-low", state.started && !state.previewActive && state.remainingSeconds <= 10);
    byId("memoryStartLabel").textContent = state.started ? i18n.restart : i18n.start;
  }

  function cardLabel(card, index, isRevealed, isMatched) {
    const symbolLabel = i18n.symbols?.[card.symbolId] || card.symbolId;
    if (isMatched) return `${i18n.matchedCard}: ${symbolLabel}`;
    if (isRevealed) return symbolLabel;
    return `${i18n.revealCard}: ${i18n.hiddenCard} ${index + 1}`;
  }

  function renderBoard() {
    const board = byId("memoryBoard");
    const config = levelConfig();
    board.style.setProperty("--memory-columns", config.columns);
    board.setAttribute("aria-busy", state.previewActive ? "true" : "false");
    board.innerHTML = state.game.deck.map((card, index) => {
      const isMatched = state.game.matchedIndexes.includes(index);
      const isSelected = state.game.selectedIndexes.includes(index);
      const isRevealed = state.previewActive || isMatched || isSelected;
      const classes = ["memoryCard", isRevealed ? "is-revealed" : "", isMatched ? "is-matched" : ""].filter(Boolean).join(" ");
      const disabled = state.previewActive || state.inputLocked || isMatched || state.game.status !== "playing";
      return `<button class="${classes}" type="button" data-memory-card="${index}" aria-label="${escapeHtml(cardLabel(card, index, isRevealed, isMatched))}" aria-pressed="${isRevealed ? "true" : "false"}"${disabled ? " disabled" : ""}>
        <span class="memoryCard__inner">
          <span class="memoryCard__face memoryCard__cover" aria-hidden="true"></span>
          <span class="memoryCard__face memoryCard__symbol" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false"><use href="#memory-symbol-${card.symbolId}"></use></svg></span>
        </span>
      </button>`;
    }).join("");
    renderStats();
  }

  function showToast(message) {
    const toast = byId("memoryToast");
    toast.textContent = message;
    toast.classList.add("is-visible");
    clearTimeout(state.toastId);
    state.toastId = setTimeout(() => toast.classList.remove("is-visible"), 2200);
  }

  function openModal(id) {
    const modal = byId(id);
    if (!modal) return;
    state.previousFocus = document.activeElement;
    state.activeModal = modal;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("memoryModalOpen");
    setTimeout(() => modal.querySelector("button, input, [href]")?.focus(), 30);
  }

  function closeModal(modal = state.activeModal) {
    if (!modal) return;
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    if (state.activeModal === modal) state.activeModal = null;
    if (!document.querySelector(".memoryModalOverlay.is-open")) document.body.classList.remove("memoryModalOpen");
    state.previousFocus?.focus?.();
  }

  function startTimer() {
    state.levelStartedAt = Date.now();
    state.deadline = state.levelStartedAt + (levelConfig().timeLimit * 1000);
    state.timerId = setInterval(() => {
      const remainingMs = Math.max(0, state.deadline - Date.now());
      state.remainingSeconds = Math.ceil(remainingMs / 1000);
      renderStats();
      if (remainingMs <= 0) timeOut();
    }, 200);
  }

  function beginLevel() {
    clearTimers();
    const config = levelConfig();
    state.previewActive = true;
    state.inputLocked = true;
    state.remainingSeconds = config.timeLimit;
    const previewDeadline = Date.now() + config.previewMs;
    renderBoard();

    const updatePreview = () => {
      const seconds = Math.max(1, Math.ceil((previewDeadline - Date.now()) / 1000));
      setStatus(`${i18n.memorize} · ${seconds}`);
      if (Date.now() < previewDeadline) return;
      clearInterval(state.previewId);
      state.previewId = null;
      state.previewActive = false;
      state.inputLocked = false;
      state.game = Engine.startLevel(state.game);
      setStatus(i18n.cardsHidden);
      renderBoard();
      startTimer();
    };

    updatePreview();
    state.previewId = setInterval(updatePreview, 100);
  }

  function startNewGame() {
    clearTimers();
    document.querySelectorAll(".memoryModalOverlay.is-open").forEach((modal) => closeModal(modal));
    Object.assign(state, {
      game: Engine.createGameState(1),
      started: true,
      previewActive: false,
      inputLocked: false,
      remainingSeconds: Engine.levelConfig(1).timeLimit,
      deadline: 0,
      levelStartedAt: 0,
      totalTimeMs: 0,
      levelsCompleted: 0,
      scoreSaved: false
    });
    beginLevel();
  }

  function finishLevel() {
    if (state.game.status !== "playing") return;
    clearInterval(state.timerId);
    state.timerId = null;
    const remainingMs = Math.max(0, state.deadline - Date.now());
    const bonusSeconds = Math.floor(remainingMs / 1000);
    state.totalTimeMs += Math.max(1, Date.now() - state.levelStartedAt);
    state.game = Engine.completeLevel(state.game, bonusSeconds);
    state.levelsCompleted = state.game.level;
    state.inputLocked = true;
    state.remainingSeconds = Math.ceil(remainingMs / 1000);
    renderBoard();

    if (state.game.status === "won") {
      setStatus(i18n.victory);
      showFinalResult(true);
      return;
    }

    setStatus(i18n.levelComplete);
    byId("memoryLevelBonus").textContent = `+${numberFormatter.format(bonusSeconds * Engine.TIME_BONUS_MULTIPLIER)}`;
    byId("memoryLevelScore").textContent = numberFormatter.format(state.game.score);
    openModal("memoryLevelModal");
  }

  function timeOut() {
    if (state.game.status !== "playing") return;
    clearInterval(state.timerId);
    clearTimeout(state.mismatchId);
    state.timerId = null;
    state.mismatchId = null;
    state.totalTimeMs += Math.max(1, Date.now() - state.levelStartedAt);
    state.remainingSeconds = 0;
    state.game = Engine.expireLevel(state.game);
    state.inputLocked = true;
    renderBoard();
    setStatus(i18n.gameOver);
    showFinalResult(false);
  }

  function showFinalResult(isVictory) {
    state.scoreSaved = false;
    byId("memoryGameOverTitle").textContent = isVictory ? i18n.victory : i18n.gameOver;
    byId("memoryFinalMessage").textContent = i18n.finalSummary;
    byId("memoryFinalLevel").textContent = state.game.level;
    byId("memoryFinalScore").textContent = numberFormatter.format(state.game.score);
    byId("memoryFinalPairs").textContent = state.game.totalPairsFound;
    byId("memoryFinalErrors").textContent = state.game.errors;
    byId("memoryFinalTime").textContent = formatDuration(state.totalTimeMs);
    byId("memoryPlayerName").value = "";
    byId("memoryScoreMessage").textContent = "";
    byId("memorySaveButton").disabled = false;
    openModal("memoryGameOverModal");
  }

  function selectCard(index) {
    if (state.inputLocked || state.previewActive || state.game.status !== "playing") return;
    const result = Engine.selectCard(state.game, index);
    if (!result.accepted) return;
    state.game = result.state;
    renderBoard();
    if (!result.resolved) return;

    if (result.match) {
      setStatus(`${i18n.matchFound} · +${numberFormatter.format(Engine.pairPoints(state.game.level))} ${i18n.points}`);
      if (result.levelFinished) {
        state.inputLocked = true;
        renderBoard();
        finishLevel();
      }
      return;
    }

    state.inputLocked = true;
    setStatus(i18n.noMatch);
    renderBoard();
    state.mismatchId = setTimeout(() => {
      state.game = Engine.clearSelection(state.game);
      state.inputLocked = false;
      setStatus(i18n.cardsHidden);
      renderBoard();
    }, 800);
  }

  function nextLevel() {
    closeModal(byId("memoryLevelModal"));
    state.game = Engine.nextLevel(state.game);
    state.inputLocked = false;
    beginLevel();
  }

  function renderLeaderboard(rows) {
    const list = byId("memoryLeaderboardList");
    if (!rows?.length) {
      list.innerHTML = `<p>${escapeHtml(i18n.noScores)}</p>`;
      return;
    }
    list.innerHTML = rows.slice(0, 20).map((row, index) => `<div class="memoryLeaderboardRow${index < 3 ? " memoryLeaderboardRow--top" : ""}">
      <strong>#${index + 1}</strong>
      <span class="memoryLeaderboardRow__name">${escapeHtml(row.playerName)}</span>
      <span class="memoryLeaderboardRow__details"><b>${numberFormatter.format(row.score)} ${escapeHtml(i18n.points)}</b><small>${escapeHtml(i18n.level)} ${row.levelReached} · ${formatDuration(row.totalTimeMs)}</small><small>${row.createdAt ? new Date(row.createdAt).toLocaleDateString(locale) : ""}</small></span>
    </div>`).join("");
  }

  async function loadLeaderboard(rows) {
    if (rows) {
      renderLeaderboard(rows);
      return;
    }
    byId("memoryLeaderboardList").innerHTML = `<p>${escapeHtml(i18n.loading)}</p>`;
    const response = await fetch("/memory-game/leaderboard", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("leaderboardUnavailable");
    const data = await response.json();
    renderLeaderboard(data.leaderboard || []);
  }

  async function saveScore() {
    if (state.scoreSaved) return;
    const playerName = byId("memoryPlayerName").value.trim();
    if (!/^[\p{L}\p{N} _-]{1,30}$/u.test(playerName)) {
      byId("memoryScoreMessage").textContent = i18n.invalidName;
      return;
    }

    byId("memorySaveButton").disabled = true;
    try {
      const response = await fetch("/memory-game/score", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          playerName,
          score: state.game.score,
          levelsCompleted: state.levelsCompleted,
          levelReached: state.game.level,
          pairsFound: state.game.totalPairsFound,
          errors: state.game.errors,
          totalTimeMs: Math.max(1, Math.round(state.totalTimeMs))
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "saveFailed");
      state.scoreSaved = true;
      byId("memoryScoreMessage").textContent = i18n.resultSaved;
      renderLeaderboard(data.leaderboard || []);
      showToast(i18n.resultSaved);
    } catch (_) {
      byId("memorySaveButton").disabled = false;
      byId("memoryScoreMessage").textContent = i18n.saveError;
    }
  }

  byId("memoryBoard").addEventListener("click", (event) => {
    const card = event.target.closest("[data-memory-card]");
    if (card) selectCard(Number(card.dataset.memoryCard));
  });
  byId("memoryStartButton").addEventListener("click", startNewGame);
  byId("memoryRestartButton").addEventListener("click", startNewGame);
  byId("memoryNextLevelButton").addEventListener("click", nextLevel);
  byId("memorySaveButton").addEventListener("click", saveScore);
  byId("memoryPlayerName").addEventListener("keydown", (event) => { if (event.key === "Enter") saveScore(); });
  byId("memoryHelpButton").addEventListener("click", () => openModal("memoryHelpModal"));
  byId("memoryLeaderboardButton").addEventListener("click", () => {
    openModal("memoryLeaderboardModal");
    loadLeaderboard().catch(() => { byId("memoryLeaderboardList").innerHTML = `<p>${escapeHtml(i18n.saveError)}</p>`; });
  });
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".memoryModalOverlay"))));
  ["memoryHelpModal", "memoryLeaderboardModal"].forEach((id) => byId(id).addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeModal(event.currentTarget);
  }));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && [byId("memoryHelpModal"), byId("memoryLeaderboardModal")].includes(state.activeModal)) closeModal();
  });

  setStatus(i18n.ready);
  renderBoard();
})();
