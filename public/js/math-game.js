(() => {
  const $ = (id) => document.getElementById(id);
  const i18n = JSON.parse($("mathGameTranslations")?.textContent || "{}");
  const getAudioPreference = () => { try { return localStorage.getItem("mathGameAudio") !== "off"; } catch (_) { return true; } };
  const setAudioPreference = (enabled) => { try { localStorage.setItem("mathGameAudio", enabled ? "on" : "off"); } catch (_) {} };
  const state = { level: 1, levelsCompleted: 0, streak: 0, currentChallenge: null, answerInput: "", levelStartTime: 0, totalTimeMs: 0, remainingSeconds: 10, isGameOver: false, timerId: null, scoreSaved: false, audioReady: false, audioEnabled: getAudioPreference(), audioContext: null, lowTimeBeepedAt: null, toastId: null };
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const pick = (items) => items[rand(0, items.length - 1)];
  const formatSeconds = (ms) => `${(ms / 1000).toFixed(1)}s`;
  const escapeHtml = (v) => String(v).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));

  function syncViewportHeight() {
    const topbarHeight = document.querySelector(".topbar")?.getBoundingClientRect().height || 0;
    document.documentElement.style.setProperty("--math-game-available-height", `${Math.max(0, window.innerHeight - topbarHeight)}px`);
  }

  function initAudio() {
    if (state.audioReady || !state.audioEnabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try { state.audioContext = new AudioCtx(); state.audioReady = true; if (state.audioContext.state === "suspended") state.audioContext.resume().catch(() => {}); } catch (_) { state.audioContext = null; }
  }
  function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }
  function tone(freq, duration, type = "sine", volume = 0.035, delay = 0) {
    if (!state.audioEnabled) return;
    initAudio();
    const ctx = state.audioContext;
    if (!ctx) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration / 1000);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(start); osc.stop(start + duration / 1000 + 0.02);
  }
  function playTapSound() { tone(520, 38, "triangle", 0.018); vibrate(10); }
  function playMainSound() { tone(420, 55, "triangle", 0.025); vibrate(10); }
  function playSuccessSound() { tone(660, 90, "sine", 0.035); tone(880, 120, "sine", 0.03, 0.08); vibrate(20); }
  function playErrorSound() { tone(160, 170, "sawtooth", 0.025); vibrate(40); }
  function playGameOverSound() { tone(260, 120, "triangle", 0.03); tone(180, 220, "triangle", 0.025, 0.13); }

  function getTimeLimitForLevel(level) { return Math.max(5, 11 - Math.ceil(level / 10)); }
  function challenge(text, answer) { return { text, answer }; }
  function oneDigitMultiplyPair(level) {
    const single = rand(2, 9);
    const other = level <= 15 ? rand(2, 10) : rand(10, Math.min(99, 20 + level * 2));
    return Math.random() < 0.5 ? [single, other] : [other, single];
  }
  function generateMathChallenge(level) {
    if (level <= 3) { const a = rand(1, 10), b = rand(1, 10); return challenge(`${a} + ${b}`, a + b); }
    if (level <= 6) { const op = pick(["+", "-"]); let a = rand(1, 20), b = rand(1, 20); if (op === "-" && b > a) [a, b] = [b, a]; return challenge(`${a} ${op} ${b}`, op === "+" ? a + b : a - b); }
    if (level <= 10) { const op = pick(["+", "-"]); let a = rand(10, 50), b = rand(10, 50); if (op === "-" && b > a) [a, b] = [b, a]; return challenge(`${a} ${op} ${b}`, op === "+" ? a + b : a - b); }
    if (level <= 20) { const op = level <= 15 ? "×" : pick(["+", "-", "×"]); let a = rand(10, 80), b = rand(2, 30); if (op === "×") [a, b] = oneDigitMultiplyPair(level); if (op === "-" && b > a) [a, b] = [b, a]; return challenge(`${a} ${op} ${b}`, op === "+" ? a + b : op === "-" ? a - b : a * b); }
    if (level <= 30) { const answer = rand(2, 15), divisor = rand(2, 12); return challenge(`${answer * divisor} / ${divisor}`, answer); }
    const ops = ["+", "-", "×"]; const op1 = pick(ops), op2 = pick(ops); let a = rand(8, 120), b = rand(2, 30), c = rand(2, 30);
    if (level <= 50) {
      if (op1 === "×" && op2 === "×") { b = rand(2, 9); a = rand(10, 99); c = rand(10, 99); }
      else if (op1 === "×") [a, b] = oneDigitMultiplyPair(level);
      else if (op2 === "×") [b, c] = oneDigitMultiplyPair(level);
    }
    let answer = op1 === "×" ? a * b : op1 === "+" ? a + b : a - b;
    answer = op2 === "×" ? answer * c : op2 === "+" ? answer + c : answer - c;
    if (answer < 0) return generateMathChallenge(20);
    return challenge(`${a} ${op1} ${b} ${op2} ${c}`, answer);
  }
  function levelBadge(level) { if (level <= 10) return "Riscaldamento"; if (level <= 20) return "Allenamento"; if (level <= 30) return "Esperto"; if (level <= 50) return "Campione"; return "Leggenda"; }

  function render() {
    $("levelValue").textContent = state.level; $("completedValue").textContent = state.levelsCompleted; $("totalTimeValue").textContent = formatSeconds(state.totalTimeMs);
    $("challengeText").textContent = state.currentChallenge?.text || "—"; $("remainingValue").textContent = state.remainingSeconds;
    $("answerDisplay").textContent = state.answerInput || "0"; $("levelBadge").textContent = levelBadge(state.level);
    $("mathTimer").classList.toggle("is-low", state.remainingSeconds <= 3 && !state.isGameOver);
    $("comboBadge").textContent = state.streak > 1 ? `Combo x${state.streak}` : "";
  }
  function startLevel() { clearInterval(state.timerId); state.currentChallenge = generateMathChallenge(state.level); state.answerInput = ""; state.remainingSeconds = getTimeLimitForLevel(state.level); state.lowTimeBeepedAt = null; state.levelStartTime = Date.now(); state.isGameOver = false; render(); state.timerId = setInterval(tick, 250); }
  function tick() { const limit = getTimeLimitForLevel(state.level) * 1000; const elapsed = Date.now() - state.levelStartTime; state.remainingSeconds = Math.max(0, Math.ceil((limit - elapsed) / 1000)); if (state.remainingSeconds <= 3 && state.remainingSeconds > 0 && state.lowTimeBeepedAt !== state.remainingSeconds) { state.lowTimeBeepedAt = state.remainingSeconds; tone(740, 35, "sine", 0.012); } render(); if (elapsed >= limit) endGame(); }
  function flash(kind, msg) { const zone = $("answerZone"); $("answerFeedback").textContent = msg; zone.classList.remove("correct", "wrong"); void zone.offsetWidth; zone.classList.add(kind); }
  function confetti() { const card = document.querySelector(".mathPhoneCard"); for (let i = 0; i < 10; i += 1) { const p = document.createElement("i"); p.className = "confettiBit"; p.style.left = `${rand(20, 80)}%`; p.style.setProperty("--x", `${rand(-50, 50)}px`); p.style.background = pick(["#2ecc71", "#ffd166", "#2c7be5", "#ffffff"]); card.appendChild(p); setTimeout(() => p.remove(), 650); } }
  function confirmAnswer() { playMainSound(); if (state.isGameOver || !state.currentChallenge || !state.answerInput) return; if (Number(state.answerInput) === state.currentChallenge.answer) { playSuccessSound(); state.totalTimeMs += Date.now() - state.levelStartTime; state.levelsCompleted += 1; state.level += 1; state.streak += 1; flash("correct", `${i18n.correct || "Correct!"} +1 livello`); confetti(); setTimeout(startLevel, 420); } else { playErrorSound(); state.answerInput = ""; state.streak = 0; flash("wrong", i18n.wrong || "Try again"); render(); } }
  function renderGameOverStats() { $("overReached").textContent = state.level; $("overCompleted").textContent = state.levelsCompleted; $("overTime").textContent = formatSeconds(state.totalTimeMs); }
  function openModal(id) { const modal = $(id); modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("mathModalOpen"); }
  function closeModal(id) { const modal = $(id); modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); if (!document.querySelector(".math-game-modal-overlay.is-open")) document.body.classList.remove("mathModalOpen"); }
  function openGameOverModal() { renderGameOverStats(); $("scoreMessage").textContent = ""; $("playerName").value = ""; $("confirmScoreBtn").disabled = false; openModal("gameOverModal"); setTimeout(() => $("playerName").focus(), 60); }
  function endGame() { if (state.isGameOver) return; clearInterval(state.timerId); state.isGameOver = true; state.streak = 0; state.scoreSaved = false; playGameOverSound(); openGameOverModal(); render(); }
  function resetGame() { closeModal("gameOverModal"); Object.assign(state, { level: 1, levelsCompleted: 0, streak: 0, answerInput: "", totalTimeMs: 0, isGameOver: false, scoreSaved: false }); $("answerFeedback").textContent = ""; startLevel(); }
  function showToast(msg) { const toast = $("mathToast"); toast.textContent = msg; toast.classList.add("is-visible"); clearTimeout(state.toastId); state.toastId = setTimeout(() => toast.classList.remove("is-visible"), 2200); }
  async function loadLeaderboard(rows) { if (!rows) { const res = await fetch("/math-game/leaderboard"); rows = (await res.json()).leaderboard || []; } const list = $("leaderboardList"); if (!rows.length) { list.innerHTML = `<div class="leaderboardEmpty">${i18n.noScores || "No scores yet"}</div>`; return; } list.innerHTML = rows.slice(0, 20).map((r, idx) => `<div class="leaderboardRow rank-${idx + 1}"><b>#${idx + 1}</b><span>${escapeHtml(r.playerName)}</span><small>${r.levelsCompleted} ${i18n.levels || "levels"}</small><small>${formatSeconds(r.totalTimeMs)}</small><time>${new Date(r.createdAt).toLocaleDateString()}</time></div>`).join(""); }
  async function saveScore() { playMainSound(); const playerName = $("playerName").value.trim(); if (!/^[\p{L}\p{N} _-]{1,30}$/u.test(playerName)) { $("scoreMessage").textContent = i18n.invalidName; playErrorSound(); return; } const res = await fetch("/math-game/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerName, levelsCompleted: state.levelsCompleted, reachedLevel: state.level, totalTimeMs: Math.max(1, Math.round(state.totalTimeMs)) }) }); const data = await res.json(); if (!res.ok) { $("scoreMessage").textContent = i18n.saveError; playErrorSound(); return; } state.scoreSaved = true; $("confirmScoreBtn").disabled = true; await loadLeaderboard(data.leaderboard); closeModal("gameOverModal"); showToast(i18n.scoreSaved || "Punteggio salvato in classifica"); Object.assign(state, { level: 1, levelsCompleted: 0, streak: 0, answerInput: "", totalTimeMs: 0, currentChallenge: null, isGameOver: false }); render(); }

  document.addEventListener("pointerdown", initAudio, { once: true });
  document.querySelectorAll("[data-number]").forEach((btn) => btn.addEventListener("click", () => { playTapSound(); if (!state.isGameOver && state.currentChallenge && state.answerInput.length < 6) { state.answerInput += btn.dataset.number; render(); } }));
  $("clearBtn").addEventListener("click", () => { playMainSound(); if (state.isGameOver) return; state.answerInput = ""; render(); });
  $("confirmBtn").addEventListener("click", confirmAnswer);
  $("startGameBtn").addEventListener("click", resetGame);
  $("playAgainBtn").addEventListener("click", resetGame);
  $("confirmScoreBtn").addEventListener("click", saveScore);
  $("playerName").addEventListener("keydown", (e) => { if (e.key === "Enter") saveScore(); });
  $("leaderboardBtn").addEventListener("click", () => { playMainSound(); openModal("leaderboardModal"); loadLeaderboard().catch(() => { $("leaderboardList").innerHTML = `<div class="leaderboardEmpty">${i18n.saveError || "Unavailable"}</div>`; }); });
  $("closeLeaderboardBtn").addEventListener("click", () => { playMainSound(); closeModal("leaderboardModal"); });
  $("leaderboardModal").addEventListener("click", (e) => { if (e.target.id === "leaderboardModal") closeModal("leaderboardModal"); });
  $("audioToggleBtn").addEventListener("click", () => { state.audioEnabled = !state.audioEnabled; setAudioPreference(state.audioEnabled); $("audioToggleBtn").textContent = state.audioEnabled ? "🔊" : "🔇"; if (state.audioEnabled) playMainSound(); });
  window.addEventListener("resize", syncViewportHeight);
  window.addEventListener("orientationchange", syncViewportHeight);
  $("audioToggleBtn").textContent = state.audioEnabled ? "🔊" : "🔇";
  syncViewportHeight(); render(); loadLeaderboard().catch(() => { $("leaderboardList").innerHTML = `<div class="leaderboardEmpty">${i18n.saveError || "Unavailable"}</div>`; });
})();
