document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('[data-toggle-notes]');
  const notesBox = document.querySelector('.s6-data-notes');
  if (!button || !notesBox) return;

  button.addEventListener('click', () => {
    const collapsed = notesBox.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
  });
});
