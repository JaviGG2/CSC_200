(() => {
  const input = document.getElementById('input-planilla');
  const estadoEl = document.getElementById('escaneo-estado');
  const canvas = document.getElementById('canvas-escaneo');
  const toggleAnexo = document.getElementById('w-es-anexo');
  const bloqueAnexo = document.getElementById('bloque-anexo');
  const numeroAnexo = document.getElementById('w-numero-anexo');
  const buscarPrincipal = document.getElementById('w-buscar-principal');
  const viviendaPrincipal = document.getElementById('w-vivienda-principal');
  const resultadosPrincipal = document.getElementById('resultados-principal');
  const principalSeleccionada = document.getElementById('principal-seleccionada');

  if (!input || !canvas) return;

  const MAX_ANCHO = 1600;
  const CALIDAD_JPEG = 0.85;

  const normalizar = (valor) =>
    String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  const mostrarEstado = (mensaje, tipo = 'info') => {
    if (!estadoEl) return;
    estadoEl.hidden = false;
    estadoEl.textContent = mensaje;
    estadoEl.dataset.tipo = tipo;
  };

  const resaltar = (elemento) => {
    if (!elemento) return;
    const contenedor = elemento.closest('.campo') || elemento;
    contenedor.classList.add('campo--autocompletado');
    setTimeout(() => contenedor.classList.remove('campo--autocompletado'), 12000);
  };

  const buscarOpcion = (select, valor) => {
    const objetivo = normalizar(valor);
    if (!objetivo) return null;

    const opciones = Array.from(select.options).filter((opcion) => opcion.value !== '');
    return (
      opciones.find(
        (opcion) =>
          normalizar(opcion.textContent) === objetivo || normalizar(opcion.value) === objetivo
      ) ||
      opciones.find((opcion) => {
        const texto = normalizar(opcion.textContent);
        return texto && (texto.includes(objetivo) || objetivo.includes(texto));
      }) ||
      null
    );
  };

  const seleccionar = (elemento, valor, { agregar = false } = {}) => {
    if (!elemento || valor === null || valor === undefined || String(valor).trim() === '') {
      return false;
    }

    const texto = String(valor).trim();

    if (elemento.tagName === 'SELECT') {
      let opcion = buscarOpcion(elemento, texto);
      if (!opcion && agregar) {
        opcion = new Option(texto, texto);
        elemento.add(opcion);
      }
      if (!opcion) return false;
      elemento.value = opcion.value;
      elemento.dispatchEvent(new Event('change', { bubbles: true }));
      resaltar(elemento);
      return true;
    }

    elemento.value = texto;
    resaltar(elemento);
    return true;
  };

  const escribir = (id, valor) => {
    const elemento = document.getElementById(id);
    if (!elemento || valor === null || valor === undefined) return false;
    const texto = String(valor).trim();
    if (!texto) return false;
    elemento.value = texto;
    resaltar(elemento);
    return true;
  };

  const escribirFecha = (elemento, valor, edad) => {
    if (!elemento) return;
    const fecha = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      elemento.value = fecha;
      elemento.dispatchEvent(new Event('change', { bubbles: true }));
      resaltar(elemento);
    }
    if ((!fecha || !elemento.value) && Number(edad) > 0) {
      const edadEl = elemento
        .closest('.campo, .campos-dobles, .integrante-grid')
        ?.querySelector('input[name="edad"]');
      if (edadEl) {
        edadEl.value = Number(edad);
        resaltar(edadEl);
      }
    }
  };

  const activarAnexo = (activo) => {
    if (!toggleAnexo) return;
    toggleAnexo.checked = Boolean(activo);
    if (bloqueAnexo) bloqueAnexo.hidden = !toggleAnexo.checked;
    toggleAnexo.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const autocompletarUbicacion = (ubicacion) => {
    if (!ubicacion) return;

    seleccionar(document.getElementById('w-estado'), ubicacion.estado);
    seleccionar(document.getElementById('w-municipio'), ubicacion.municipio);
    seleccionar(document.getElementById('w-parroquia'), ubicacion.parroquia, { agregar: true });

    const comunidad = ubicacion.nombre_comunidad || ubicacion.sector;
    seleccionar(document.getElementById('w-comunidad'), comunidad, { agregar: true });

    const consejo = document.getElementById('w-consejo-comunal');
    if (consejo) {
      const detectado = ubicacion.consejo_comunal_detectado || comunidad;
      if (!seleccionar(consejo, detectado)) {
        const objetivo = normalizar(detectado);
        const opcion = Array.from(consejo.options).find((o) => {
          const texto = normalizar(o.textContent);
          return texto && objetivo && (texto.includes(objetivo) || objetivo.includes(texto));
        });
        if (opcion) {
          consejo.value = opcion.value;
          resaltar(consejo);
        }
      }
    }

    const direccion = String(ubicacion.direccion || '').trim();
    if (direccion) escribir('w-direccion', direccion);

    if (ubicacion.es_anexo) {
      activarAnexo(true);
      if (ubicacion.numero_anexo) escribir('w-numero-anexo', ubicacion.numero_anexo);
    }
  };

  const autocompletarJefe = (jefe) => {
    if (!jefe) return;

    escribir('w-j-nombres', jefe.nombres);
    escribir('w-j-apellidos', jefe.apellidos);

    const tipo = document.getElementById('w-j-cedula-tipo');
    const numero = document.getElementById('w-j-cedula-numero');
    const cedula = String(jefe.cedula || '').replace(/\D+/g, '');

    if (tipo && numero) {
      tipo.value = cedula ? (jefe.nacionalidad === 'E' ? 'E' : 'V') : 'S';
      tipo.dispatchEvent(new Event('change', { bubbles: true }));
      if (cedula) {
        numero.value = cedula;
        resaltar(numero);
      }
    }

    escribirFecha(document.getElementById('w-j-fecha-nacimiento'), jefe.fecha_nacimiento, jefe.edad);

    seleccionar(document.getElementById('w-j-sexo'), jefe.sexo === 'F' ? 'F' : 'M');
    escribir('w-j-tel-movil', jefe.telefono_movil);
    escribir('w-j-tel-hab', jefe.telefono_habitacion);
    escribir('w-j-correo', jefe.correo);
    seleccionar(document.getElementById('w-j-nivel-instruccion'), jefe.nivel_instruccion, {
      agregar: true,
    });
    seleccionar(document.getElementById('w-j-estado-civil'), jefe.estado_civil, {
      agregar: true,
    });
    escribir('w-j-profesion', jefe.profesion);
    seleccionar(
      document.getElementById('w-j-trabaja-actual'),
      jefe.trabaja_actual ? 'Sí' : 'No',
      { agregar: true }
    );
    seleccionar(
      document.getElementById('w-j-clasificacion-ingresos'),
      jefe.clasificacion_ingresos,
      { agregar: true }
    );

    if (Number(jefe.ingreso_mensual_bs) > 0) {
      escribir('w-j-ingreso-mensual', jefe.ingreso_mensual_bs);
    }
  };

  const nuevaFilaIntegrante = () => {
    const boton = document.getElementById('btn-agregar-integrante');
    if (boton) boton.click();
  };

  const autocompletarFila = (fila, integrante) => {
    if (!fila || !integrante) return;

    const poner = (name, valor, el = fila) => {
      const campo = el.querySelector(`[name="${name}"]`);
      if (!campo || valor === null || valor === undefined || String(valor).trim() === '') {
        return;
      }
      campo.value = String(valor).trim();
      resaltar(campo);
    };

    const seleccionarFila = (name, valor, { agregar = true } = {}) => {
      const campo = fila.querySelector(`[name="${name}"]`);
      if (!campo) return;
      seleccionar(campo, valor, { agregar });
    };

    poner('apellidos', integrante.apellidos);
    poner('nombres', integrante.nombres);
    seleccionarFila('sexo', integrante.sexo === 'F' ? 'F' : 'M');

    const cedula = String(integrante.cedula || '').replace(/\D+/g, '');
    seleccionarFila('cedula_tipo', cedula ? 'V' : 'S', { agregar: false });
    if (cedula) poner('cedula_numero', cedula);

    const fecha = fila.querySelector('input[name="fecha_nacimiento"]');
    escribirFecha(fecha, integrante.fecha_nacimiento, integrante.edad);

    // Si no vino fecha, la edad se escribe directamente.
    if (!integrante.fecha_nacimiento && Number(integrante.edad) > 0) {
      const edadEl = fila.querySelector('input[name="edad"]');
      if (edadEl) {
        edadEl.value = Number(integrante.edad);
        resaltar(edadEl);
      }
    }

    seleccionarFila('parentesco', integrante.parentesco);
    seleccionarFila('nivel_instruccion', integrante.nivel_instruccion);
    poner('profesion', integrante.profesion);

    if (Number(integrante.ingreso_mensual) > 0) {
      poner('ingreso_mensual', integrante.ingreso_mensual);
    }
  };

  const autocompletarGrupo = (grupo) => {
    const integrantes = (Array.isArray(grupo) ? grupo : []).filter(
      (integrante) => integrante && (integrante.nombres || integrante.apellidos)
    );
    if (!integrantes.length) return;

    const lista = document.getElementById('lista-integrantes');
    if (!lista) return;

    while (lista.querySelectorAll('.fila-integrante').length < integrantes.length) {
      nuevaFilaIntegrante();
    }

    const filas = lista.querySelectorAll('.fila-integrante');
    integrantes.forEach((integrante, indice) => {
      autocompletarFila(filas[indice], integrante);
    });
  };

  const redimensionar = (archivo) =>
    new Promise((resolve, reject) => {
      const lector = new FileReader();

      lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      lector.onload = () => {
        const imagen = new Image();
        imagen.onerror = () => reject(new Error('La imagen no es válida.'));
        imagen.onload = () => {
          const escala = Math.min(1, MAX_ANCHO / imagen.width);
          canvas.width = Math.max(1, Math.round(imagen.width * escala));
          canvas.height = Math.max(1, Math.round(imagen.height * escala));

          const contexto = canvas.getContext('2d');
          if (!contexto) {
            reject(new Error('El navegador no pudo procesar la imagen.'));
            return;
          }

          contexto.fillStyle = '#ffffff';
          contexto.fillRect(0, 0, canvas.width, canvas.height);
          contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);

          resolve(canvas.toDataURL('image/jpeg', CALIDAD_JPEG));
        };
        imagen.src = String(lector.result);
      };

      lector.readAsDataURL(archivo);
    });

  const procesarArchivo = async (archivo) => {
    if (!archivo) return;

    if (!archivo.type.startsWith('image/')) {
      mostrarEstado('Seleccione una imagen válida.', 'error');
      return;
    }

    try {
      mostrarEstado('Reduciendo imagen en memoria...', 'info');
      const imagen = await redimensionar(archivo);

      mostrarEstado('Analizando la planilla con Gemini...', 'info');

      const respuesta = await fetch('/api/escanear-planilla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagen, mimeType: 'image/jpeg' }),
      });

      const datos = await respuesta.json();

      if (!respuesta.ok || !datos.ok) {
        throw new Error(datos.error || 'No se pudo procesar la planilla.');
      }

      const { ubicacion, jefe, grupo_familiar: grupo } = datos.datos;
      autocompletarUbicacion(ubicacion);
      autocompletarJefe(jefe);
      autocompletarGrupo(grupo);

      mostrarEstado(
        'Planilla procesada. Revise los campos resaltados antes de guardar.',
        'exito'
      );
    } catch (error) {
      mostrarEstado(error.message || 'Error al procesar la planilla.', 'error');
    } finally {
      input.value = '';
    }
  };

  input.addEventListener('change', () => {
    const archivo = input.files && input.files[0];
    procesarArchivo(archivo);
  });

  // -------------------------------------------------------------------------
  // Anexos y búsqueda de vivienda principal
  // -------------------------------------------------------------------------
  if (toggleAnexo && bloqueAnexo) {
    toggleAnexo.addEventListener('change', () => {
      bloqueAnexo.hidden = !toggleAnexo.checked;
      if (!toggleAnexo.checked) {
        if (viviendaPrincipal) viviendaPrincipal.value = '';
        if (resultadosPrincipal) resultadosPrincipal.innerHTML = '';
        if (principalSeleccionada) {
          principalSeleccionada.textContent = 'Ninguna vivienda principal seleccionada.';
        }
      }
    });
  }

  let temporizadorBusqueda = null;

  const pintarResultados = (viviendas) => {
    if (!resultadosPrincipal) return;
    resultadosPrincipal.innerHTML = '';

    if (!viviendas.length) {
      resultadosPrincipal.textContent = 'No se encontraron viviendas principales.';
      return;
    }

    for (const vivienda of viviendas) {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'resultado-principal';
      boton.innerHTML = `<strong>${vivienda.direccion}</strong><span>${vivienda.comunidad}${
        vivienda.numero_casa ? ' · Casa ' + vivienda.numero_casa : ''
      } · ${vivienda.jefe_nombres} ${vivienda.jefe_apellidos} (${vivienda.jefe_cedula})</span>`;

      boton.addEventListener('click', () => {
        if (viviendaPrincipal) viviendaPrincipal.value = String(vivienda.id);
        if (principalSeleccionada) {
          principalSeleccionada.textContent = `Seleccionada: ${vivienda.direccion} · ${vivienda.jefe_nombres} ${vivienda.jefe_apellidos}`;
          resaltar(principalSeleccionada);
        }
        if (buscarPrincipal) buscarPrincipal.value = '';
        resultadosPrincipal.innerHTML = '';
      });

      resultadosPrincipal.appendChild(boton);
    }
  };

  if (buscarPrincipal) {
    buscarPrincipal.addEventListener('input', () => {
      const q = buscarPrincipal.value.trim();
      if (temporizadorBusqueda) clearTimeout(temporizadorBusqueda);

      if (q.length < 2) {
        if (resultadosPrincipal) resultadosPrincipal.innerHTML = '';
        return;
      }

      temporizadorBusqueda = setTimeout(async () => {
        try {
          const respuesta = await fetch(
            `/api/viviendas/buscar-principal?q=${encodeURIComponent(q)}`
          );
          const datos = await respuesta.json();
          pintarResultados(datos.viviendas || []);
        } catch {
          if (resultadosPrincipal) {
            resultadosPrincipal.textContent = 'No se pudo buscar la vivienda principal.';
          }
        }
      }, 300);
    });
  }
})();
