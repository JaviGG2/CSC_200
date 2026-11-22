(() => {
  function abrirDialogo(dialogo, selectorFoco) {
    if (!dialogo) return;
    if (!dialogo.open) {
      if (typeof dialogo.showModal === 'function') {
        dialogo.showModal();
      } else {
        dialogo.setAttribute('open', '');
      }
    }
    const foco = selectorFoco ? dialogo.querySelector(selectorFoco) : null;
    if (foco && typeof foco.focus === 'function') {
      foco.focus();
    }
  }

  function cerrarDialogo(dialogo) {
    if (!dialogo) return;
    if (typeof dialogo.close === 'function' && dialogo.open) {
      dialogo.close();
    } else {
      dialogo.removeAttribute('open');
    }
  }

  // Cerrar cualquier diálogo al hacer clic en su backdrop o botón [data-cerrar-dialogo]
  document.addEventListener('click', (evento) => {
    const btnCerrar = evento.target.closest('[data-cerrar-dialogo]');
    if (btnCerrar) {
      cerrarDialogo(btnCerrar.closest('dialog'));
      return;
    }

    if (evento.target instanceof HTMLDialogElement) {
      cerrarDialogo(evento.target);
      return;
    }

    const disparador = evento.target.closest('[data-abrir-popup]');
    if (disparador) {
      evento.preventDefault();
      const id = disparador.getAttribute('data-abrir-popup');
      const foco = disparador.getAttribute('data-popup-foco') || 'input:not([type="hidden"]), select, textarea';
      const dialogo = id ? document.getElementById(id) : null;
      if (dialogo) {
        if (disparador.hasAttribute('data-reset-form')) {
          const form = dialogo.querySelector('form');
          if (form) form.reset();
          const inputId = dialogo.querySelector('input[name="id"]');
          if (inputId) inputId.value = '';
          const titulo = dialogo.querySelector('[data-popup-titulo]');
          if (titulo && disparador.getAttribute('data-popup-titulo')) {
            titulo.textContent = disparador.getAttribute('data-popup-titulo');
          }
          const subtitulo = dialogo.querySelector('[data-popup-subtitulo]');
          if (subtitulo && disparador.getAttribute('data-popup-subtitulo')) {
            subtitulo.textContent = disparador.getAttribute('data-popup-subtitulo');
          }
          const btnGuardar = dialogo.querySelector('[data-popup-submit]');
          if (btnGuardar && disparador.getAttribute('data-popup-submit')) {
            btnGuardar.textContent = disparador.getAttribute('data-popup-submit');
          }
        }
        abrirDialogo(dialogo, foco);
      }
    }
  });

  // Autoabrir diálogos marcados con data-abrir="true"
  document.querySelectorAll('dialog[data-abrir="true"]').forEach((dialogo) => {
    abrirDialogo(dialogo, dialogo.getAttribute('data-popup-foco') || 'input:not([type="hidden"]), select');
  });

  // Interceptar formularios [data-confirmar] con popup institucional (#dialogo-confirmacion)
  const dialogoConfirm = document.getElementById('dialogo-confirmacion');
  const formConfirm = document.getElementById('form-confirmacion');
  const tituloConfirm = document.querySelector('[data-confirm-titulo]');
  const mensajeConfirm = document.querySelector('[data-confirm-mensaje]');
  const submitConfirm = document.querySelector('[data-confirm-submit]');

  if (dialogoConfirm && formConfirm) {
    document.addEventListener('submit', (evento) => {
      const form = evento.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form === formConfirm) return;

      const mensaje = form.getAttribute('data-confirmar');
      if (!mensaje) return;

      evento.preventDefault();
      evento.stopImmediatePropagation();

      formConfirm.action = form.getAttribute('action') || '';
      formConfirm.method = (form.getAttribute('method') || 'post').toLowerCase();

      if (tituloConfirm) {
        tituloConfirm.textContent = form.getAttribute('data-confirmar-titulo') || 'Confirmar eliminación';
      }
      if (mensajeConfirm) {
        mensajeConfirm.textContent = mensaje;
      }
      if (submitConfirm) {
        submitConfirm.textContent = form.getAttribute('data-confirmar-boton') || 'Eliminar';
      }

      abrirDialogo(dialogoConfirm, '[data-confirm-submit]');
    }, true);
  }

  window.ComunaPopups = {
    abrir: abrirDialogo,
    cerrar: cerrarDialogo,
  };
})();
