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

  const configurarCalculoEdad = (inputFecha, inputEdad) => {
    if (!inputFecha || !inputEdad) return;
    inputFecha.addEventListener('change', () => {
      if (inputFecha.value) {
        const hoy = new Date();
        const nacimiento = new Date(inputFecha.value);
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
    const completo = `${tipo.value}-${numero.value.trim()}`;
    return /^[VE]-\d{6,8}$/.test(completo);
  };

  const mostrarPaso = (numero) => {
    paginas.forEach((pagina) => {
      pagina.classList.toggle('pagina--activa', Number(pagina.dataset.paso) === numero);
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
      if (tipo && numeroCedula && !validarFormatoCedula(tipo, numeroCedula)) {
        numeroCedula.classList.add('error');
        notificar('El formato de cédula es inválido. Use V-12345678 o E-12345678.');
        return false;
      } else if (numeroCedula) {
        numeroCedula.classList.remove('error');
      }
    }

    if (numero === 3) {
      const filas = document.querySelectorAll('.fila-integrante');
      if (filas.length === 0) {
        notificar('Atención: no se agregó ningún integrante. Puede continuar igual.', 'warn');
      }
      filas.forEach((fila) => {
        const apellidos = fila.querySelector('input[name="apellidos"]');
        const nombres = fila.querySelector('input[name="nombres"]');
        const parentesco = fila.querySelector('select[name="parentesco"]');
        if (!apellidos.value.trim() || !nombres.value.trim() || !parentesco.value) {
          if (apellidos) apellidos.classList.add('error');
          if (nombres) nombres.classList.add('error');
          if (parentesco) parentesco.classList.add('error');
          valido = false;
        } else {
          if (apellidos) apellidos.classList.remove('error');
          if (nombres) nombres.classList.remove('error');
          if (parentesco) parentesco.classList.remove('error');
        }
      });
    }

    return valido;
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

      lista.appendChild(contenido);
      renumerarIntegrantes();
      notificar('Integrante agregado al grupo familiar.', 'exito');
    });
  }

  // Envío del formulario
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();

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

      const datos = await respuesta.json();

      if (respuesta.ok && datos.ok) {
        form.reset();
        lista.innerHTML = '';
        contadorIntegrantes = 0;
        edadJefe.value = '';
        mostrarPaso(1);
        btnSubmit.disabled = false;
        btnSubmit.textContent = textoOriginal;
        actualizarContador();
        notificar('Vivienda registrada correctamente.', 'exito');
        setTimeout(() => {
          window.location.href = `/?ok=${encodeURIComponent('Vivienda registrada exitosamente.')}#registros`;
        }, 1200);
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
