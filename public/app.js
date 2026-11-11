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

  // "Sin cédula" se muestra como texto: no todas las personas tienen cédula.
  const textoCedula = (tipo, numero) =>
    (tipo === 'V' || tipo === 'E') && numero ? `${tipo}-${numero}` : 'Sin cédula';

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

  const notificar = (mensaje, tipo = 'error') => {
    const existente = document.getElementById('notificacion-flash');
    if (existente) existente.remove();

    const notif = document.createElement('div');
    notif.id = 'notificacion-flash';
    notif.className = `alerta alerta--${tipo === 'error' ? 'error' : 'exito'}`;
    notif.setAttribute('role', 'status');
    notif.textContent = mensaje;
    notif.style.position = 'fixed';
    notif.style.top = '16px';
    notif.style.left = '50%';
    notif.style.transform = 'translateX(-50%)';
    notif.style.zIndex = '1000';
    notif.style.maxWidth = '460px';
    notif.style.boxShadow = 'var(--shadow-lg)';
    notif.style.padding = '12px 16px';
    notif.style.borderRadius = 'var(--radius-sm)';
    notif.style.fontWeight = '600';
    notif.style.fontSize = '13px';

    document.body.insertBefore(notif, document.body.firstChild);

    setTimeout(() => {
      notif.style.opacity = '0';
      notif.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notif.remove(), 300);
    }, 4000);
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
    // Delegado para que también funcione con botones creados después (tarjetas).
    document.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-abrir-password]');
      if (!boton) return;

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
  }

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

  // ============================================================================
  // DASHBOARD: TARJETAS DE VIVIENDAS
  // ============================================================================

  const gridViviendas = document.getElementById('grid-viviendas');
  const contadorViviendas = document.getElementById('contador-viviendas');
  const seccionVacias = document.getElementById('viviendas-vacias');

  const renderizarTarjeta = (v) => {
    const tieneJefe = Boolean(v.jefe_nombres || v.jefe_apellidos);
    const jefeTexto = tieneJefe
      ? `${v.jefe_apellidos || ''}, ${v.jefe_nombres || ''}`.replace(/^, |, $/g, '')
      : 'Sin jefe registrado';
    const jefeCedula = v.jefe_cedula || textoCedula(v.cedula_tipo, v.cedula_numero);
    const etapaManzana = `${v.etapa || 'Sin etapa'} / ${v.manzana || 'Sin manzana'}`;

    let estadoRegistro = { texto: 'Solo local', clase: 'insignia--local' };
    if (!tieneJefe) {
      estadoRegistro = { texto: 'Sin jefe registrado', clase: 'insignia--local' };
    } else if (v.sincronizado) {
      estadoRegistro = { texto: 'Registrada en Neon', clase: 'insignia--sincronizado' };
    } else if (v.sincronizar_neon) {
      estadoRegistro = { texto: 'Pendiente de subir', clase: 'insignia--pendiente' };
    }

    const articulo = document.createElement('article');
    articulo.className = 'tarjeta-vivienda';
    articulo.innerHTML = `
      <div class="tarjeta-cabecera">
        <div class="tarjeta-id">Vivienda N.º ${v.id}</div>
        <div class="tarjeta-comunidad">${v.comunidad || 'Sin comunidad'}</div>
        <div class="tarjeta-direccion">${v.direccion || '—'}</div>
      </div>
      <div class="tarjeta-datos">
        <div class="dato-fila">
          <span class="dato-label">N.º de casa</span>
          <span class="dato-valor">${v.numero_casa || 'Sin número'}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">Etapa / Manzana</span>
          <span class="dato-valor">${etapaManzana}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">Jefe de Familia</span>
          <span class="dato-valor ${tieneJefe ? '' : 'dato-valor--vacio'}">${jefeTexto}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">Cédula del jefe</span>
          <span class="dato-valor">${jefeCedula}</span>
        </div>
        <div class="dato-fila">
          <span class="dato-label">Registro</span>
          <span class="dato-valor">
            <span class="insignia ${estadoRegistro.clase}">${estadoRegistro.texto}</span>
          </span>
        </div>
      </div>
      <div class="tarjeta-acciones">
        <a href="/viviendas/${v.id}" class="boton boton--secundario">Ver ficha</a>
        <a href="/viviendas/${v.id}/editar" class="boton boton--primario">Editar</a>
        <button
          type="button"
          class="boton boton--peligro"
          data-abrir-password
          data-accion="/viviendas/${v.id}/eliminar"
          data-titulo="Eliminar vivienda"
          data-mensaje="Se eliminará la vivienda N.º ${v.id} junto con su jefe de familia e integrantes. Esta acción no se puede deshacer."
          data-texto-boton="Eliminar vivienda"
        >Eliminar</button>
      </div>
    `;
    return articulo;
  };

  const cargarViviendas = async (q = '') => {
    if (!gridViviendas) return;

    try {
      const respuesta = await fetch(`/api/viviendas?q=${encodeURIComponent(q)}`);
      if (!respuesta.ok) throw new Error('Error al cargar viviendas');
      const datos = await respuesta.json();
      const viviendas = datos.viviendas || [];

      gridViviendas.innerHTML = '';
      if (contadorViviendas) contadorViviendas.textContent = viviendas.length;

      if (viviendas.length === 0) {
        if (seccionVacias) seccionVacias.style.display = 'block';
        gridViviendas.style.display = 'none';
      } else {
        if (seccionVacias) seccionVacias.style.display = 'none';
        gridViviendas.style.display = 'grid';
        for (const v of viviendas) {
          gridViviendas.appendChild(renderizarTarjeta(v));
        }
      }
    } catch (error) {
      if (gridViviendas) gridViviendas.innerHTML = '<p class="alerta alerta--error">No se pudieron cargar las viviendas.</p>';
    }
  };

  // Cargar viviendas al iniciar
  cargarViviendas();

  // ============================================================================
  // TODAS LAS PERSONAS
  // ============================================================================

  const contenedorPersonas = document.getElementById('contenedor-personas');
  const tbodyPersonas = document.getElementById('tbody-personas');
  const contadorPersonas = document.getElementById('contador-personas');
  const seccionPersonasVacias = document.getElementById('personas-vacias');
  const inputBuscadorPersonas = document.getElementById('buscador-personas');

  const renderizarPersona = (p) => {
    const tipoBadge = p.tipo === 'Jefe de Familia'
      ? '<span class="tipo-badge tipo-badge--jefe">Jefe</span>'
      : '<span class="tipo-badge tipo-badge--integrante">Integrante</span>';
    const cedulaCompleta = textoCedula(p.cedula_tipo, p.cedula_numero);
    const etapaManzana = `${p.etapa || '—'} / ${p.manzana || '—'}`;
    const sincronizadoNeon = p.sincronizar_neon !== false;

    const fila = document.createElement('tr');
    fila.innerHTML = `
      <td>${tipoBadge}</td>
      <td class="cedula">${cedulaCompleta}</td>
      <td class="col-persona">
        <strong>${p.apellidos || '—'}</strong>
        <span>${p.nombres || '—'}</span>
      </td>
      <td>${p.edad !== null && p.edad !== undefined ? p.edad : '—'}</td>
      <td>${p.sexo || '—'}</td>
      <td>${p.parentesco || '—'}</td>
      <td>${p.comunidad || '—'}</td>
      <td>${etapaManzana}</td>
      <td>${p.direccion || '—'}</td>
      <td>${p.numero_casa || '—'}</td>
      <td>
        <span class="insignia ${sincronizadoNeon ? 'insignia--sincronizado' : 'insignia--pendiente'}">
          ${sincronizadoNeon ? 'Sí Neon' : 'Solo Local'}
        </span>
      </td>
    `;
    return fila;
  };

  const cargarPersonas = async (q = '') => {
    if (!tbodyPersonas) return;

    try {
      const respuesta = await fetch(`/api/personas?q=${encodeURIComponent(q)}`);
      if (!respuesta.ok) throw new Error('Error al cargar personas');
      const datos = await respuesta.json();
      const personas = datos.personas || [];

      tbodyPersonas.innerHTML = '';
      if (contadorPersonas) contadorPersonas.textContent = datos.total || 0;

      if (personas.length === 0) {
        if (seccionPersonasVacias) seccionPersonasVacias.style.display = 'block';
        contenedorPersonas.style.display = 'none';
      } else {
        if (seccionPersonasVacias) seccionPersonasVacias.style.display = 'none';
        contenedorPersonas.style.display = 'block';
        for (const p of personas) {
          tbodyPersonas.appendChild(renderizarPersona(p));
        }
      }
    } catch (error) {
      console.error('Error cargando personas:', error);
      if (contenedorPersonas) contenedorPersonas.innerHTML = '<p class="alerta alerta--error">No se pudieron cargar las personas.</p>';
    }
  };

  // Cargar personas al iniciar
  cargarPersonas();

  // ============================================================================
  // SINCRONIZACIÓN CON NEON
  // ============================================================================

  const btnSincronizarNeon = document.getElementById('btn-sincronizar-neon');

  if (btnSincronizarNeon) {
    btnSincronizarNeon.addEventListener('click', async () => {
      const textoOriginal = btnSincronizarNeon.textContent;
      btnSincronizarNeon.disabled = true;
      btnSincronizarNeon.textContent = 'Sincronizando...';

      try {
        const respuesta = await fetch('/api/sincronizar', { method: 'POST' });
        const datos = await respuesta.json();

        if (respuesta.ok && datos.ok) {
          notificar(datos.mensaje || 'Sincronización completada.', 'exito');
          await cargarViviendas();
          await cargarPersonas();
        } else {
          notificar(datos.mensaje || datos.error || 'No se pudo sincronizar con Neon.');
        }
      } catch (error) {
        notificar('Error de conexión al sincronizar con Neon.');
      } finally {
        btnSincronizarNeon.disabled = false;
        btnSincronizarNeon.textContent = textoOriginal;
      }
    });
  }

  const btnSincronizarLocales = document.getElementById('btn-sincronizar-locales');

  if (btnSincronizarLocales) {
    btnSincronizarLocales.addEventListener('click', async () => {
      const textoOriginal = btnSincronizarLocales.textContent;
      btnSincronizarLocales.disabled = true;
      btnSincronizarLocales.textContent = 'Subiendo...';

      try {
        const respuesta = await fetch('/api/sincronizar-locales', { method: 'POST' });
        const datos = await respuesta.json();

        if (respuesta.ok && datos.ok) {
          window.location.href = `/?ok=${encodeURIComponent(
            datos.mensaje || 'Viviendas solo local subidas a Neon.'
          )}#viviendas-dashboard`;
          return;
        }

        notificar(datos.mensaje || datos.error || 'No se pudieron subir las viviendas solo local.');
      } catch (error) {
        notificar('Error de conexión al subir las viviendas solo local.');
      } finally {
        btnSincronizarLocales.disabled = false;
        btnSincronizarLocales.textContent = textoOriginal;
      }
    });
  }

  // Cambia si una vivienda se sube a Neon o se mantiene solo en local.
  document.addEventListener('click', async (evento) => {
    const boton = evento.target.closest('[data-sincronizar-neon]');
    if (!boton) return;

    const activar = boton.dataset.sincronizarNeon === '1';
    const viviendaId = boton.dataset.vivienda;
    boton.disabled = true;

    try {
      const respuesta = await fetch(`/api/viviendas/${viviendaId}/sincronizar-neon`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sincronizar_neon: activar }),
      });
      const datos = await respuesta.json();

      if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || 'No se pudo actualizar la sincronización.');
      }

      window.location.href = `/viviendas/${viviendaId}?ok=${encodeURIComponent(
        datos.mensaje || 'Sincronización actualizada.'
      )}`;
    } catch (error) {
      notificar(error.message || 'No se pudo actualizar la sincronización.');
      boton.disabled = false;
    }
  });

  // Búsqueda de personas
  if (inputBuscadorPersonas) {
    let timeoutBusqueda;
    inputBuscadorPersonas.addEventListener('input', () => {
      clearTimeout(timeoutBusqueda);
      timeoutBusqueda = setTimeout(() => {
        cargarPersonas(inputBuscadorPersonas.value.trim());
      }, 300);
    });
  }

  // ============================================================================
  // BÚSQUEDA DE VIVIENDAS
  // ============================================================================

  const inputBuscador = document.getElementById('buscador-vivienda');
  const btnBuscar = document.getElementById('btn-buscar-vivienda');
  const contenedorResultados = document.getElementById('resultados-busqueda');

  if (inputBuscador && btnBuscar && contenedorResultados) {
    const renderizarResultados = (viviendas) => {
      if (!viviendas || viviendas.length === 0) {
        contenedorResultados.innerHTML =
          '<p class="sin-datos">No se encontraron viviendas.</p>';
        return;
      }

      const tabla = document.createElement('table');
      tabla.className = 'tabla-expedientes';
      tabla.innerHTML = `
        <thead>
          <tr>
            <th scope="col">N.º</th>
            <th scope="col">Comunidad</th>
            <th scope="col">Etapa</th>
            <th scope="col">Manzana</th>
            <th scope="col">Dirección</th>
            <th scope="col">Jefe de Familia</th>
            <th scope="col">Cédula Jefe</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = tabla.querySelector('tbody');
      viviendas.forEach((v) => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
          <td class="col-id">${v.id}</td>
          <td>${v.comunidad || '—'}</td>
          <td>${v.etapa || '—'}</td>
          <td>${v.manzana || '—'}</td>
          <td>${v.direccion || '—'}</td>
          <td class="col-persona">
            <strong>${v.jefe_apellidos || '—'}</strong>
            <span>${v.jefe_nombres || '—'}</span>
          </td>
          <td class="cedula">${textoCedula(v.cedula_tipo, v.cedula_numero)}</td>
          <td>
            <a href="/api/viviendas/${v.id}" class="boton boton--mini boton--secundario" target="_blank">Ver JSON</a>
          </td>
        `;
        tbody.appendChild(fila);
      });

      contenedorResultados.innerHTML = '';
      contenedorResultados.appendChild(tabla);
    };

    const ejecutarBusqueda = async () => {
      const q = inputBuscador.value.trim();
      if (!q) {
        contenedorResultados.innerHTML = '';
        cargarViviendas();
        return;
      }

      try {
        const respuesta = await fetch(`/api/viviendas?q=${encodeURIComponent(q)}`);
        if (!respuesta.ok) throw new Error('Error al buscar');
        const datos = await respuesta.json();
        renderizarResultados(datos.viviendas || []);
      } catch (error) {
        contenedorResultados.innerHTML =
          '<p class="alerta alerta--error">Error al buscar viviendas.</p>';
      }
    };

    btnBuscar.addEventListener('click', ejecutarBusqueda);
    inputBuscador.addEventListener('keydown', (evento) => {
      if (evento.key === 'Enter') ejecutarBusqueda();
    });
  }
})();
