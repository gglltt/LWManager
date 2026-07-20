(() => {
  const $ = (id) => document.getElementById(id);
  const i18n = JSON.parse($("mathGameTranslations")?.textContent || "{}");
  const getAudioPreference = () => { try { return localStorage.getItem("mathGameAudio") !== "off"; } catch (_) { return true; } };
  const setAudioPreference = (enabled) => { try { localStorage.setItem("mathGameAudio", enabled ? "on" : "off"); } catch (_) {} };
  const BASE_TIME_SECONDS = 10;
  const state = { level: 1, levelsCompleted: 0, streak: 0, currentChallenge: null, answerInput: "", levelStartTime: 0, totalTimeMs: 0, remainingSeconds: BASE_TIME_SECONDS, currentTimeLimit: BASE_TIME_SECONDS, isGameOver: false, timerId: null, scoreSaved: false, audioReady: false, audioEnabled: getAudioPreference(), audioContext: null, lowTimeBeepedAt: null, toastId: null };
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

  function getComboBonus() { return state.streak >= 2 ? state.streak : 0; }
  function getTimeLimitForLevel(level) { return BASE_TIME_SECONDS + getComboBonus(); }
  function challenge(expression, answer, difficultyLabel) { return { expression, text: expression, answer, difficultyLabel }; }
  function randomInt(min, max) { return rand(min, max); }

  function generateAddition(min, max, difficultyLabel) {
    const a = randomInt(min, max);
    const b = randomInt(min, max);
    return challenge(`${a} + ${b}`, a + b, difficultyLabel);
  }

  function generateSubtraction(min, max, difficultyLabel) {
    let a = randomInt(min, max);
    let b = randomInt(min, max);
    if (b > a) [a, b] = [b, a];
    if (a === b) {
      if (a < max) a += 1;
      else b -= 1;
    }
    return challenge(`${a} - ${b}`, a - b, difficultyLabel);
  }

  function generateSingleStepAddSub(min, max, difficultyLabel) {
    return pick([
      () => generateAddition(min, max, difficultyLabel),
      () => generateSubtraction(min, max, difficultyLabel)
    ])();
  }

  function oneDigitMultiplyPair(otherMin, otherMax) {
    const single = randomInt(2, 9);
    const other = randomInt(otherMin, otherMax);
    return Math.random() < 0.5 ? [single, other] : [other, single];
  }

  function generateMultiplication(level, difficultyLabel) {
    let a;
    let b;
    if (level <= 25) {
      a = randomInt(2, 9);
      b = randomInt(2, 10);
    } else if (level <= 30) {
      [a, b] = oneDigitMultiplyPair(11, 24);
    } else if (level <= 40) {
      [a, b] = oneDigitMultiplyPair(2, 12);
    } else if (level <= 50) {
      [a, b] = oneDigitMultiplyPair(12, 30);
    } else if (level <= 80) {
      [a, b] = oneDigitMultiplyPair(8, 18);
    } else {
      a = randomInt(6, 16);
      b = randomInt(8, 24);
    }
    return challenge(`${a} × ${b}`, a * b, difficultyLabel);
  }

  function generateDivision(level, difficultyLabel) {
    const resultMax = level <= 35 ? 12 : level <= 40 ? 15 : level <= 50 ? 18 : level <= 80 ? 24 : 36;
    const divisorMax = level <= 50 ? 12 : level <= 80 ? 16 : 24;
    const result = randomInt(2, resultMax);
    const divisor = randomInt(2, divisorMax);
    const dividend = result * divisor;
    return challenge(`${dividend} ÷ ${divisor}`, result, difficultyLabel);
  }

  function generateSingleStepMixed(level, difficultyLabel) {
    const generators = level <= 40
      ? [
          () => generateAddition(10, 30, difficultyLabel),
          () => generateSubtraction(10, 30, difficultyLabel),
          () => generateMultiplication(level, difficultyLabel),
          () => generateDivision(level, difficultyLabel)
        ]
      : [
          () => generateAddition(35, 90, difficultyLabel),
          () => generateSubtraction(35, 140, difficultyLabel),
          () => generateMultiplication(level, difficultyLabel),
          () => generateDivision(level, difficultyLabel)
        ];
    return pick(generators)();
  }

  function positiveTwoStep(forms) {
    const options = forms.map((fn) => fn()).filter((item) => item.answer >= 0);
    return pick(options.length ? options : forms.map((fn) => fn()));
  }

  function generateTwoStepChallenge(level, difficultyLabel) {
    if (level <= 60) {
      return positiveTwoStep([
        () => { const a = randomInt(8, 24), b = randomInt(4, 18), c = randomInt(2, 6); return challenge(`(${a} + ${b}) × ${c}`, (a + b) * c, difficultyLabel); },
        () => { const a = randomInt(18, 45), b = randomInt(4, Math.min(24, a - 1)), c = randomInt(2, 6); return challenge(`(${a} - ${b}) × ${c}`, (a - b) * c, difficultyLabel); },
        () => { const a = randomInt(15, 60), b = randomInt(2, 9), c = randomInt(2, 9); return challenge(`${a} + (${b} × ${c})`, a + (b * c), difficultyLabel); },
        () => { const b = randomInt(2, 9), c = randomInt(2, 9), product = b * c, a = randomInt(product + 5, product + 70); return challenge(`${a} - (${b} × ${c})`, a - product, difficultyLabel); }
      ]);
    }

    if (level <= 80) {
      return positiveTwoStep([
        () => { const a = randomInt(25, 70), b = randomInt(10, 35), c = randomInt(8, 30); return challenge(`(${a} + ${b}) - ${c}`, (a + b) - c, difficultyLabel); },
        () => { const a = randomInt(6, 9), b = randomInt(8, 14), c = randomInt(15, 45); return challenge(`(${a} × ${b}) + ${c}`, (a * b) + c, difficultyLabel); },
        () => { const b = randomInt(6, 12), c = randomInt(6, 12), product = b * c, a = randomInt(product + 20, product + 120); return challenge(`${a} - (${b} × ${c})`, a - product, difficultyLabel); },
        () => { const result = randomInt(6, 18), divisor = randomInt(2, 12), a = result * divisor, b = randomInt(12, 45); return challenge(`(${a} ÷ ${divisor}) + ${b}`, result + b, difficultyLabel); }
      ]);
    }

    return positiveTwoStep([
      () => { const a = randomInt(60, 180), b = randomInt(25, 90), c = randomInt(20, 100); return challenge(`(${a} + ${b}) - ${c}`, (a + b) - c, difficultyLabel); },
      () => { const a = randomInt(8, 18), b = randomInt(12, 28), c = randomInt(30, 120); return challenge(`(${a} × ${b}) + ${c}`, (a * b) + c, difficultyLabel); },
      () => { const b = randomInt(8, 18), c = randomInt(10, 24), product = b * c, a = randomInt(product + 30, product + 180); return challenge(`${a} - (${b} × ${c})`, a - product, difficultyLabel); },
      () => { const result = randomInt(10, 36), divisor = randomInt(3, 24), a = result * divisor, b = randomInt(25, 100); return challenge(`(${a} ÷ ${divisor}) + ${b}`, result + b, difficultyLabel); }
    ]);
  }

  function generateMathChallenge(level) {
    if (level <= 5) return generateAddition(1, 10, "Somme semplici");
    if (level <= 10) return generateAddition(5, 20, "Somme medie");
    if (level <= 15) return generateSubtraction(1, 20, "Sottrazioni semplici");
    if (level <= 20) return generateSingleStepAddSub(10, 30, "Somma o sottrazione");
    if (level <= 25) return generateMultiplication(level, "Moltiplicazioni semplici");
    if (level <= 30) return generateMultiplication(level, "Moltiplicazioni medie");
    if (level <= 35) return generateDivision(level, "Divisioni intere");
    if (level <= 40) return generateSingleStepMixed(level, "Operazioni miste");
    if (level <= 50) return generateSingleStepMixed(level, "Operazioni grandi");
    if (level <= 60) return generateTwoStepChallenge(level, "Due passaggi guidati");
    if (level <= 80) return generateTwoStepChallenge(level, "Due passaggi misti");
    return generateTwoStepChallenge(level, "Avanzato leggibile");
  }

  function evaluateDisplayedExpression(expression) {
    const tokens = expression.match(/\d+|[()+\-×÷]/g) || [];
    let index = 0;
    const parseFactor = () => {
      const token = tokens[index];
      if (token === "(") {
        index += 1;
        const value = parseExpression();
        index += 1;
        return value;
      }
      index += 1;
      return Number(token);
    };
    const parseTerm = () => {
      let value = parseFactor();
      while (tokens[index] === "×" || tokens[index] === "÷") {
        const op = tokens[index];
        index += 1;
        const next = parseFactor();
        value = op === "×" ? value * next : value / next;
      }
      return value;
    };
    const parseExpression = () => {
      let value = parseTerm();
      while (tokens[index] === "+" || tokens[index] === "-") {
        const op = tokens[index];
        index += 1;
        const next = parseTerm();
        value = op === "+" ? value + next : value - next;
      }
      return value;
    };
    return parseExpression();
  }

  function runMathChallengeSelfTest(iterations = 100) {
    const bands = [3, 8, 13, 18, 23, 28, 33, 38, 46, 56, 70, 85];
    const errors = [];
    bands.forEach((level) => {
      for (let i = 0; i < iterations; i += 1) {
        const item = generateMathChallenge(level);
        if (/[*/]/.test(item.expression)) errors.push(`Operator symbol at level ${level}: ${item.expression}`);
        if ((item.expression.includes("×") || item.expression.includes("÷")) && /[*\/]/.test(item.expression)) errors.push(`Unreadable operator at level ${level}: ${item.expression}`);
        const ops = (item.expression.match(/[+\-×÷]/g) || []).length;
        if (level < 51 && ops > 1) errors.push(`Two operators before level 51: ${item.expression}`);
        if (ops > 1 && !/[()]/.test(item.expression)) errors.push(`Missing parentheses: ${item.expression}`);
        if (level <= 50 && item.expression.includes("×")) {
          const factors = item.expression.match(/(\d+) × (\d+)/);
          if (factors && Number(factors[1]) > 9 && Number(factors[2]) > 9) errors.push(`Hard multiplication before level 51: ${item.expression}`);
        }
        if (item.expression.includes("÷")) {
          const division = item.expression.match(/(\d+) ÷ (\d+)/);
          if (division && Number(division[1]) % Number(division[2]) !== 0) errors.push(`Non-integer division: ${item.expression}`);
        }
        const computed = evaluateDisplayedExpression(item.expression);
        if (computed !== item.answer) errors.push(`Wrong answer ${item.expression} = ${item.answer}, computed ${computed}`);
      }
    });
    return { passed: errors.length === 0, errors };
  }
  function levelBadge(level) { if (level <= 10) return "Riscaldamento"; if (level <= 20) return "Allenamento"; if (level <= 30) return "Esperto"; if (level <= 50) return "Campione"; return "Leggenda"; }

  function render() {
    $("levelValue").textContent = state.level; $("completedValue").textContent = state.levelsCompleted; $("totalTimeValue").textContent = formatSeconds(state.totalTimeMs);
    $("challengeText").textContent = state.currentChallenge?.text || "—"; $("remainingValue").textContent = state.remainingSeconds;
    $("answerDisplay").textContent = state.answerInput || "0"; $("levelBadge").textContent = levelBadge(state.level);
    $("mathTimer").classList.toggle("is-low", state.remainingSeconds <= 3 && !state.isGameOver);
    $("comboBadge").textContent = state.streak >= 2 ? `Combo x${state.streak} · Bonus +${getComboBonus()}s` : "";
  }
  function startLevel() { clearInterval(state.timerId); state.currentChallenge = generateMathChallenge(state.level); state.answerInput = ""; state.currentTimeLimit = getTimeLimitForLevel(state.level); state.remainingSeconds = state.currentTimeLimit; state.lowTimeBeepedAt = null; state.levelStartTime = Date.now(); state.isGameOver = false; render(); state.timerId = setInterval(tick, 250); }
  function tick() { const limit = state.currentTimeLimit * 1000; const elapsed = Date.now() - state.levelStartTime; state.remainingSeconds = Math.max(0, Math.ceil((limit - elapsed) / 1000)); if (state.remainingSeconds <= 3 && state.remainingSeconds > 0 && state.lowTimeBeepedAt !== state.remainingSeconds) { state.lowTimeBeepedAt = state.remainingSeconds; tone(740, 35, "sine", 0.012); } render(); if (elapsed >= limit) endGame(); }
  function flash(kind, msg) { const zone = $("answerZone"); $("answerFeedback").textContent = msg; zone.classList.remove("correct", "wrong"); void zone.offsetWidth; zone.classList.add(kind); }
  function confetti() { const card = document.querySelector(".mathPhoneCard"); for (let i = 0; i < 10; i += 1) { const p = document.createElement("i"); p.className = "confettiBit"; p.style.left = `${rand(20, 80)}%`; p.style.setProperty("--x", `${rand(-50, 50)}px`); p.style.background = pick(["#2ecc71", "#ffd166", "#2c7be5", "#ffffff"]); card.appendChild(p); setTimeout(() => p.remove(), 650); } }
  function confirmAnswer() { playMainSound(); if (state.isGameOver || !state.currentChallenge || !state.answerInput) return; if (Number(state.answerInput) === state.currentChallenge.answer) { playSuccessSound(); state.totalTimeMs += Date.now() - state.levelStartTime; state.levelsCompleted += 1; state.level += 1; state.streak += 1; flash("correct", `${i18n.correct || "Correct!"} +1 livello`); confetti(); setTimeout(startLevel, 420); } else { playErrorSound(); state.answerInput = ""; state.streak = 0; flash("wrong", i18n.wrong || "Try again"); render(); } }
  function renderGameOverStats() { $("overReached").textContent = state.level; $("overCompleted").textContent = state.levelsCompleted; $("overTime").textContent = formatSeconds(state.totalTimeMs); }
  function openModal(id) { const modal = $(id); modal.classList.add("is-open"); modal.setAttribute("aria-hidden", "false"); document.body.classList.add("mathModalOpen"); }
  function closeModal(id) { const modal = $(id); modal.classList.remove("is-open"); modal.setAttribute("aria-hidden", "true"); if (!document.querySelector(".math-game-modal-overlay.is-open")) document.body.classList.remove("mathModalOpen"); }
  function openGameOverModal() { renderGameOverStats(); $("scoreMessage").textContent = ""; $("playerName").value = ""; $("confirmScoreBtn").disabled = false; openModal("gameOverModal"); setTimeout(() => $("playerName").focus(), 60); }
  function endGame() { if (state.isGameOver) return; clearInterval(state.timerId); state.timerId = null; state.isGameOver = true; state.streak = 0; state.answerInput = ""; state.scoreSaved = false; playGameOverSound(); openGameOverModal(); render(); }
  function resetToStart() { clearInterval(state.timerId); state.timerId = null; Object.assign(state, { level: 1, levelsCompleted: 0, streak: 0, currentChallenge: null, answerInput: "", levelStartTime: 0, totalTimeMs: 0, remainingSeconds: BASE_TIME_SECONDS, currentTimeLimit: BASE_TIME_SECONDS, isGameOver: false, scoreSaved: false, lowTimeBeepedAt: null }); $("answerFeedback").textContent = ""; render(); }
  function startNewGame() { closeModal("gameOverModal"); resetToStart(); startLevel(); }
  function closeGameOverModal() { closeModal("gameOverModal"); resetToStart(); }
  function showToast(msg) { const toast = $("mathToast"); toast.textContent = msg; toast.classList.add("is-visible"); clearTimeout(state.toastId); state.toastId = setTimeout(() => toast.classList.remove("is-visible"), 2200); }
  async function loadLeaderboard(rows) { if (!rows) { const res = await fetch("/math-game/leaderboard"); rows = (await res.json()).leaderboard || []; } const list = $("leaderboardList"); const topRows = (rows || []).slice(0, 20); if (!topRows.length) { list.innerHTML = `<div class="leaderboardEmpty">${i18n.noScores || "No scores yet"}</div>`; return; } list.innerHTML = topRows.map((r, idx) => `<div class="leaderboardRow rank-${idx + 1}"><b>#${idx + 1}</b><span class="leaderboardName">${escapeHtml(r.playerName)}</span><small class="leaderboardLevels">${i18n.levels || "Levels"}: ${r.levelsCompleted}</small><small class="leaderboardTime">${i18n.time || "Time"}: ${formatSeconds(r.totalTimeMs)}</small><time>${r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""}</time></div>`).join(""); }
  async function saveScore() { playMainSound(); const playerName = $("playerName").value.trim(); if (!/^[\p{L}\p{N} _-]{1,30}$/u.test(playerName)) { $("scoreMessage").textContent = i18n.invalidName; playErrorSound(); return; } const res = await fetch("/math-game/score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerName, levelsCompleted: state.levelsCompleted, reachedLevel: state.level, totalTimeMs: Math.max(1, Math.round(state.totalTimeMs)) }) }); const data = await res.json(); if (!res.ok) { $("scoreMessage").textContent = i18n.saveError; playErrorSound(); return; } state.scoreSaved = true; $("confirmScoreBtn").disabled = true; await loadLeaderboard(data.leaderboard); closeModal("gameOverModal"); showToast("Risultato salvato"); resetToStart(); }

  window.__LWMathGame = { generateMathChallenge, runMathChallengeSelfTest };

  document.addEventListener("pointerdown", initAudio, { once: true });
  document.querySelectorAll("[data-number]").forEach((btn) => btn.addEventListener("click", () => { playTapSound(); if (!state.isGameOver && state.currentChallenge && state.answerInput.length < 6) { state.answerInput += btn.dataset.number; render(); } }));
  $("clearBtn").addEventListener("click", () => { playMainSound(); if (state.isGameOver) return; state.answerInput = ""; render(); });
  $("confirmBtn").addEventListener("click", confirmAnswer);
  $("startGameBtn").addEventListener("click", startNewGame);
  $("closeGameOverBtn").addEventListener("click", closeGameOverModal);
  $("confirmScoreBtn").addEventListener("click", saveScore);
  $("playerName").addEventListener("keydown", (e) => { if (e.key === "Enter") saveScore(); });
  $("leaderboardBtn").addEventListener("click", () => { playMainSound(); openModal("leaderboardModal"); loadLeaderboard().catch(() => { $("leaderboardList").innerHTML = `<div class="leaderboardEmpty">${i18n.saveError || "Unavailable"}</div>`; }); });
  $("closeLeaderboardBtn").addEventListener("click", () => { playMainSound(); closeModal("leaderboardModal"); });
  $("leaderboardModal").addEventListener("click", (e) => { if (e.target.id === "leaderboardModal") closeModal("leaderboardModal"); });
  $("mathHelpBtn").addEventListener("click", () => { playMainSound(); openModal("mathHelpModal"); });
  $("closeMathHelpBtn").addEventListener("click", () => { playMainSound(); closeModal("mathHelpModal"); });
  $("mathHelpModal").addEventListener("click", (e) => { if (e.target.id === "mathHelpModal") closeModal("mathHelpModal"); });
  $("audioToggleBtn").addEventListener("click", () => { state.audioEnabled = !state.audioEnabled; setAudioPreference(state.audioEnabled); $("audioToggleBtn").textContent = state.audioEnabled ? "🔊" : "🔇"; if (state.audioEnabled) playMainSound(); });
  window.addEventListener("resize", syncViewportHeight);
  window.addEventListener("orientationchange", syncViewportHeight);
  $("audioToggleBtn").textContent = state.audioEnabled ? "🔊" : "🔇";
  syncViewportHeight(); render(); loadLeaderboard().catch(() => { $("leaderboardList").innerHTML = `<div class="leaderboardEmpty">${i18n.saveError || "Unavailable"}</div>`; });
})();
