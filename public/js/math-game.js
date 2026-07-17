(() => {
  const $ = (id) => document.getElementById(id);
  const i18n = JSON.parse($("mathGameTranslations")?.textContent || "{}");
  const state = { level: 1, levelsCompleted: 0, currentChallenge: null, answerInput: "", levelStartTime: 0, totalTimeMs: 0, remainingSeconds: 10, isGameOver: false, timerId: null, scoreSaved: false };
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (items) => items[rand(0, items.length - 1)];
  const formatSeconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const escapeHtml = (v) => String(v).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

  function syncViewportHeight() {
    const topbarHeight = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--math-game-available-height", `${Math.max(0, window.innerHeight - topbarHeight)}px`);
  }

  function getTimeLimitForLevel(level) { return Math.max(5, 11 - Math.ceil(level / 10)); }
  function challenge(text, answer) { return { text, answer }; }
  function generateMathChallenge(level) {
    if (level <= 3) { const a = rand(1, 10), b = rand(1, 10); return challenge(`${a} + ${b}`, a + b); }
    if (level <= 6) { const op = pick(["+", "-"]); let a = rand(1, 20), b = rand(1, 20); if (op === "-" && b > a) [a, b] = [b, a]; return challenge(`${a} ${op} ${b}`, op === "+" ? a + b : a - b); }
    if (level <= 10) { const op = pick(["+", "-"]); let a = rand(10, 50), b = rand(10, 50); if (op === "-" && b > a) [a, b] = [b, a]; return challenge(`${a} ${op} ${b}`, op === "+" ? a + b : a - b); }
    if (level <= 15) { const a = rand(2, 10), b = rand(2, 10); return challenge(`${a} × ${b}`, a * b); }
    if (level <= 20) { const op = pick(["+", "-", "×"]); let a = rand(10, 80), b = rand(2, 30); if (op === "-" && b > a) [a, b] = [b, a]; return challenge(`${a} ${op} ${b}`, op === "+" ? a + b : op === "-" ? a - b : a * b); }
    if (level <= 30) { const answer = rand(2, 15), divisor = rand(2, 12); return challenge(`${answer * divisor} / ${divisor}`, answer); }
    const ops = ["+", "-", "×"]; const op1 = pick(ops), op2 = pick(ops); let a = rand(8, 120), b = rand(2, 30), c = rand(2, 30);
    let answer = op1 === "×" ? a * b : op1 === "+" ? a + b : a - b;
    if (op2 === "×" && op1 !== "×") answer = op1 === "+" ? a + (b * c) : a - (b * c); else answer = op2 === "×" ? answer * c : op2 === "+" ? answer + c : answer - c;
    if (answer < 0) return generateMathChallenge(20);
    return challenge(`${a} ${op1} ${b} ${op2} ${c}`, answer);
  }

  function render() {
    $("levelValue").textContent = state.level; $("completedValue").textContent = state.levelsCompleted; $("totalTimeValue").textContent = formatSeconds(state.totalTimeMs);
    $("challengeText").textContent = state.currentChallenge?.text || "—"; $("remainingValue").textContent = state.remainingSeconds;
    $("answerDisplay").textContent = state.answerInput || "0";
  }
  function startLevel() { clearInterval(state.timerId); state.currentChallenge = generateMathChallenge(state.level); state.answerInput = ""; state.remainingSeconds = getTimeLimitForLevel(state.level); state.levelStartTime = Date.now(); state.isGameOver = false; render(); state.timerId = setInterval(tick, 250); }
  function tick() { const limit = getTimeLimitForLevel(state.level) * 1000; const elapsed = Date.now() - state.levelStartTime; state.remainingSeconds = Math.max(0, Math.ceil((limit - elapsed) / 1000)); render(); if (elapsed >= limit) endGame(); }
  function flash(kind, msg) { const zone = $("answerZone"); $("answerFeedback").textContent = msg; zone.classList.remove("correct", "wrong"); void zone.offsetWidth; zone.classList.add(kind); }
  function confirmAnswer() { if (state.isGameOver || !state.currentChallenge || !state.answerInput) return; if (Number(state.answerInput) === state.currentChallenge.answer) { state.totalTimeMs += Date.now() - state.levelStartTime; state.levelsCompleted += 1; state.level += 1; flash("correct", i18n.correct || "Correct!"); setTimeout(startLevel, 420); } else { flash("wrong", i18n.wrong || "Try again"); } }
  function renderGameOverStats() { $("overReached").textContent = state.level; $("overCompleted").textContent = state.levelsCompleted; $("overTime").textContent = formatSeconds(state.totalTimeMs); }
  function openGameOverModal() { renderGameOverStats(); $("scoreMessage").textContent = ""; $("playerName").value = ""; $("saveScoreBtn").disabled = false; const modal = $("gameOverModal"); modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false"); setTimeout(() => $("playerName").focus(), 60); }
  function closeGameOverModal() { const modal = $("gameOverModal"); modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); }
  function endGame() { if (state.isGameOver) return; clearInterval(state.timerId); state.isGameOver = true; state.scoreSaved = false; openGameOverModal(); }
  function resetGame() { closeGameOverModal(); Object.assign(state, { level: 1, levelsCompleted: 0, answerInput: "", totalTimeMs: 0, isGameOver: false, scoreSaved: false }); $("answerFeedback").textContent = ""; startLevel(); }
  async function loadLeaderboard(rows) { if (!rows) { const res = await fetch("/math-game/leaderboard"); rows = (await res.json()).leaderboard || []; } const list = $("leaderboardList"); if (!rows.length) { list.innerHTML = `<div class="leaderboardEmpty">${i18n.noScores || "No scores yet"}</div>`; return; } list.innerHTML = rows.slice(0, 3).map((r, idx) => `<div class="leaderboardRow"><b>#${idx + 1}</b><span>${escapeHtml(r.playerName)}</span><small>${r.levelsCompleted} ${i18n.levels || "levels"}</small><small>${formatSeconds(r.totalTimeMs)}</small><time>${new Date(r.createdAt).toLocaleDateString()}</time></div>`).join(""); }
  async function saveScore() { const playerName = $("playerName").value.trim(); if (!/^[\p{L}\p{N} _-]{1,30}$/u.test(playerName)) { $("scoreMessage").textContent = i18n.invalidName; return; } const res = await fetch("/math-game/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerName, levelsCompleted: state.levelsCompleted, reachedLevel: state.level, totalTimeMs: Math.max(1, Math.round(state.totalTimeMs)) }) }); const data = await res.json(); if (!res.ok) { $("scoreMessage").textContent = i18n.saveError; return; } state.scoreSaved = true; $("scoreMessage").textContent = i18n.scoreSaved; $("saveScoreBtn").disabled = true; loadLeaderboard(data.leaderboard); }

  document.querySelectorAll("[data-number]").forEach((btn) => btn.addEventListener("click", () => { if (!state.isGameOver && state.currentChallenge && state.answerInput.length < 6) { state.answerInput += btn.dataset.number; render(); } }));
  $("clearBtn").addEventListener("click", () => { if (state.isGameOver) return; state.answerInput = ""; render(); });
  $("confirmBtn").addEventListener("click", confirmAnswer);
  $("startGameBtn").addEventListener("click", resetGame);
  $("playAgainBtn").addEventListener("click", resetGame);
  $("saveScoreBtn").addEventListener("click", saveScore);
  window.addEventListener("resize", syncViewportHeight);
  window.addEventListener("orientationchange", syncViewportHeight);
  syncViewportHeight(); render(); loadLeaderboard().catch(() => { $("leaderboardList").innerHTML = `<div class="leaderboardEmpty">${i18n.saveError || "Unavailable"}</div>`; });
})();
