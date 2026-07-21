(() => {
  "use strict";
  const launch = document.querySelector("[data-word-game-launch]");
  if (!launch) return;

  const originalLabel = launch.textContent.trim();
  let navigating = false;

  function resetLaunch() {
    navigating = false;
    launch.classList.remove("isLoading");
    launch.removeAttribute("aria-disabled");
    launch.textContent = originalLabel;
  }

  launch.addEventListener("click", (event) => {
    if (navigating) {
      event.preventDefault();
      return;
    }
    navigating = true;
    launch.classList.add("isLoading");
    launch.setAttribute("aria-disabled", "true");
    launch.innerHTML = `<span class="launchSpinner" aria-hidden="true"></span><span>${launch.dataset.loadingLabel || "Caricamento..."}</span>`;
  });

  window.addEventListener("pageshow", resetLaunch);
})();
