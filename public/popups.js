(() => {
  function normalizarTexto(valor) {
    return String(valor || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function prefiereMovimientoReducido() {
    return Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  function abrirDialogo(dialogo, selectorFoco) {
    if (!dialogo) return;
    dialogo.classList.remove('dialogo--cerrando');
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
    if (!dialogo.open) {
      dialogo.classList.remove('dialogo--cerrando');
      dialogo.removeAttribute('open');
      return;
    }

    if (prefiereMovimientoReducido() || typeof dialogo.close !== 'function') {
      dialogo.classList.remove('dialogo--cerrando');
      if (typeof dialogo.close === 'function') {
        dialogo.close();
      } else {
        dialogo.removeAttribute('open');
      }
      return;
    }

    if (dialogo.classList.contains('dialogo--cerrando')) return;
    dialogo.classList.add('dialogo--cerrando');

    let terminado = false;
    let timer = null;

    const finalizar = () => {
      if (terminado) return;
      terminado = true;
      if (timer) clearTimeout(timer);
      dialogo.removeEventListener('animationend', alTerminar);
      dialogo.classList.remove('dialogo--cerrando');
      if (dialogo.open && typeof dialogo.close === 'function') {
        dialogo.close();
      } else {
        dialogo.removeAttribute('open');
      }
    };

    const alTerminar = (ev) => {
      if (ev.target === dialogo) finalizar();
    };

    dialogo.addEventListener('animationend', alTerminar);
    timer = setTimeout(finalizar, 200);
  }

  // 1. Diálogos modales: apertura, cierre por backdrop o botón [data-cerrar-dialogo]
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

    const toggleClave = evento.target.closest('[data-toggle-clave]');
    if (toggleClave) {
      const targetId = toggleClave.getAttribute('data-toggle-clave');
      const input = targetId ? document.getElementById(targetId) : null;
      if (input) {
        const mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        toggleClave.textContent = mostrar ? 'Ocultar' : 'Mostrar';
        toggleClave.setAttribute('aria-pressed', mostrar ? 'true' : 'false');
        input.focus();
      }
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
          dialogo.querySelectorAll('input[data-filtrar-select]').forEach((filtro) => {
            filtro.value = '';
            filtro.dispatchEvent(new Event('input'));
          });
        }
        abrirDialogo(dialogo, foco);
      }
    }
  });

  document.addEventListener(
    'cancel',
    (evento) => {
      if (evento.target instanceof HTMLDialogElement) {
        evento.preventDefault();
        cerrarDialogo(evento.target);
      }
    },
    true
  );

  // Autoabrir diálogos marcados con data-abrir="true"
  document.querySelectorAll('dialog[data-abrir="true"]').forEach((dialogo) => {
    abrirDialogo(dialogo, dialogo.getAttribute('data-popup-foco') || 'input:not([type="hidden"]), select');
  });

  // 2. Interceptar formularios [data-confirmar] con popup institucional (#dialogo-confirmacion)
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

  // 3. Limpiar ?ok= y ?error= de la barra de direcciones y permitir cerrar alertas
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has('ok') || url.searchParams.has('error')) {
      url.searchParams.delete('ok');
      url.searchParams.delete('error');
      const nuevaRuta = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
      window.history.replaceState({}, '', nuevaRuta);
    }
  } catch {
    // Sin soporte URL
  }

  function cerrarAlertaSuave(alerta) {
    if (!alerta || !alerta.isConnected || alerta.classList.contains('alerta--saliendo')) return;
    if (prefiereMovimientoReducido()) {
      alerta.remove();
      return;
    }
    alerta.classList.add('alerta--saliendo');
    setTimeout(() => {
      if (alerta.isConnected) alerta.remove();
    }, 190);
  }

  document.querySelectorAll('main .alerta').forEach((alerta) => {
    if (alerta.querySelector('.alerta-cerrar')) return;
    alerta.classList.add('alerta--cerrable');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'alerta-cerrar';
    btn.setAttribute('aria-label', 'Cerrar aviso');
    btn.innerHTML = '<span class="material-symbols-rounded material-symbols-rounded--sm" aria-hidden="true">close</span>';
    btn.addEventListener('click', () => cerrarAlertaSuave(alerta));
    alerta.appendChild(btn);

    if (alerta.classList.contains('alerta--exito')) {
      let temporizador = setTimeout(() => cerrarAlertaSuave(alerta), 6000);
      alerta.addEventListener('mouseenter', () => clearTimeout(temporizador));
      alerta.addEventListener('mouseleave', () => {
        temporizador = setTimeout(() => cerrarAlertaSuave(alerta), 3500);
      });
    }
  });

  // 4. Protección contra doble envío + feedback visual en botones
  document.addEventListener('submit', (evento) => {
    const form = evento.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (evento.defaultPrevented) return;
    if ((form.method || 'get').toLowerCase() !== 'post') return;

    const btn = form.querySelector('button[type="submit"]:not([form])') || document.activeElement;
    if (btn && btn instanceof HTMLButtonElement && btn.type === 'submit' && !btn.disabled) {
      const textoCargando = btn.getAttribute('data-cargando-texto') || form.getAttribute('data-cargando-texto') || 'Procesando...';
      btn.dataset.textoOriginal = btn.textContent || '';
      btn.disabled = true;
      btn.textContent = textoCargando;
    }
  });

  // 5. Autoenvío en filtros select y cambios rápidos
  document.querySelectorAll('select[data-auto-filtrar]').forEach((select) => {
    select.addEventListener('change', () => {
      const form = select.closest('form');
      if (form) form.submit();
    });
  });

  // 6. Buscador instantáneo dentro de selects extensos (padrón compartido)
  document.querySelectorAll('input[data-filtrar-select]').forEach((input) => {
    const selectId = input.getAttribute('data-filtrar-select');
    const select = selectId ? document.getElementById(selectId) : null;
    if (!select) return;

    const opcionesOriginales = Array.from(select.options).map((opt) => ({
      option: opt,
      texto: normalizarTexto(opt.textContent),
      esPlaceholder: !opt.value,
    }));

    input.addEventListener('input', () => {
      const termino = normalizarTexto(input.value);
      let coincidencias = 0;

      opcionesOriginales.forEach((item) => {
        if (item.esPlaceholder) {
          item.option.hidden = false;
          return;
        }
        const visible = !termino || item.texto.includes(termino);
        item.option.hidden = !visible;
        if (visible) coincidencias += 1;
      });

      const info = input.parentElement?.querySelector('[data-select-conteo]');
      if (info) {
        info.textContent = termino ? `${coincidencias} coincidencia(s)` : '';
      }
    });
  });

  // 7. Filtro instantáneo en vivo sobre filas de tabla o tarjetas
  document.querySelectorAll('input[data-filtro-vivo]').forEach((input) => {
    const selectorContenedor = input.getAttribute('data-filtro-vivo');
    const contenedor = selectorContenedor ? document.querySelector(selectorContenedor) : null;
    if (!contenedor) return;

    const itemSelector = input.getAttribute('data-filtro-item') || 'tbody tr';
    const items = Array.from(contenedor.querySelectorAll(itemSelector));
    const contadorSelector = input.getAttribute('data-filtro-contador');
    const contadorEl = contadorSelector ? document.querySelector(contadorSelector) : null;
    const etiquetaContador = input.getAttribute('data-filtro-etiqueta') || 'registros';

    if (!items.length) return;

    const filtrar = () => {
      const termino = normalizarTexto(input.value);
      let visibles = 0;

      items.forEach((item) => {
        const texto = normalizarTexto(item.getAttribute('data-texto-busqueda') || item.textContent);
        const coincide = !termino || texto.includes(termino);
        item.hidden = !coincide;
        if (coincide) visibles += 1;
      });

      if (contadorEl) {
        contadorEl.textContent = `${visibles} ${etiquetaContador}`;
      }
    };

    input.addEventListener('input', filtrar);
  });

  // 8. Atajo de teclado "/" para ir rápido al buscador de la vista actual
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== '/' || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    const activo = document.activeElement;
    if (
      activo &&
      (activo.tagName === 'INPUT' ||
        activo.tagName === 'TEXTAREA' ||
        activo.tagName === 'SELECT' ||
        activo.closest('dialog[open]'))
    ) {
      return;
    }

    const buscador = document.querySelector('[data-atajo-buscar]') || document.querySelector('input[type="search"]');
    if (buscador instanceof HTMLInputElement) {
      evento.preventDefault();
      buscador.focus();
      buscador.select();
    }
  });

  // 9. Expandir / contraer todos los bloques <details> del censo
  const btnToggleDetalles = document.querySelector('[data-toggle-detalles]');
  if (btnToggleDetalles) {
    btnToggleDetalles.addEventListener('click', () => {
      const selector = btnToggleDetalles.getAttribute('data-toggle-detalles') || 'details.censo-detalle';
      const detalles = Array.from(document.querySelectorAll(selector));
      if (!detalles.length) return;
      const algunoCerrado = detalles.some((d) => !d.open);
      detalles.forEach((d) => {
        d.open = algunoCerrado;
      });
      btnToggleDetalles.textContent = algunoCerrado ? 'Contraer familias' : 'Expandir familias';
    });
  }

  function aplicarStaggerInicial() {
    const grupos = [
      '.portal-modulos-lista > .portal-modulo-card',
      '.portal-grid-modulos > .portal-hub-card',
      '.portal-db-resumen > .portal-db-dato',
      '.resumen-cards > .resumen-card',
      '.admin-cards > .admin-card',
      '.censo-lista > .censo-vivienda',
      '.tarjetas-grid > .tarjeta-vivienda',
      '#contenedor-ubicacion > .grupo-ubicacion',
    ];

    grupos.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el, idx) => {
        if (el.dataset.staggerListo) return;
        el.dataset.staggerListo = '1';
        el.style.setProperty('--stagger-index', String(Math.min(idx, 8)));
      });
    });

    document.querySelectorAll('.tabla-scroll table tbody').forEach((tbody) => {
      Array.from(tbody.querySelectorAll('tr')).slice(0, 8).forEach((fila, idx) => {
        if (fila.dataset.staggerListo) return;
        fila.dataset.staggerListo = '1';
        fila.setAttribute('data-stagger-fila', '');
        fila.style.setProperty('--stagger-index', String(idx));
      });
    });
  }

  aplicarStaggerInicial();

  window.ComunaPopups = {
    abrir: abrirDialogo,
    cerrar: cerrarDialogo,
  };
})();
