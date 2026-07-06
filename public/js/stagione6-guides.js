document.addEventListener('DOMContentLoaded', () => {
  const modal = document.querySelector('[data-s6-guide-modal]');
  const image = document.querySelector('[data-s6-guide-image]');
  const title = document.querySelector('[data-s6-guide-title]');
  const openButtons = Array.from(document.querySelectorAll('[data-s6-guide-open]'));
  const closeButtons = Array.from(document.querySelectorAll('[data-s6-guide-close]'));
  let lastFocusedElement = null;

  if (!modal || !image || !title || openButtons.length === 0) return;

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove('seasonGuideModalOpen');
    image.removeAttribute('src');
    image.removeAttribute('alt');
    if (lastFocusedElement) lastFocusedElement.focus();
  };

  const openModal = (button) => {
    lastFocusedElement = document.activeElement;
    title.textContent = button.dataset.guideTitle || '';
    image.src = button.dataset.guideSrc || '';
    image.alt = button.dataset.guideAlt || '';
    modal.hidden = false;
    document.body.classList.add('seasonGuideModalOpen');
    const closeButton = modal.querySelector('.seasonGuideModal__close');
    if (closeButton) closeButton.focus();
  };

  openButtons.forEach((button) => {
    button.addEventListener('click', () => openModal(button));
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (event) => {
    if (!modal.hidden && event.key === 'Escape') closeModal();
  });
});
