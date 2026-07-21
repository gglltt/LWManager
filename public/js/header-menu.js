(() => {
  "use strict";
  const menu = document.querySelector("[data-main-menu]");
  if (!menu) return;

  const toggle = menu.querySelector(".mainMenu__toggle");
  const dropdown = menu.querySelector(".mainMenu__dropdown");
  const languagePicker = document.querySelector(".langPicker");
  if (!toggle || !dropdown) return;

  function setOpen(open, restoreFocus = false) {
    dropdown.hidden = !open;
    menu.classList.toggle("isOpen", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open && languagePicker?.open) languagePicker.open = false;
    if (!open && restoreFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => setOpen(dropdown.hidden));
  dropdown.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("click", (event) => {
    if (!menu.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dropdown.hidden) setOpen(false, true);
  });
  languagePicker?.addEventListener("toggle", () => {
    if (languagePicker.open) setOpen(false);
  });
})();
