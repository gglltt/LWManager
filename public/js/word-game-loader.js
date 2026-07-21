(() => {
  "use strict";
  const page = document.querySelector(".wordGamePage");
  const loader = document.getElementById("wordGameLoader");
  const spinner = loader?.querySelector(".wordGameLoader__spinner");
  const message = loader?.querySelector(".wordGameLoader__message");
  const error = loader?.querySelector(".wordGameLoader__error");
  const retry = document.getElementById("wordGameRetry");
  if (!page || !loader || !spinner || !message || !error || !retry) return;

  let settled = false;
  const watchdog = window.setTimeout(showError, 12000);

  function ready() {
    if (settled) return;
    settled = true;
    window.clearTimeout(watchdog);
    page.classList.remove("isLoading");
    page.classList.add("isReady");
    page.setAttribute("aria-busy", "false");
    loader.hidden = true;
  }

  function showError() {
    if (settled) return;
    settled = true;
    window.clearTimeout(watchdog);
    page.classList.add("hasLoadError");
    page.setAttribute("aria-busy", "false");
    spinner.hidden = true;
    message.hidden = true;
    error.hidden = false;
    retry.hidden = false;
  }

  retry.addEventListener("click", () => window.location.reload());
  window.addEventListener("error", (event) => {
    if (String(event.filename || "").includes("word-game.js")) showError();
  });
  window.addEventListener("unhandledrejection", showError);

  window.LWWordGameLoader = { ready, showError };
  if (page.dataset.initialError === "true") showError();
})();
