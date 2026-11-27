(() => {
  const form = document.getElementById('form-wizard');
  const pasos = document.querySelectorAll('.paso');
  const paginas = document.querySelectorAll('.wizard-pagina');
  const btnAnterior = document.getElementById('btn-anterior');
  const btnSiguiente = document.getElementById('btn-siguiente');
  const btnFinalizar = document.getElementById('btn-finalizar');
  const barraProgreso = document.querySelector('.progreso-barra');
  const btnAgregar = document.getElementById('btn-agregar-integrante');
  const lista = document.getElementById('lista-integrantes');
  const template = document.getElementById('fila-integrante-template');
  const contadorIntegrantesEl = document.getElementById('contador-integrantes');

  let pasoActual = 1;
  const totalPasos = 3;
  let contadorIntegrantes = 0;

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

    document.body.insertBefore(notif, document.body.firstChild);

    setTimeout(() => {
      notif.style.opacity = '0';
      notif.style.transition = 'opacity 0.3s ease';
      setTimeout(() => notif.remove(), 300);
    }, 4000);
  };

  const actualizarContador = () => {
    const filas = lista.querySelectorAll('.fila-integrante');
    contadorIntegrantesEl.textContent =
      filas.length + ' integrante' + (filas.length === 1 ? '' : 's') + ' registrado' + (filas.length === 1 ? '' : 's');
  };

  const renumerarIntegrantes = () => {
    const filas = lista.querySelectorAll('.fila-integrante');
    filas.forEach((fila, index) => {
      const numeroCelda = fila.querySelector('.numero-fila');
      if (numeroCelda) numeroCelda.textContent = `Integrante ${index + 1}`;
      fila.dataset.numero = index + 1;
    });
    actualizarContador();
  };

  const obtenerHoyIso = () => {
    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = String(ahora.getMonth() + 1).padStart(2, '0');
    const dia = String(ahora.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  };

  const esFechaFutura = (fechaIso) => {
    const limpio = String(fechaIso || '').trim().slice(0, 10);
    if (!limpio) return false;
    return limpio > obtenerHoyIso();
  };

  const configurarCalculoEdad = (inputFecha, inputEdad) => {
    if (!inputFecha || !inputEdad) return;
    inputFecha.max = obtenerHoyIso();
    inputFecha.addEventListener('change', () => {
      if (inputFecha.value) {
        if (esFechaFutura(inputFecha.value)) {
          inputEdad.value = '';
          return;
        }
        const hoy = new Date();
        const nacimiento = new Date(inputFecha.value + 'T00:00:00');
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const mesDiff = hoy.getMonth() - nacimiento.getMonth();
        if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) {
          edad -= 1;
        }
        inputEdad.value = Math.max(0, edad);
      } else {
        inputEdad.value = '';
      }
    });
  };

  const aplicarConfigCampos = () => {
    const config = window.CAMPOS_CENSO || {};
    for (const clave of Object.keys(config)) {
      const cfg = config[clave];
      const el = document.getElementById(clave);
      if (!el) continue;
      const contenedor = el.closest('.campo') || el;

      if (cfg && cfg.visible === false) {
        contenedor.style.display = 'none';
        el.required = false;
        el.disabled = true;
      } else {
        contenedor.style.display = '';
        el.disabled = false;
        el.required = !!(cfg && cfg.requerido);
      }
    }
  };

  aplicarConfigCampos();

  const validarCampo = (campo) => {
    if (!campo.value.trim()) {
      campo.classList.add('error');
      campo.focus();
      return false;
    }
    campo.classList.remove('error');
    return true;
  };

  const validarFormatoCedula = (tipo, numero) => {
    if (!tipo || !numero) return true;
    if (tipo.value === 'S') return true;
    const completo = `${tipo.value}-${numero.value.trim()}`;
    return /^[VE]-\d{6,8}$/.test(completo);
  };

  // «Sin cédula» desactiva el número y lo saca de los campos obligatorios.
  const aplicarTipoCedula = (select) => {
    const contenedor = select.closest('.campos-dobles') || select.closest('.campo-cedula') || select.closest('.campo');
    const numero = contenedor && contenedor.querySelector('input[name="cedula_numero"]');
    if (!numero) return;

    const sinCedula = select.value === 'S';
    numero.disabled = sinCedula;
    numero.required = !sinCedula;
    numero.placeholder = sinCedula ? 'No aplica' : 'Número de cédula';
    if (sinCedula) numero.value = '';
  };

  const iniciarTipoCedula = () => {
    document.querySelectorAll('[data-cedula-tipo]').forEach(aplicarTipoCedula);

    document.addEventListener('change', (evento) => {
      const select = evento.target.closest('[data-cedula-tipo]');
      if (select) aplicarTipoCedula(select);
    });
  };

  iniciarTipoCedula();

  const mostrarPaso = (numero) => {
    const haciaAtras = numero < pasoActual;

    paginas.forEach((pagina) => {
      const esActual = Number(pagina.dataset.paso) === numero;
      pagina.classList.remove('wizard-pagina--atras');
      if (esActual && haciaAtras) {
        pagina.classList.add('wizard-pagina--atras');
      }
      pagina.classList.toggle('pagina--activa', esActual);
    });

    pasos.forEach((paso, indice) => {
      const esActivo = indice + 1 === numero;
      const esCompletado = indice + 1 < numero;
      paso.classList.toggle('paso--activo', esActivo);
      paso.classList.toggle('paso--completado', esCompletado);
      paso.setAttribute('aria-selected', esActivo);
    });

    const porcentaje = ((numero - 1) / (totalPasos - 1)) * 100;
    if (barraProgreso) barraProgreso.style.width = `${porcentaje}%`;

    btnAnterior.disabled = numero === 1;
    btnSiguiente.style.display = numero === totalPasos ? 'none' : 'inline-block';
    btnFinalizar.style.display = numero === totalPasos ? 'inline-block' : 'none';

    pasoActual = numero;
  };

  const validarPaso = (numero) => {
    const pagina = document.querySelector(`.wizard-pagina[data-paso="${numero}"]`);
    if (!pagina) return true;

    let valido = true;

    const requeridos = pagina.querySelectorAll('input[required], select[required], textarea[required]');
    let faltantes = [];

    requeridos.forEach((campo) => {
      if (!campo.value.trim()) {
        campo.classList.add('error');
        faltantes.push(campo);
      } else {
        campo.classList.remove('error');
      }
    });

    if (faltantes.length > 0 && numero < totalPasos) {
      // En pasos intermedios, permitir avanzar con advertencia
      const nombresFaltantes = faltantes
        .map((c) => {
          const label = c.previousElementSibling;
          return label ? label.textContent.replace('*', '').trim() : c.name || c.id;
        })
        .join(', ');
      notificar(`Campos incompletos: ${nombresFaltantes}. Puede continuar, pero se recomienda completarlos.`, 'warn');
      return true; // Permitir avanzar
    }

    if (numero === 2) {
      const tipo = document.getElementById('w-j-cedula-tipo');
      const numeroCedula = document.getElementById('w-j-cedula-numero');
      if (tipo && !tipo.disabled && numeroCedula && !numeroCedula.disabled && !validarFormatoCedula(tipo, numeroCedula)) {
        numeroCedula.classList.add('error');
        notificar('El formato de cédula es inválido. Use V-12345678 o E-12345678.');
        return false;
      } else if (numeroCedula) {
        numeroCedula.classList.remove('error');
      }

      const fechaNacJefe = document.getElementById('w-j-fecha-nacimiento');
      if (fechaNacJefe && esFechaFutura(fechaNacJefe.value)) {
        fechaNacJefe.classList.add('error');
        notificar('La fecha de nacimiento del jefe de familia no puede ser futura.');
        return false;
      } else if (fechaNacJefe) {
        fechaNacJefe.classList.remove('error');
      }
    }

    if (numero === 3) {
      const filas = document.querySelectorAll('.fila-integrante');
      if (filas.length === 0) {
        notificar('Atención: no se agregó ningún integrante. Puede continuar igual.', 'warn');
      }

      const cedulasUsadas = new Set();
      const tipoJefe = document.getElementById('w-j-cedula-tipo');
      const numJefe = document.getElementById('w-j-cedula-numero');
      if (tipoJefe && numJefe && tipoJefe.value !== 'S' && numJefe.value.trim()) {
        cedulasUsadas.add(`${tipoJefe.value}-${numJefe.value.trim()}`);
      }

      let primerError = '';

      filas.forEach((fila, indice) => {
        const apellidos = fila.querySelector('input[name="apellidos"]');
        const nombres = fila.querySelector('input[name="nombres"]');
        const parentesco = fila.querySelector('select[name="parentesco"]');
        const fechaInt = fila.querySelector('input[name="fecha_nacimiento"]');
        const tipoInt = fila.querySelector('select[name="cedula_tipo"]');
        const numInt = fila.querySelector('input[name="cedula_numero"]');

        if (!apellidos.value.trim() || !nombres.value.trim() || !parentesco.value) {
          if (apellidos && !apellidos.value.trim()) apellidos.classList.add('error');
          if (nombres && !nombres.value.trim()) nombres.classList.add('error');
          if (parentesco && !parentesco.value) parentesco.classList.add('error');
          if (!primerError) primerError = `Complete apellidos, nombres y parentesco del integrante ${indice + 1}.`;
          valido = false;
        } else {
          if (apellidos) apellidos.classList.remove('error');
          if (nombres) nombres.classList.remove('error');
          if (parentesco) parentesco.classList.remove('error');
        }

        if (fechaInt && esFechaFutura(fechaInt.value)) {
          fechaInt.classList.add('error');
          if (!primerError) primerError = `La fecha de nacimiento del integrante ${indice + 1} no puede ser futura.`;
          valido = false;
        } else if (fechaInt) {
          fechaInt.classList.remove('error');
        }

        if (tipoInt && numInt && tipoInt.value !== 'S') {
          if (!validarFormatoCedula(tipoInt, numInt)) {
            numInt.classList.add('error');
            if (!primerError) primerError = `La cédula del integrante ${indice + 1} es inválida (use 6 a 8 dígitos o «Sin cédula»).`;
            valido = false;
          } else {
            const clave = `${tipoInt.value}-${numInt.value.trim()}`;
            if (cedulasUsadas.has(clave)) {
              numInt.classList.add('error');
              if (!primerError) primerError = `La cédula ${clave} está repetida dentro del grupo familiar.`;
              valido = false;
            } else {
              cedulasUsadas.add(clave);
              numInt.classList.remove('error');
            }
          }
        } else if (numInt) {
          numInt.classList.remove('error');
        }
      });

      if (!valido && primerError) {
        notificar(primerError, 'error');
      }
    }

    return valido;
  };

  const validarPasoEstricto = (numero) => {
    const pagina = document.querySelector(`.wizard-pagina[data-paso="${numero}"]`);
    if (!pagina) return true;

    const requeridos = pagina.querySelectorAll('input[required]:not(:disabled), select[required]:not(:disabled), textarea[required]:not(:disabled)');
    const faltantes = [];

    requeridos.forEach((campo) => {
      if (!String(campo.value || '').trim()) {
        campo.classList.add('error');
        faltantes.push(campo);
      } else {
        campo.classList.remove('error');
      }
    });

    if (faltantes.length > 0) {
      const nombresFaltantes = faltantes
        .map((c) => {
          const label = c.previousElementSibling;
          return label ? label.textContent.replace('*', '').trim() : c.name || c.id;
        })
        .join(', ');
      notificar(`Complete los campos obligatorios: ${nombresFaltantes}.`, 'error');
      faltantes[0].focus();
      return false;
    }

    if (numero === 2) {
      const tipo = document.getElementById('w-j-cedula-tipo');
      const numeroCedula = document.getElementById('w-j-cedula-numero');
      if (tipo && !tipo.disabled && numeroCedula && !numeroCedula.disabled && !validarFormatoCedula(tipo, numeroCedula)) {
        numeroCedula.classList.add('error');
        notificar('El formato de cédula es inválido. Use V-12345678 o E-12345678.', 'error');
        numeroCedula.focus();
        return false;
      }
      if (numeroCedula) numeroCedula.classList.remove('error');

      const fechaNacJefe = document.getElementById('w-j-fecha-nacimiento');
      if (fechaNacJefe && !fechaNacJefe.disabled && esFechaFutura(fechaNacJefe.value)) {
        fechaNacJefe.classList.add('error');
        notificar('La fecha de nacimiento del jefe de familia no puede ser futura.', 'error');
        fechaNacJefe.focus();
        return false;
      }
      if (fechaNacJefe) fechaNacJefe.classList.remove('error');
    }

    return true;
  };

  pasos.forEach((paso) => {
    paso.addEventListener('click', () => {
      const objetivo = Number(paso.dataset.paso);
      if (objetivo >= 1 && objetivo <= totalPasos) {
        mostrarPaso(objetivo);
      }
    });
  });

  btnAnterior.addEventListener('click', () => {
    if (pasoActual > 1) mostrarPaso(pasoActual - 1);
  });

  btnSiguiente.addEventListener('click', () => {
    if (pasoActual < totalPasos) {
      if (!validarPaso(pasoActual)) {
        mostrarPaso(pasoActual);
        return;
      }
      mostrarPaso(pasoActual + 1);
    }
  });

  // Cálculo de edad jefe
  const fechaJefe = document.getElementById('w-j-fecha-nacimiento');
  const edadJefe = document.getElementById('w-j-edad');
  configurarCalculoEdad(fechaJefe, edadJefe);

  // Agregar integrante
  if (btnAgregar && lista && template) {
    btnAgregar.addEventListener('click', () => {
      contadorIntegrantes++;
      const numero = contadorIntegrantes;

      const contenido = template.content.cloneNode(true);
      const fila = contenido.querySelector('.fila-integrante');
      fila.dataset.numero = numero;
      const numeroFila = fila.querySelector('.numero-fila');
      if (numeroFila) numeroFila.textContent = `Integrante ${numero}`;

      const inputFecha = fila.querySelector('input[name="fecha_nacimiento"]');
      const inputEdad = fila.querySelector('input[name="edad"]');
      configurarCalculoEdad(inputFecha, inputEdad);

      const btnEliminar = fila.querySelector('.boton-eliminar-fila');
      btnEliminar.addEventListener('click', () => {
        fila.remove();
        renumerarIntegrantes();
      });

      const selectCedulaInt = fila.querySelector('[data-cedula-tipo]');
      if (selectCedulaInt) aplicarTipoCedula(selectCedulaInt);

      lista.appendChild(contenido);
      renumerarIntegrantes();
      notificar('Integrante agregado al grupo familiar.', 'exito');
    });
  }

  // Envío del formulario
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    if (!validarPasoEstricto(1)) {
      mostrarPaso(1);
      return;
    }
    if (!validarPasoEstricto(2)) {
      mostrarPaso(2);
      return;
    }
    if (!validarPaso(3)) {
      mostrarPaso(3);
      return;
    }

    const formData = new FormData(form);

    const vivienda = {
      estado: formData.get('estado'),
      municipio: formData.get('municipio'),
      parroquia: formData.get('parroquia'),
      comunidad: formData.get('comunidad'),
      etapa: formData.get('etapa') || null,
      manzana: formData.get('manzana') || null,
      direccion: formData.get('direccion'),
      numero_casa: formData.get('numero_casa') || null,
      consejo_comunal_id: formData.get('consejo_comunal_id') || null,
      es_anexo: formData.get('es_anexo') === '1',
      numero_anexo: formData.get('numero_anexo') || null,
      vivienda_principal_id: formData.get('vivienda_principal_id') || null,
      sincronizar_neon: formData.get('sincronizar_neon') === '1',
    };

    const jefe = {
      cedula_tipo: formData.get('cedula_tipo'),
      cedula_numero: formData.get('cedula_numero'),
      nombres: formData.get('nombres'),
      apellidos: formData.get('apellidos'),
      fecha_nacimiento: formData.get('fecha_nacimiento'),
      sexo: formData.get('sexo'),
      telefono_movil: formData.get('telefono_movil') || null,
      telefono_habitacion: formData.get('telefono_habitacion') || null,
      telefono_trabajo: formData.get('telefono_trabajo') || null,
      correo: formData.get('correo') || null,
      nivel_instruccion: formData.get('nivel_instruccion'),
      estado_civil: formData.get('estado_civil'),
      profesion: formData.get('profesion') || null,
      trabaja_actual: formData.get('trabaja_actual'),
      clasificacion_ingresos: formData.get('clasificacion_ingresos'),
      frecuencia_ingresos: formData.get('frecuencia_ingresos') || null,
      ingreso_mensual_bs: formData.get('ingreso_mensual_bs') || null,
    };

    const integrantes = [];
    const filas = document.querySelectorAll('.fila-integrante');
    filas.forEach((fila) => {
      const inputs = {};
      fila.querySelectorAll('input, select').forEach((campo) => {
        inputs[campo.name] = campo.value;
      });
      integrantes.push({
        apellidos: inputs.apellidos,
        nombres: inputs.nombres,
        cedula_tipo: inputs.cedula_tipo || null,
        cedula_numero: inputs.cedula_numero || null,
        fecha_nacimiento: inputs.fecha_nacimiento || null,
        sexo: inputs.sexo || null,
        parentesco: inputs.parentesco,
        nivel_instruccion: inputs.nivel_instruccion || null,
        profesion: inputs.profesion || null,
        ingreso_mensual: inputs.ingreso_mensual || null,
      });
    });

    const btnSubmit = form.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.textContent;
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Registrando vivienda...';

    try {
      const respuesta = await fetch('/api/viviendas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vivienda, jefe, integrantes }),
      });

      let datos = {};
      try {
        datos = await respuesta.json();
      } catch {
        datos = {};
      }

      if (respuesta.ok && datos.ok) {
        form.reset();
        lista.innerHTML = '';
        contadorIntegrantes = 0;
        edadJefe.value = '';
        document.querySelectorAll('[data-cedula-tipo]').forEach(aplicarTipoCedula);

        const bloqueAnexoEl = document.getElementById('bloque-anexo');
        if (bloqueAnexoEl) bloqueAnexoEl.hidden = true;
        const principalIdEl = document.getElementById('w-vivienda-principal');
        if (principalIdEl) principalIdEl.value = '';
        const resultadosEl = document.getElementById('resultados-principal');
        if (resultadosEl) resultadosEl.innerHTML = '';
        const principalTxtEl = document.getElementById('principal-seleccionada');
        if (principalTxtEl) principalTxtEl.textContent = 'Ninguna vivienda principal seleccionada.';

        mostrarPaso(1);
        btnSubmit.disabled = false;
        btnSubmit.textContent = textoOriginal;
        actualizarContador();

        const neon = datos.neon;
        let mensaje = 'Vivienda registrada correctamente.';
        let tipo = 'exito';
        let subidaANeon = true;

        if (neon && neon.configurado === false) {
          mensaje =
            'Vivienda registrada en local. Neon no está configurado, así que no se subió.';
          tipo = 'warn';
          subidaANeon = false;
        } else if (neon && neon.ok === false) {
          mensaje = `Vivienda guardada en local, pero no se pudo subir a Neon: ${neon.mensaje}`;
          tipo = 'error';
          subidaANeon = false;
        } else if (neon && neon.aplicado) {
          mensaje = 'Vivienda registrada y subida a Neon correctamente.';
        }

        notificar(mensaje, tipo);

        if (subidaANeon) {
          setTimeout(() => {
            window.location.href = `/censo?ok=${encodeURIComponent(mensaje)}#registros`;
          }, 1200);
        }
      } else {
        btnSubmit.disabled = false;
        btnSubmit.textContent = textoOriginal;
        notificar(datos.error || 'Error al registrar la vivienda.');
      }
    } catch (error) {
      btnSubmit.disabled = false;
      btnSubmit.textContent = textoOriginal;
      notificar('Error de conexión al registrar la vivienda.');
    }
  });

  mostrarPaso(1);
})();
