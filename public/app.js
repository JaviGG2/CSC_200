(() => {
  const abrirDialogo = (dialogo, selectorFoco) => {
    if (!dialogo || dialogo.open) return;

    if (typeof dialogo.showModal === 'function') {
      dialogo.showModal();
    } else {
      dialogo.setAttribute('open', '');
    }

    const elementoFoco = selectorFoco ? dialogo.querySelector(selectorFoco) : null;
    if (elementoFoco) elementoFoco.focus();
  };

  const configurarTipoCampo = (tipo, bloqueOpciones, campoOpciones) => {
    if (!tipo || !bloqueOpciones || !campoOpciones) return;

    const actualizar = () => {
      const esLista = tipo.value === 'select';
      bloqueOpciones.hidden = !esLista;
      campoOpciones.required = esLista;
    };

    tipo.addEventListener('change', actualizar);
    actualizar();
  };

  const dialogoCampo = document.getElementById('dialogo-campo');

  document.querySelectorAll('[data-abrir-dialogo]').forEach((boton) => {
    boton.addEventListener('click', () =>
      abrirDialogo(dialogoCampo, '#etiqueta-campo')
    );
  });

  if (dialogoCampo) {
    configurarTipoCampo(
      document.getElementById('tipo-campo'),
      document.getElementById('bloque-opciones'),
      document.getElementById('opciones-campo')
    );

    if (dialogoCampo.dataset.abrir === 'true') {
      abrirDialogo(dialogoCampo, '#etiqueta-campo');
    }
  }

  configurarTipoCampo(
    document.getElementById('nuevo-tipo'),
    document.getElementById('nuevo-bloque-opciones'),
    document.getElementById('nuevo-opciones')
  );

  const dialogoEditar = document.getElementById('dialogo-editar');
  const formEditar = document.getElementById('form-editar-campo');
  const etiquetaEditar = document.getElementById('editar-etiqueta');
  const tipoEditar = document.getElementById('editar-tipo');
  const bloqueEditar = document.getElementById('editar-bloque-opciones');
  const opcionesEditar = document.getElementById('editar-opciones');
  const requeridoEditar = document.getElementById('editar-requerido');

  if (dialogoEditar) {
    configurarTipoCampo(tipoEditar, bloqueEditar, opcionesEditar);

    document.querySelectorAll('[data-editar-campo]').forEach((boton) => {
      boton.addEventListener('click', () => {
        if (
          !formEditar ||
          !etiquetaEditar ||
          !tipoEditar ||
          !opcionesEditar ||
          !requeridoEditar
        ) {
          return;
        }

        formEditar.action = `/campos/${boton.dataset.id}/editar`;
        etiquetaEditar.value = boton.dataset.etiqueta || '';
        tipoEditar.value = boton.dataset.tipo || 'text';

        let listaOpciones = [];
        try {
          listaOpciones = JSON.parse(boton.dataset.opciones || '[]');
        } catch {
          listaOpciones = [];
        }

        opcionesEditar.value = Array.isArray(listaOpciones)
          ? listaOpciones.join('\n')
          : '';
        requeridoEditar.checked = boton.dataset.requerido === '1';
        tipoEditar.dispatchEvent(new Event('change'));

        abrirDialogo(dialogoEditar, '#editar-etiqueta');
      });
    });

    if (dialogoEditar.dataset.abrir === 'true') {
      abrirDialogo(dialogoEditar, '#editar-etiqueta');
    }
  }

  const dialogoPassword = document.getElementById('dialogo-password');
  const formPassword = document.getElementById('form-password');
  const clavePassword = document.getElementById('clave-admin');
  const tituloPassword = document.querySelector('[data-password-titulo]');
  const mensajePassword = document.querySelector('[data-password-mensaje]');
  const submitPassword = document.querySelector('[data-password-submit]');

  if (dialogoPassword && formPassword) {
    document.querySelectorAll('[data-abrir-password]').forEach((boton) => {
      boton.addEventListener('click', () => {
        formPassword.action = boton.dataset.accion || '';

        if (tituloPassword) {
          tituloPassword.textContent = boton.dataset.titulo || 'Confirmar acción';
        }

        if (mensajePassword) {
          mensajePassword.textContent = boton.dataset.mensaje || '';
        }

        if (submitPassword) {
          submitPassword.textContent = boton.dataset.textoBoton || 'Confirmar';
        }

        if (clavePassword) clavePassword.value = '';

        abrirDialogo(dialogoPassword, '#clave-admin');
      });
    });
  }

  const dialogoSector = document.getElementById('dialogo-editar-sector');
  const formSector = document.getElementById('form-editar-sector');
  const nombreSector = document.getElementById('editar-sector-nombre');
  const ordenSector = document.getElementById('editar-sector-orden');

  if (dialogoSector) {
    document.querySelectorAll('[data-editar-sector]').forEach((boton) => {
      boton.addEventListener('click', () => {
        if (!formSector || !nombreSector || !ordenSector) return;

        formSector.action = `/sectores/${boton.dataset.id}/editar`;
        nombreSector.value = boton.dataset.nombre || '';
        ordenSector.value = boton.dataset.orden || '';

        abrirDialogo(dialogoSector, '#editar-sector-nombre');
      });
    });

    if (dialogoSector.dataset.abrir === 'true') {
      abrirDialogo(dialogoSector, '#editar-sector-nombre');
    }
  }

  const panelesSector = () =>
    Array.from(document.querySelectorAll('[data-sector-panel]'));

  document.querySelectorAll('[data-imprimir-sector]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const objetivo = document.getElementById(boton.dataset.imprimirSector);
      if (!objetivo) return;

      document.body.classList.add('imprimiendo-sector');
      panelesSector().forEach((panel) => {
        panel.classList.toggle('panel--imprimir', panel === objetivo);
      });
      window.print();
    });
  });

  const finalizarImpresion = () => {
    document.body.classList.remove('imprimiendo-sector');
    panelesSector().forEach((panel) => panel.classList.remove('panel--imprimir'));
  };

  window.addEventListener('afterprint', finalizarImpresion);

  document.querySelectorAll('dialog').forEach((dialogo) => {
    dialogo.addEventListener('click', (evento) => {
      if (evento.target === dialogo) dialogo.close();
    });
  });

  document.querySelectorAll('[data-cerrar-dialogo]').forEach((boton) => {
    boton.addEventListener('click', () => {
      const dialogo = boton.closest('dialog');
      if (dialogo) dialogo.close();
    });
  });

  document.querySelectorAll('form[data-confirmar]').forEach((formulario) => {
    formulario.addEventListener('submit', (evento) => {
      if (window.confirm(formulario.dataset.confirmar)) return;

      evento.preventDefault();
      evento.stopImmediatePropagation();
    });
  });

  document
    .querySelectorAll('form[data-form-registro], form[data-bloquear]')
    .forEach((formulario) => {
      formulario.addEventListener('submit', () => {
        const boton = formulario.querySelector('button[type="submit"]');
        if (!boton) return;

        boton.disabled = true;
        boton.textContent = 'Guardando...';
      });
    });
})();
