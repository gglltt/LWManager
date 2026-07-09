(() => {
  const STORAGE_KEY = "lwmanager_splash_seen";
  const SPLASH_DURATION_MS = 2500;
  const REDUCED_MOTION_DURATION_MS = 900;
  const FADE_OUT_MS = 450;

  const splash = document.getElementById("lwmanager-splash");
  if (!splash) return;

  const logo = splash.querySelector(".splash__logo");
  if (logo) {
    logo.addEventListener("error", () => logo.classList.add("has-error"), { once: true });
  }

  const safeSession = {
    get() {
      try { return window.sessionStorage.getItem(STORAGE_KEY); }
      catch (_) { return null; }
    },
    set() {
      try { window.sessionStorage.setItem(STORAGE_KEY, "1"); }
      catch (_) { /* sessionStorage can be unavailable; splash still closes. */ }
    }
  };

  const removeSplash = () => {
    if (splash.parentNode) splash.parentNode.removeChild(splash);
  };

  const closeSplash = () => {
    safeSession.set();
    splash.classList.add("is-hiding");
    window.setTimeout(removeSplash, FADE_OUT_MS + 80);
  };

  if (safeSession.get()) {
    removeSplash();
    return;
  }

  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  splash.hidden = false;

  window.setTimeout(closeSplash, reduceMotion ? REDUCED_MOTION_DURATION_MS : SPLASH_DURATION_MS);
})();
