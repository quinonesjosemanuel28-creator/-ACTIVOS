(function () {
  'use strict';

  const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toastText');
  let toastTimer = null;

  function showToast(msg, isError) {
    if (!toast || !toastText) return;
    toastText.textContent = msg;
    toast.classList.add('show');
    toast.style.boxShadow = isError
      ? '0 30px 60px -20px rgba(0,0,0,.8), 0 0 0 1px rgba(184,138,58,.5)'
      : '';
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 4200);
  }

  function isValidEmail(v) {
    return typeof v === 'string' && EMAIL_RE.test(v.trim());
  }

  /* FORMS ----------------------------------------------------------- */
  const formMessages = {
    'apply-hero': 'Aplicación recibida. Te contactamos en 48h.',
    'apply-final': 'Aplicación recibida. Te contactamos en 48h.',
    'lead-magnet': 'Listo. El diagnóstico llega a tu correo en menos de un minuto.'
  };

  document.querySelectorAll('form[data-form]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const key = form.getAttribute('data-form');
      const input = form.querySelector('input[type="email"]');
      if (!input) return;
      const value = input.value.trim();
      if (!isValidEmail(value)) {
        input.focus();
        showToast('Correo no válido. Revisalo, por favor.', true);
        return;
      }
      input.value = '';
      input.blur();
      showToast(formMessages[key] || 'Recibido. Te contactamos pronto.', false);
    });
  });

  /* BUTTON HANDLERS ------------------------------------------------- */
  const buttonMessages = {
    'apply-nav': 'Abrí la sección de aplicación abajo. Te esperamos.',
    'apply-gestor': 'Recibimos tu interés en De Cero a Gestor. Un asesor te contacta esta semana.',
    'apply-empresario': 'Recibimos tu interés en Prestamista Empresario. Un asesor te llamará.'
  };

  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const action = btn.getAttribute('data-action');
      if (action === 'apply-nav') {
        e.preventDefault();
        const target = document.getElementById('contacto');
        if (target) {
          const top = target.getBoundingClientRect().top + window.scrollY - 88;
          window.scrollTo({ top: top, behavior: 'smooth' });
        }
        showToast(buttonMessages[action], false);
        return;
      }
      if (buttonMessages[action]) {
        e.preventDefault();
        showToast(buttonMessages[action], false);
      }
    });
  });
})();
