import { Router, Request, Response, NextFunction } from 'express';
import { requerirAdmin, requerirAuth } from '../../nucleo/autenticacion';
import {
  CAMPOS_OPCIONES,
  actualizarCampo,
  actualizarConfigCampo,
  actualizarConsejoComunal,
  actualizarIntegrante,
  actualizarJefeFamilia,
  actualizarOpcionCampo,
  actualizarRegistro,
  actualizarTerritorio,
  actualizarUsuario,
  actualizarVivienda,
  buscarViviendasPrincipales,
  cambiarEstadoCampo,
  cambiarEstadoOpcionCampo,
  cambiarEstadoOpcionEnNeon,
  cambiarSincronizarNeon,
  contarAdminsActivos,
  contarPersonas,
  contarViviendas,
  crearCampo,
  crearConsejoComunal,
  crearOpcionCampo,
  crearTerritorio,
  crearUsuario,
  crearViviendaCompleta,
  db,
  eliminarCampo,
  eliminarConsejoComunal,
  eliminarConsejoEnNeon,
  eliminarIntegrante,
  eliminarJefeFamilia,
  eliminarOpcionCampo,
  eliminarOpcionEnNeon,
  eliminarRegistro,
  eliminarTerritorio,
  eliminarTerritorioEnNeon,
  eliminarUsuario,
  eliminarUsuarioEnNeon,
  eliminarVivienda,
  encolarEliminacionConsejoNeon,
  encolarEliminacionTerritorioNeon,
  encolarEliminacionUsuarioNeon,
  guardarConfigCamposEnNeon,
  guardarConsejoEnNeon,
  guardarOpcionEnNeon,
  guardarTerritorioEnNeon,
  guardarUsuarioEnNeon,
  guardarViviendaEnNeon,
  insertarIntegrante,
  insertarJefeFamilia,
  insertarVivienda,
  listarCamposConOpciones,
  listarConfigCampos,
  listarConsejosComunales,
  listarConsejosComunalesConConteo,
  listarIngresosRecientes,
  listarOpcionesFormulario,
  listarTerritorios,
  listarUsuarios,
  marcarSoloLocalParaSincronizar,
  marcarUsuarioSincronizado,
  obtenerCamposFormulario,
  obtenerConsejoComunalPorId,
  obtenerEstadisticasIngresos,
  obtenerEstadisticasViviendas,
  obtenerExpedienteVivienda,
  obtenerIntegrantesPorVivienda,
  obtenerJefePorVivienda,
  obtenerOpcionCampoPorId,
  obtenerPersonaIndividual,
  obtenerPersonas,
  obtenerTerritorioPorId,
  obtenerUsuarioConHashPorId,
  obtenerUsuarioPorId,
  obtenerUsuarioPorUsuario,
  obtenerViviendaPorId,
  obtenerViviendas,
  sincronizarConNeon,
  sincronizarConfiguracionNeon,
  vaciarRegistros,
} from '../../nucleo/base-datos';
import {
  TipoCedula,
  cedulaNeonJefe,
  formatearFecha,
  mensajeQuery,
  normalizarCedula,
  normalizarCedulaPersona,
  normalizarFecha,
  normalizarNombre,
  normalizarSexoJefe,
  normalizarSexoOpcional,
  normalizarTipoCedula,
  parsearNumeroOpcional,
  textoCedula,
  validarFormatoCedula,
  valorSimple,
} from '../../nucleo/http';
import {
  TIPOS_TERRITORIO_VALIDOS,
  claveAdministracionValida,
  construirCensoFiltrado,
  esFechaFutura,
  generarCsvDesdeTabla,
  leerFiltrosPersonas,
  leerNuevoCampo,
  listarGruposOpciones,
  normalizarCabeceraCsv,
  normalizarFechaCsv,
  obtenerCampoAdministrable,
  obtenerRegistroEditable,
  parsearFilaCsv,
  propagarActualizacionNeon,
  propagarEliminacionNeon,
  renderizar,
  renderizarCampos,
  renderizarEdicion,
  tieneErrorValidacion,
  validarDefinicionCampo,
  validarRegistro,
} from './socioeconomico.servicio';

export function crearRouterSocioeconomico(): Router {
  const router = Router();
  router.use(requerirAuth);

  // Inicio del módulo Socioeconómico (Censo General)
  router.get('/censo', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configNeon = await sincronizarConfiguracionNeon();
      const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
      const error = typeof req.query.error === 'string' ? req.query.error.slice(0, 300) : null;
      const consejo = typeof req.query.consejo === 'string' ? req.query.consejo.trim() : '';
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const { grupos, stats } = construirCensoFiltrado({ consejo, q });

      return res.render('index', {
        ok,
        error,
        consejos: listarConsejosComunales(),
        filtros: { consejo, q },
        grupos,
        stats,
        statsSync: obtenerEstadisticasViviendas(),
        configNeon,
        esAdmin: (res.locals.usuario as any)?.rol === 'admin',
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/wizard', async (req: Request, res: Response) => {
    await sincronizarConfiguracionNeon();
    const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
    return res.render('wizard', {
      ok,
      error: null,
      formatearFecha,
      territorios: {
        estados: listarTerritorios({ tipo: 'estado' }),
        municipios: listarTerritorios({ tipo: 'municipio' }),
        parroquias: listarTerritorios({ tipo: 'parroquia' }),
        comunidades: listarTerritorios({ tipo: 'comunidad' }),
        etapas: listarTerritorios({ tipo: 'etapa' }),
        manzanas: listarTerritorios({ tipo: 'manzana' }),
      },
      configCampos: (() => {
        const mapa: Record<string, { visible: boolean; requerido: boolean }> = {};
        for (const campo of listarConfigCampos()) {
          mapa[campo.clave] = { visible: campo.visible, requerido: campo.requerido };
        }
        return mapa;
      })(),
      consejos: listarConsejosComunales(),
      opciones: listarOpcionesFormulario(),
    });
  });

  // Lectura OCR de planillas
  router.post('/api/escanear-planilla', async (req: Request, res: Response) => {
    try {
      const imagen =
        typeof req.body?.imagen === 'string'
          ? req.body.imagen
          : typeof req.body?.imagenBase64 === 'string'
            ? req.body.imagenBase64
            : '';

      if (!imagen) {
        return res.status(400).json({
          error: 'Debe enviar la imagen de la planilla en Base64 (campo «imagen»).',
        });
      }

      if (imagen.length > 14 * 1024 * 1024) {
        return res.status(413).json({
          error: 'La imagen supera el límite de 10 MB. Intente tomar la foto de nuevo.',
        });
      }

      const { escanearPlanilla } = require('../../../escaneo');
      const resultado = await escanearPlanilla({
        imagen,
        mimeType: typeof req.body?.mimeType === 'string' ? req.body.mimeType : undefined,
      });

      return res.json({ ok: true, ...resultado });
    } catch (error: any) {
      console.error('[escanear-planilla]', error);
      const mensaje = error?.message || 'No se pudo procesar la planilla.';
      const status = /vacía|imagen válida|no es una imagen/i.test(mensaje)
        ? 400
        : /tamaño máximo/i.test(mensaje)
          ? 413
          : 500;
      return res.status(status).json({ error: mensaje });
    }
  });

  router.get('/api/consejos-comunales', (_req: Request, res: Response) => {
    return res.json({ consejos: listarConsejosComunales() });
  });

  // Directorio de personas y fichas
  router.get('/personas', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const sexo = typeof req.query.sexo === 'string' ? req.query.sexo : '';
    const nivel = typeof req.query.nivel === 'string' ? req.query.nivel : '';
    const trabaja = typeof req.query.trabaja === 'string' ? req.query.trabaja : '';
    const parentesco = typeof req.query.parentesco === 'string' ? req.query.parentesco : '';
    const manzana = typeof req.query.manzana === 'string' ? req.query.manzana : '';
    const etapa = typeof req.query.etapa === 'string' ? req.query.etapa : '';
    const comunidad = typeof req.query.comunidad === 'string' ? req.query.comunidad : '';
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : '';

    const edadMin =
      req.query.edad_min !== undefined && req.query.edad_min !== '' ? Number(req.query.edad_min) : null;
    const edadMax =
      req.query.edad_max !== undefined && req.query.edad_max !== '' ? Number(req.query.edad_max) : null;

    const filtros = {
      q,
      sexo,
      nivel,
      trabaja,
      parentesco,
      manzana,
      etapa,
      comunidad,
      tipo,
      edadMin: Number.isFinite(edadMin as number) ? edadMin : null,
      edadMax: Number.isFinite(edadMax as number) ? edadMax : null,
    };

    const { personas, total } = obtenerPersonas(filtros);

    return res.render('personas', {
      personas,
      total,
      filtros,
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
      opciones: {
        comunidades: listarTerritorios({ tipo: 'comunidad' }),
        etapas: listarTerritorios({ tipo: 'etapa' }),
        manzanas: listarTerritorios({ tipo: 'manzana' }),
      },
    });
  });

  router.get('/personas/:tipo/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const tipo = valorSimple(req.params.tipo);
      const id = Number(req.params.id);

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).render('error', {
          codigo: 404,
          mensaje: 'La persona solicitada no existe.',
        });
      }

      const persona = obtenerPersonaIndividual(tipo, id);
      if (!persona) {
        return res.status(404).render('error', {
          codigo: 404,
          mensaje: 'La persona solicitada no existe.',
        });
      }

      const expediente = obtenerExpedienteVivienda(persona.vivienda_id);

      return res.render('persona', {
        persona,
        vivienda: expediente?.vivienda ?? null,
        jefe: expediente?.jefe ?? null,
        integrantes: expediente?.integrantes ?? [],
        ok: mensajeQuery(req, 'ok'),
        error: mensajeQuery(req, 'error'),
        formatearFecha,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post(
    '/personas/:tipo/:id/eliminar',
    requerirAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tipo = req.params.tipo;
        const id = Number(req.params.id);
        const volver =
          typeof req.query.volver === 'string' && req.query.volver.startsWith('/viviendas/')
            ? req.query.volver
            : '/personas';
        const destino = (clave: 'ok' | 'error', mensaje: string) =>
          `${volver}${volver.includes('?') ? '&' : '?'}${clave}=${encodeURIComponent(mensaje)}`;

        if ((tipo !== 'jefe' && tipo !== 'integrante') || !Number.isInteger(id) || id <= 0) {
          return res.redirect(303, destino('error', 'La persona solicitada no existe.'));
        }

        const persona = obtenerPersonaIndividual(tipo, id);
        if (!persona) {
          return res.redirect(303, destino('error', 'La persona solicitada no existe.'));
        }

        if (!claveAdministracionValida(req.body.clave, (res.locals.usuario as any)?.id)) {
          return res.redirect(303, destino('error', 'Contraseña incorrecta. La persona no se eliminó.'));
        }

        let mensaje: string;

        if (tipo === 'jefe') {
          const vivienda = obtenerViviendaPorId(persona.vivienda_id);
          const debePropagar = Boolean(vivienda?.sincronizado || vivienda?.sincronizar_neon);
          const cedula = debePropagar
            ? cedulaNeonJefe(persona.vivienda_id, persona.cedula_tipo, persona.cedula_numero)
            : null;
          if (!eliminarJefeFamilia(id)) {
            return res.redirect(303, destino('error', 'La persona ya no existe.'));
          }
          const sufijoNeon = debePropagar
            ? await propagarEliminacionNeon({
                cedula,
                viviendaId: persona.vivienda_id,
                tipo: 'jefe',
              })
            : '';
          mensaje = `Jefe de familia eliminado. La vivienda quedó sin jefe registrado.${sufijoNeon}`;
        } else {
          if (!eliminarIntegrante(id)) {
            return res.redirect(303, destino('error', 'La persona ya no existe.'));
          }
          const sufijoNeon = await propagarActualizacionNeon(persona.vivienda_id);
          mensaje = `Habitante eliminado correctamente.${sufijoNeon}`;
        }

        return res.redirect(303, destino('ok', mensaje));
      } catch (error) {
        return next(error);
      }
    }
  );

  // Viviendas
  router.get('/viviendas/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(404).render('error', {
          codigo: 404,
          mensaje: 'La vivienda solicitada no existe.',
        });
      }

      const expediente = obtenerExpedienteVivienda(id);
      if (!expediente) {
        return res.status(404).render('error', {
          codigo: 404,
          mensaje: 'La vivienda solicitada no existe.',
        });
      }

      const consejoLocal = expediente.vivienda?.consejo_comunal_id
        ? obtenerConsejoComunalPorId(expediente.vivienda.consejo_comunal_id)
        : null;

      return res.render('vivienda', {
        ...expediente,
        consejoNombre: consejoLocal?.nombre || null,
        ok: mensajeQuery(req, 'ok'),
        error: mensajeQuery(req, 'error'),
        formatearFecha,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post(
    '/viviendas/:id/eliminar',
    requerirAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        const destino = (clave: 'ok' | 'error', mensaje: string) =>
          `/censo?${clave}=${encodeURIComponent(mensaje)}#viviendas-dashboard`;

        if (!Number.isInteger(id) || id <= 0) {
          return res.redirect(303, destino('error', 'La vivienda solicitada no existe.'));
        }

        const vivienda = obtenerViviendaPorId(id);
        if (!vivienda) {
          return res.redirect(303, destino('error', 'La vivienda solicitada no existe.'));
        }

        if (!claveAdministracionValida(req.body.clave, (res.locals.usuario as any)?.id)) {
          return res.redirect(303, destino('error', 'Contraseña incorrecta. La vivienda no se eliminó.'));
        }

        const debePropagar = Boolean(vivienda.sincronizado || vivienda.sincronizar_neon);
        const jefe = debePropagar ? obtenerJefePorVivienda(id) : null;
        const cedula = jefe ? cedulaNeonJefe(id, jefe.cedula_tipo, jefe.cedula_numero) : null;

        if (!eliminarVivienda(id)) {
          return res.redirect(303, destino('error', 'La vivienda ya no existe.'));
        }

        const sufijoNeon = debePropagar
          ? await propagarEliminacionNeon({ cedula, viviendaId: id, tipo: 'vivienda' })
          : '';
        return res.redirect(
          303,
          destino('ok', `Vivienda eliminada junto con su grupo familiar.${sufijoNeon}`)
        );
      } catch (error) {
        return next(error);
      }
    }
  );

  router.get('/viviendas/:id/editar', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const expediente = Number.isInteger(id) && id > 0 ? obtenerExpedienteVivienda(id) : null;

      if (!expediente) {
        return res.status(404).render('error', {
          codigo: 404,
          mensaje: 'La vivienda solicitada no existe.',
        });
      }

      return res.render('vivienda-editar', {
        ...expediente,
        ok: mensajeQuery(req, 'ok'),
        error: mensajeQuery(req, 'error'),
        consejos: listarConsejosComunales({ soloActivos: false }),
        opciones: listarOpcionesFormulario(),
        territorios: {
          estados: listarTerritorios({ tipo: 'estado' }),
          municipios: listarTerritorios({ tipo: 'municipio' }),
          parroquias: listarTerritorios({ tipo: 'parroquia' }),
          comunidades: listarTerritorios({ tipo: 'comunidad' }),
          etapas: listarTerritorios({ tipo: 'etapa' }),
          manzanas: listarTerritorios({ tipo: 'manzana' }),
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/viviendas/:id/editar', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      const expediente = Number.isInteger(id) && id > 0 ? obtenerExpedienteVivienda(id) : null;

      if (!expediente) {
        return res.status(404).render('error', {
          codigo: 404,
          mensaje: 'La vivienda solicitada no existe.',
        });
      }

      const redirigirError = (mensaje: string) =>
        res.redirect(`/viviendas/${id}/editar?error=` + encodeURIComponent(mensaje));

      const comunidad = normalizarNombre(req.body.comunidad);
      const direccion = normalizarNombre(req.body.direccion);
      if (!comunidad || !direccion) {
        return redirigirError('Comunidad y dirección son obligatorias.');
      }

      const consejoRaw = valorSimple(req.body.consejo_comunal_id);
      const consejoNum = consejoRaw ? Number(consejoRaw) : null;
      const consejoComunalId =
        consejoNum && Number.isInteger(consejoNum) && obtenerConsejoComunalPorId(consejoNum)
          ? consejoNum
          : null;

      const esAnexo = ['1', 'on', 'true'].includes(valorSimple(req.body.es_anexo));
      const numeroAnexo = esAnexo ? normalizarNombre(req.body.numero_anexo) || null : null;

      if (expediente.jefe) {
        const cedulaTipo = normalizarTipoCedula(req.body.cedula_tipo);
        const cedulaNumero = cedulaTipo === 'S' ? null : normalizarCedula(req.body.cedula_numero) || null;
        const nombres = normalizarNombre(req.body.nombres);
        const apellidos = normalizarNombre(req.body.apellidos);

        if (!nombres || !apellidos) {
          return redirigirError('Los nombres y apellidos del jefe de familia son obligatorios.');
        }
        if (cedulaTipo !== 'S' && !validarFormatoCedula(`${cedulaTipo}-${cedulaNumero || ''}`)) {
          return redirigirError('Formato de cédula inválido (use 6 a 8 dígitos) o seleccione «Sin cédula».');
        }

        const fechaValida = normalizarFecha(req.body.fecha_nacimiento);
        if (fechaValida === false || (fechaValida && esFechaFutura(fechaValida))) {
          return redirigirError('La fecha de nacimiento del jefe de familia no es válida.');
        }

        const ingresoJefe = parsearNumeroOpcional(req.body.ingreso_mensual_bs);

        try {
          db.transaction(() => {
            actualizarVivienda({
              id,
              estado: normalizarNombre(req.body.estado) || undefined,
              municipio: normalizarNombre(req.body.municipio) || undefined,
              parroquia: normalizarNombre(req.body.parroquia) || undefined,
              comunidad,
              etapa: normalizarNombre(req.body.etapa) || null,
              manzana: normalizarNombre(req.body.manzana) || null,
              direccion,
              numero_casa: normalizarNombre(req.body.numero_casa) || null,
              consejo_comunal_id: consejoComunalId,
              es_anexo: esAnexo,
              numero_anexo: numeroAnexo,
              vivienda_principal_id: esAnexo ? expediente.vivienda?.vivienda_principal_id ?? null : null,
            });

            actualizarJefeFamilia({
              id: expediente.jefe!.id,
              cedula_tipo: cedulaTipo,
              cedula_numero: cedulaNumero,
              nombres,
              apellidos,
              fecha_nacimiento: fechaValida ? fechaValida.slice(0, 10) : undefined,
              sexo: valorSimple(req.body.sexo) === 'F' ? 'F' : 'M',
              telefono_movil: normalizarNombre(req.body.telefono_movil) || null,
              telefono_habitacion: normalizarNombre(req.body.telefono_habitacion) || null,
              telefono_trabajo: normalizarNombre(req.body.telefono_trabajo) || null,
              correo: valorSimple(req.body.correo) || null,
              nivel_instruccion: normalizarNombre(req.body.nivel_instruccion) || undefined,
              estado_civil: normalizarNombre(req.body.estado_civil) || undefined,
              profesion: normalizarNombre(req.body.profesion) || null,
              trabaja_actual: valorSimple(req.body.trabaja_actual) === 'No' ? 'No' : 'Sí',
              clasificacion_ingresos: normalizarNombre(req.body.clasificacion_ingresos) || undefined,
              frecuencia_ingresos: normalizarNombre(req.body.frecuencia_ingresos) || null,
              ingreso_mensual_bs: req.body.ingreso_mensual_bs !== undefined ? ingresoJefe : undefined,
            });
          })();
        } catch (error: any) {
          if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return redirigirError('La cédula ingresada ya pertenece a otro jefe de familia registrado.');
          }
          throw error;
        }
      } else {
        actualizarVivienda({
          id,
          estado: normalizarNombre(req.body.estado) || undefined,
          municipio: normalizarNombre(req.body.municipio) || undefined,
          parroquia: normalizarNombre(req.body.parroquia) || undefined,
          comunidad,
          etapa: normalizarNombre(req.body.etapa) || null,
          manzana: normalizarNombre(req.body.manzana) || null,
          direccion,
          numero_casa: normalizarNombre(req.body.numero_casa) || null,
          consejo_comunal_id: consejoComunalId,
          es_anexo: esAnexo,
          numero_anexo: numeroAnexo,
          vivienda_principal_id: esAnexo ? expediente.vivienda?.vivienda_principal_id ?? null : null,
        });
      }

      const sufijoNeon = await propagarActualizacionNeon(id);
      return res.redirect(
        `/viviendas/${id}?ok=` + encodeURIComponent(`Vivienda actualizada correctamente.${sufijoNeon}`)
      );
    } catch (error) {
      return next(error);
    }
  });

  router.get('/campos', requerirAdmin, (req: Request, res: Response) => {
    const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
    return renderizarCampos(res, { ok, nuevoCampo: leerNuevoCampo(req) });
  });

  router.get('/ubicacion', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 10000 });

      const viviendasConJefe = viviendas.map((v: any) => {
        const jefe = obtenerJefePorVivienda(v.id);
        return {
          ...v,
          jefe_nombres: jefe?.nombres ?? '',
          jefe_apellidos: jefe?.apellidos ?? '',
          jefe_cedula: jefe ? textoCedula(jefe.cedula_tipo, jefe.cedula_numero) : '',
        };
      });

      const porComunidad = new Map<string, any[]>();
      for (const v of viviendasConJefe) {
        const key = v.comunidad || 'Sin comunidad';
        if (!porComunidad.has(key)) porComunidad.set(key, []);
        porComunidad.get(key)!.push(v);
      }

      const agrupacion = Array.from(porComunidad.entries()).map(([comunidad, viviendasLista]) => {
        const porManzana = new Map<string, any[]>();
        for (const v of viviendasLista) {
          const key = v.manzana || 'Sin manzana';
          if (!porManzana.has(key)) porManzana.set(key, []);
          porManzana.get(key)!.push(v);
        }

        const manzanas = Array.from(porManzana.entries()).map(([manzana, viviendasManzana]) => {
          const porEtapa = new Map<string, any[]>();
          for (const v of viviendasManzana) {
            const key = v.etapa || 'Sin etapa';
            if (!porEtapa.has(key)) porEtapa.set(key, []);
            porEtapa.get(key)!.push(v);
          }

          const etapas = Array.from(porEtapa.entries()).map(([etapa, viviendasEtapa]) => ({
            etapa,
            total: viviendasEtapa.length,
            viviendas: viviendasEtapa.map((v: any) => ({
              id: v.id,
              direccion: v.direccion || '—',
              numero_casa: v.numero_casa || '—',
              jefe_nombres: v.jefe_nombres,
              jefe_apellidos: v.jefe_apellidos,
              jefe_cedula: v.jefe_cedula,
              fecha_registro: v.fecha_registro,
            })),
          }));

          return { manzana, total: viviendasManzana.length, etapas };
        });

        return { comunidad, total: viviendasLista.length, manzanas };
      });

      const ok = typeof req.query.ok === 'string' ? req.query.ok.slice(0, 200) : null;
      return res.render('ubicacion', {
        ok,
        error: null,
        agrupacion,
        stats: obtenerEstadisticasViviendas(),
        formatearFecha,
      });
    } catch (error) {
      return next(error);
    }
  });

  // Registros históricos y campos dinámicos
  router.post('/agregar', (_req: Request, res: Response) => {
    return res.redirect(
      303,
      '/wizard?ok=' + encodeURIComponent('Registro ahora se realiza por Vivienda. Use el asistente de 3 pasos.')
    );
  });

  router.get('/registros/:id/editar', (req: Request, res: Response, next: NextFunction) => {
    try {
      const registro = obtenerRegistroEditable(req.params.id);
      if (!registro) {
        return renderizar(res, {
          status: 404,
          error: 'El registro que intenta editar no existe.',
        });
      }
      return renderizarEdicion(res, { registro });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/registros/:id/editar', (req: Request, res: Response, next: NextFunction) => {
    try {
      const registro = obtenerRegistroEditable(req.params.id);
      if (!registro) {
        return renderizar(res, {
          status: 404,
          error: 'El registro que intenta editar no existe.',
        });
      }

      const valores = req.body;
      const validacion = validarRegistro(valores);

      if (tieneErrorValidacion(validacion)) {
        return renderizarEdicion(res, {
          status: 400,
          error: validacion.error,
          registro,
          valores,
        });
      }

      const { datos } = validacion;
      let extrasAnteriores: Record<string, unknown> = {};
      try {
        const parseado = JSON.parse(String(registro.datos_extras || '{}'));
        if (parseado && typeof parseado === 'object' && !Array.isArray(parseado)) {
          extrasAnteriores = parseado;
        }
      } catch {
        extrasAnteriores = {};
      }

      const extrasFinales: Record<string, unknown> = { ...extrasAnteriores };
      for (const campo of obtenerCamposFormulario()) {
        if (Object.prototype.hasOwnProperty.call(datos.extras, campo.clave)) {
          extrasFinales[campo.clave] = datos.extras[campo.clave];
        } else {
          delete extrasFinales[campo.clave];
        }
      }

      try {
        actualizarRegistro({ id: registro.id, ...datos, extras: extrasFinales });
      } catch (error: any) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return renderizarEdicion(res, {
            status: 409,
            error: `La cédula ${datos.cedula} ya está registrada en otro registro.`,
            registro,
            valores,
          });
        }
        throw error;
      }

      return res.redirect(
        303,
        `/censo?ok=${encodeURIComponent('Registro actualizado correctamente.')}#registro-${registro.id}`
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post(
    '/registros/:id/eliminar',
    requerirAdmin,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return renderizar(res, { status: 404, error: 'El registro que intenta eliminar no existe.' });
        }
        if (!claveAdministracionValida(req.body.clave, (res.locals.usuario as any)?.id)) {
          return renderizar(res, { status: 403, error: 'Contraseña incorrecta. El registro no se eliminó.' });
        }
        if (!eliminarRegistro(id)) {
          return renderizar(res, { status: 404, error: 'El registro ya no existe.' });
        }
        return res.redirect(
          303,
          `/censo?ok=${encodeURIComponent('Registro eliminado. Los IDs restantes se renumeraron.')}#registros`
        );
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post(
    '/registros/vaciar',
    requerirAdmin,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        if (!claveAdministracionValida(req.body.clave, (res.locals.usuario as any)?.id)) {
          return renderizar(res, { status: 403, error: 'Contraseña incorrecta. No se eliminó ningún registro.' });
        }
        const eliminados = vaciarRegistros();
        const mensaje = eliminados
          ? `Se eliminaron ${eliminados} registro${eliminados === 1 ? '' : 's'}. La numeración volverá a empezar en 1.`
          : 'La base de datos ya estaba vacía.';
        return res.redirect(303, `/censo?ok=${encodeURIComponent(mensaje)}#registros`);
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post('/campos', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
    try {
      const valoresCampo = req.body;
      const desdeAdministracion = valorSimple(valoresCampo.origen) === 'campos';
      const validacion = validarDefinicionCampo(valoresCampo);

      if (tieneErrorValidacion(validacion)) {
        if (desdeAdministracion) {
          return renderizarCampos(res, { status: 400, error: validacion.error, valoresCampo });
        }
        return res.status(400).render('index', {
          ...construirCensoFiltrado({}),
          ok: null,
          error: validacion.error,
          consejos: listarConsejosComunales(),
          filtros: { consejo: '', q: '' },
          statsSync: obtenerEstadisticasViviendas(),
          configNeon: null,
          esAdmin: (res.locals.usuario as any)?.rol === 'admin',
        });
      }

      const { datos } = validacion;
      const clave = crearCampo(datos);

      if (desdeAdministracion) {
        return res.redirect(
          303,
          `/campos?ok=${encodeURIComponent(`Campo "${datos.etiqueta}" agregado.`)}&nuevo=${encodeURIComponent(clave)}#campo-admin-${clave}`
        );
      }

      return res.redirect(
        303,
        `/censo?ok=${encodeURIComponent(`Campo "${datos.etiqueta}" agregado al formulario.`)}&nuevo=${encodeURIComponent(clave)}#campo-${clave}`
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post('/campos/:id/editar', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
    try {
      const campo = obtenerCampoAdministrable(req.params.id);
      if (!campo) {
        return renderizarCampos(res, { status: 404, error: 'El campo que intenta editar no existe.' });
      }
      const validacion = validarDefinicionCampo(req.body);
      if (tieneErrorValidacion(validacion)) {
        return renderizarCampos(res, {
          status: 400,
          errorEdicion: validacion.error,
          abrirEdicion: true,
          edicionId: campo.id,
          valoresEdicion: req.body,
        });
      }
      actualizarCampo({ id: campo.id, ...validacion.datos });
      return res.redirect(
        303,
        `/campos?ok=${encodeURIComponent(`Campo "${validacion.datos.etiqueta}" actualizado.`)}&nuevo=${encodeURIComponent(campo.clave)}#campo-admin-${campo.clave}`
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post('/campos/:id/estado', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
    try {
      const campo = obtenerCampoAdministrable(req.params.id);
      if (!campo) {
        return renderizarCampos(res, { status: 404, error: 'El campo que intenta modificar no existe.' });
      }
      const activo = cambiarEstadoCampo(campo.id);
      const mensaje = activo
        ? `Campo "${campo.etiqueta}" visible nuevamente.`
        : `Campo "${campo.etiqueta}" oculto del formulario.`;
      return res.redirect(
        303,
        `/campos?ok=${encodeURIComponent(mensaje)}&nuevo=${encodeURIComponent(campo.clave)}#campo-admin-${campo.clave}`
      );
    } catch (error) {
      return next(error);
    }
  });

  router.post('/campos/:id/eliminar', requerirAdmin, (req: Request, res: Response, next: NextFunction) => {
    try {
      const campo = obtenerCampoAdministrable(req.params.id);
      if (!campo) {
        return renderizarCampos(res, { status: 404, error: 'El campo que intenta eliminar no existe.' });
      }
      eliminarCampo(campo.id);
      return res.redirect(
        303,
        `/campos?ok=${encodeURIComponent(`Campo "${campo.etiqueta}" eliminado. Los datos ya registrados se conservan.`)}#campos`
      );
    } catch (error) {
      return next(error);
    }
  });

  // API REST - Viviendas e integrantes
  router.post('/api/viviendas', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { vivienda, jefe, integrantes } = req.body ?? {};
      if (!vivienda || typeof vivienda !== 'object' || !jefe || typeof jefe !== 'object') {
        return res.status(400).json({ error: 'Se requieren vivienda y jefe de familia.' });
      }

      const configCampos: Record<string, { visible?: boolean; requerido?: boolean }> = {};
      for (const campo of listarConfigCampos()) {
        configCampos[campo.clave] = { visible: campo.visible, requerido: campo.requerido };
      }
      const esVisible = (clave: string) => configCampos[clave]?.visible !== false;
      const esRequerido = (clave: string, defecto = true) =>
        esVisible(clave) && (configCampos[clave]?.requerido ?? defecto);

      const estado = normalizarNombre(vivienda.estado) || 'FALCÓN';
      const municipio = normalizarNombre(vivienda.municipio) || 'MIRANDA';
      const parroquia = normalizarNombre(vivienda.parroquia) || 'SAN ANTONIO';
      const comunidadInput = normalizarNombre(vivienda.comunidad);
      const direccionInput = normalizarNombre(vivienda.direccion);

      if (esRequerido('w-comunidad') && !comunidadInput) {
        return res.status(400).json({ error: 'La comunidad de la vivienda es obligatoria.' });
      }
      if (esRequerido('w-direccion') && !direccionInput) {
        return res.status(400).json({ error: 'La dirección de la vivienda es obligatoria.' });
      }

      const comunidad = comunidadInput || 'Sin especificar';
      const direccion = direccionInput || 'Sin especificar';

      const cedulaTipoRaw = esVisible('w-j-cedula-tipo') ? jefe.cedula_tipo : 'S';
      const cedulaTipo =
        !esVisible('w-j-cedula-numero') && !valorSimple(jefe.cedula_numero)
          ? 'S'
          : normalizarTipoCedula(cedulaTipoRaw);
      const cedulaNumero = cedulaTipo === 'S' ? null : normalizarCedula(jefe.cedula_numero) || null;
      if (cedulaTipo !== 'S' && !validarFormatoCedula(`${cedulaTipo}-${cedulaNumero || ''}`)) {
        return res.status(400).json({
          error: 'Formato de cédula inválido (V-12345678) o seleccione «Sin cédula».',
        });
      }

      const nombresJefeInput = normalizarNombre(jefe.nombres);
      const apellidosJefeInput = normalizarNombre(jefe.apellidos);
      if (esRequerido('w-j-nombres') && !nombresJefeInput) {
        return res.status(400).json({ error: 'Los nombres del jefe de familia son obligatorios.' });
      }
      if (esRequerido('w-j-apellidos') && !apellidosJefeInput) {
        return res.status(400).json({ error: 'Los apellidos del jefe de familia son obligatorios.' });
      }

      const fechaValida = normalizarFecha(jefe.fecha_nacimiento);
      if (fechaValida === false || (fechaValida && esFechaFutura(fechaValida))) {
        return res.status(400).json({ error: 'Fecha de nacimiento del jefe de familia inválida.' });
      }
      if (esRequerido('w-j-fecha-nacimiento') && !fechaValida) {
        return res.status(400).json({ error: 'La fecha de nacimiento del jefe de familia es obligatoria.' });
      }
      const fechaNacimientoJefe = fechaValida ? fechaValida.slice(0, 10) : '';

      const nivelInstruccionInput = normalizarNombre(jefe.nivel_instruccion);
      if (esRequerido('w-j-nivel-instruccion') && !nivelInstruccionInput) {
        return res.status(400).json({ error: 'El nivel de instrucción del jefe de familia es obligatorio.' });
      }

      const estadoCivilInput = normalizarNombre(jefe.estado_civil);
      if (esRequerido('w-j-estado-civil') && !estadoCivilInput) {
        return res.status(400).json({ error: 'El estado civil del jefe de familia es obligatorio.' });
      }

      const clasificacionIngresosInput = normalizarNombre(jefe.clasificacion_ingresos);
      if (esRequerido('w-j-clasificacion-ingresos') && !clasificacionIngresosInput) {
        return res.status(400).json({ error: 'La clasificación de ingresos del jefe de familia es obligatoria.' });
      }

      if (integrantes !== undefined && integrantes !== null && !Array.isArray(integrantes)) {
        return res.status(400).json({ error: 'El formato del grupo familiar es inválido.' });
      }

      const cedulasUsadas = new Set<string>();
      if (cedulaTipo !== 'S' && cedulaNumero) {
        cedulasUsadas.add(`${cedulaTipo}-${cedulaNumero}`);
      }

      const listaIntegrantesRaw = Array.isArray(integrantes) ? integrantes : [];
      const integrantesValidados: any[] = [];
      for (let index = 0; index < listaIntegrantesRaw.length; index++) {
        const integrante = listaIntegrantesRaw[index];
        if (!integrante || typeof integrante !== 'object') {
          return res.status(400).json({ error: `Los datos del integrante N.º ${index + 1} son inválidos.` });
        }

        const apellidosInt = normalizarNombre(integrante.apellidos);
        const nombresInt = normalizarNombre(integrante.nombres);
        const parentescoInt = normalizarNombre(integrante.parentesco);
        if (!apellidosInt || !nombresInt || !parentescoInt) {
          return res.status(400).json({
            error: `El integrante N.º ${index + 1} debe tener apellidos, nombres y parentesco.`,
          });
        }

        const fechaInt = normalizarFecha(integrante.fecha_nacimiento);
        if (fechaInt === false || (fechaInt && esFechaFutura(fechaInt))) {
          return res.status(400).json({
            error: `La fecha de nacimiento del integrante N.º ${index + 1} es inválida.`,
          });
        }

        const cedulaInt = normalizarCedulaPersona(integrante.cedula_tipo, integrante.cedula_numero);
        if (cedulaInt.cedula_tipo && cedulaInt.cedula_tipo !== 'S') {
          if (!validarFormatoCedula(`${cedulaInt.cedula_tipo}-${cedulaInt.cedula_numero || ''}`)) {
            return res.status(400).json({
              error: `La cédula del integrante N.º ${index + 1} es inválida (use 6 a 8 dígitos o «Sin cédula»).`,
            });
          }
          const claveCedulaInt = `${cedulaInt.cedula_tipo}-${cedulaInt.cedula_numero}`;
          if (cedulasUsadas.has(claveCedulaInt)) {
            return res.status(400).json({
              error: `La cédula ${claveCedulaInt} está duplicada dentro del mismo grupo familiar.`,
            });
          }
          cedulasUsadas.add(claveCedulaInt);
        }

        integrantesValidados.push({
          numero: index + 1,
          apellidos: apellidosInt,
          nombres: nombresInt,
          ...cedulaInt,
          fecha_nacimiento: fechaInt ? fechaInt.slice(0, 10) : null,
          sexo: normalizarSexoOpcional(integrante.sexo),
          parentesco: parentescoInt,
          nivel_instruccion: normalizarNombre(integrante.nivel_instruccion) || null,
          profesion: normalizarNombre(integrante.profesion) || null,
          ingreso_mensual: parsearNumeroOpcional(integrante.ingreso_mensual),
        });
      }

      const consejoId = Number(vivienda.consejo_comunal_id);
      const consejoComunalId =
        Number.isInteger(consejoId) && consejoId > 0 && obtenerConsejoComunalPorId(consejoId)
          ? consejoId
          : null;

      const principalId = Number(vivienda.vivienda_principal_id);
      const viviendaPrincipalId =
        Number.isInteger(principalId) && principalId > 0 && obtenerViviendaPorId(principalId)
          ? principalId
          : null;
      const esAnexo =
        vivienda.es_anexo === true ||
        vivienda.es_anexo === 1 ||
        vivienda.es_anexo === '1' ||
        vivienda.es_anexo === 'true';

      const ingresoJefeValor = parsearNumeroOpcional(jefe.ingreso_mensual_bs);
      const trabajaActual: 'Sí' | 'No' =
        jefe.trabaja_actual === true ||
        jefe.trabaja_actual === 1 ||
        jefe.trabaja_actual === '1' ||
        /^s[ií]$/i.test(String(jefe.trabaja_actual ?? ''))
          ? 'Sí'
          : 'No';

      try {
        const resultado = crearViviendaCompleta({
          vivienda: {
            estado,
            municipio,
            parroquia,
            comunidad,
            etapa: normalizarNombre(vivienda.etapa) || null,
            manzana: normalizarNombre(vivienda.manzana) || null,
            direccion,
            numero_casa: normalizarNombre(vivienda.numero_casa) || null,
            consejo_comunal_id: consejoComunalId,
            es_anexo: esAnexo,
            numero_anexo: esAnexo ? normalizarNombre(vivienda.numero_anexo) || null : null,
            vivienda_principal_id: esAnexo ? viviendaPrincipalId : null,
            sincronizar_neon: vivienda.sincronizar_neon !== false,
          },
          jefe: {
            cedula_tipo: cedulaTipo,
            cedula_numero: cedulaNumero,
            nombres: nombresJefeInput || 'Sin especificar',
            apellidos: apellidosJefeInput || 'Sin especificar',
            fecha_nacimiento: fechaNacimientoJefe,
            sexo: normalizarSexoJefe(jefe.sexo),
            telefono_movil: normalizarNombre(jefe.telefono_movil) || null,
            telefono_habitacion: normalizarNombre(jefe.telefono_habitacion) || null,
            telefono_trabajo: normalizarNombre(jefe.telefono_trabajo) || null,
            correo: valorSimple(jefe.correo) || null,
            nivel_instruccion: nivelInstruccionInput || 'Ninguno',
            estado_civil: estadoCivilInput || 'Soltero/a',
            profesion: normalizarNombre(jefe.profesion) || null,
            trabaja_actual: trabajaActual,
            clasificacion_ingresos: clasificacionIngresosInput || 'Mensual',
            frecuencia_ingresos: normalizarNombre(jefe.frecuencia_ingresos) || null,
            ingreso_mensual_bs: ingresoJefeValor,
          },
          integrantes: integrantesValidados,
        });

        let neon: any = null;
        if (vivienda.sincronizar_neon !== false) {
          neon = await guardarViviendaEnNeon(resultado.viviendaId);
          if (!neon.ok) console.warn('[neon]', neon.mensaje);
        }

        return res.status(201).json({
          ok: true,
          viviendaId: resultado.viviendaId,
          jefeId: resultado.jefeId,
          integrantesIds: resultado.integrantesIds,
          neon,
          mensaje: 'Vivienda registrada correctamente.',
        });
      } catch (error: any) {
        if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          return res.status(409).json({ error: 'La cédula del jefe de familia ya está registrada.' });
        }
        if (typeof error?.code === 'string' && error.code.startsWith('SQLITE_CONSTRAINT')) {
          return res.status(400).json({
            error: 'Verifique que los datos obligatorios de la vivienda y la familia sean válidos.',
          });
        }
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/viviendas', (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const { viviendas, total } = obtenerViviendas({ q, page, limit });

      const viviendasConJefe = viviendas.map((v: any) => {
        const jefe = obtenerJefePorVivienda(v.id);
        return {
          ...v,
          jefe_nombres: jefe?.nombres ?? '',
          jefe_apellidos: jefe?.apellidos ?? '',
          jefe_cedula: jefe ? textoCedula(jefe.cedula_tipo, jefe.cedula_numero) : '',
          cedula_tipo: jefe?.cedula_tipo ?? '',
          cedula_numero: jefe?.cedula_numero ?? '',
        };
      });

      return res.json({
        viviendas: viviendasConJefe,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/viviendas/buscar-principal', (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const viviendas = q ? buscarViviendasPrincipales(q) : [];
    return res.json({ viviendas });
  });

  router.get('/api/viviendas/agrupacion', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 10000 });
      const viviendasConJefe = viviendas.map((v: any) => {
        const jefe = obtenerJefePorVivienda(v.id);
        return {
          ...v,
          jefe_nombres: jefe?.nombres ?? '',
          jefe_apellidos: jefe?.apellidos ?? '',
          jefe_cedula: jefe ? textoCedula(jefe.cedula_tipo, jefe.cedula_numero) : '',
        };
      });

      const porComunidad = new Map<string, any[]>();
      for (const v of viviendasConJefe) {
        const key = v.comunidad || 'Sin comunidad';
        if (!porComunidad.has(key)) porComunidad.set(key, []);
        porComunidad.get(key)!.push(v);
      }

      const resultado = Array.from(porComunidad.entries()).map(([comunidad, viviendasLista]) => {
        const porManzana = new Map<string, any[]>();
        for (const v of viviendasLista) {
          const key = v.manzana || 'Sin manzana';
          if (!porManzana.has(key)) porManzana.set(key, []);
          porManzana.get(key)!.push(v);
        }

        const manzanas = Array.from(porManzana.entries()).map(([manzana, viviendasManzana]) => {
          const porEtapa = new Map<string, any[]>();
          for (const v of viviendasManzana) {
            const key = v.etapa || 'Sin etapa';
            if (!porEtapa.has(key)) porEtapa.set(key, []);
            porEtapa.get(key)!.push(v);
          }

          const etapas = Array.from(porEtapa.entries()).map(([etapa, viviendasEtapa]) => ({
            etapa,
            total: viviendasEtapa.length,
            viviendas: viviendasEtapa.map((v: any) => ({
              id: v.id,
              direccion: v.direccion || '—',
              numero_casa: v.numero_casa || '—',
              jefe_nombres: v.jefe_nombres,
              jefe_apellidos: v.jefe_apellidos,
              jefe_cedula: v.jefe_cedula,
              fecha_registro: v.fecha_registro,
            })),
          }));

          return { manzana, total: viviendasManzana.length, etapas };
        });

        return { comunidad, total: viviendasLista.length, manzanas };
      });

      return res.json({ agrupacion: resultado, total: viviendasConJefe.length });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/personas', (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      const like = `%${q}%`;
      const personas: any[] = [];

      const viviendas = db
        .prepare(`
          SELECT v.id as vivienda_id, v.comunidad, v.etapa, v.manzana, v.direccion, v.numero_casa,
                 j.id as jefe_id, j.cedula_tipo as jefe_cedula_tipo, j.cedula_numero as jefe_cedula_numero,
                 j.nombres as jefe_nombres, j.apellidos as jefe_apellidos,
                 j.fecha_nacimiento as jefe_fecha_nacimiento, j.edad as jefe_edad, j.sexo as jefe_sexo,
                 j.telefono_movil as jefe_telefono_movil, j.telefono_habitacion as jefe_telefono_habitacion,
                 j.telefono_trabajo as jefe_telefono_trabajo, j.correo as jefe_correo,
                 j.nivel_instruccion as jefe_nivel_instruccion, j.estado_civil as jefe_estado_civil,
                 j.profesion as jefe_profesion, j.trabaja_actual as jefe_trabaja_actual,
                 j.clasificacion_ingresos as jefe_clasificacion_ingresos, j.frecuencia_ingresos as jefe_frecuencia_ingresos
          FROM viviendas v
          LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
          WHERE v.comunidad LIKE ? OR v.manzana LIKE ? OR v.etapa LIKE ? OR v.direccion LIKE ? OR v.numero_casa LIKE ?
             OR j.nombres LIKE ? OR j.apellidos LIKE ? OR j.cedula_numero LIKE ?
          ORDER BY v.id, j.id
        `)
        .all(like, like, like, like, like, like, like, like) as any[];

      for (const v of viviendas) {
        if (v.jefe_id) {
          personas.push({
            tipo: 'Jefe de Familia',
            vivienda_id: v.vivienda_id,
            comunidad: v.comunidad,
            etapa: v.etapa || '—',
            manzana: v.manzana || '—',
            direccion: v.direccion,
            numero_casa: v.numero_casa || '—',
            cedula_tipo: v.jefe_cedula_tipo || '',
            cedula_numero: v.jefe_cedula_numero || '',
            nombres: v.jefe_nombres,
            apellidos: v.jefe_apellidos,
            fecha_nacimiento: v.jefe_fecha_nacimiento,
            edad: v.jefe_edad,
            sexo: v.jefe_sexo,
            telefono_movil: v.jefe_telefono_movil,
            telefono_habitacion: v.jefe_telefono_habitacion,
            telefono_trabajo: v.jefe_telefono_trabajo,
            correo: v.jefe_correo,
            nivel_instruccion: v.jefe_nivel_instruccion,
            estado_civil: v.jefe_estado_civil,
            profesion: v.jefe_profesion,
            trabaja_actual: v.jefe_trabaja_actual,
            clasificacion_ingresos: v.jefe_clasificacion_ingresos,
            frecuencia_ingresos: v.jefe_frecuencia_ingresos,
            parentesco: 'Jefe de Familia',
          });
        }

        const integrantes = db
          .prepare('SELECT * FROM integrantes_grupo_familiar WHERE vivienda_id = ? ORDER BY numero')
          .all(v.vivienda_id) as any[];

        for (const inc of integrantes) {
          personas.push({
            tipo: 'Integrante',
            vivienda_id: v.vivienda_id,
            comunidad: v.comunidad,
            etapa: v.etapa || '—',
            manzana: v.manzana || '—',
            direccion: v.direccion,
            numero_casa: v.numero_casa || '—',
            cedula_tipo: inc.cedula_tipo || '',
            cedula_numero: inc.cedula_numero || '',
            nombres: inc.nombres,
            apellidos: inc.apellidos,
            fecha_nacimiento: inc.fecha_nacimiento,
            edad: inc.edad,
            sexo: inc.sexo,
            telefono_movil: null,
            telefono_habitacion: null,
            telefono_trabajo: null,
            correo: null,
            nivel_instruccion: inc.nivel_instruccion,
            estado_civil: null,
            profesion: inc.profesion,
            trabaja_actual: null,
            clasificacion_ingresos: null,
            frecuencia_ingresos: null,
            parentesco: inc.parentesco,
          });
        }
      }

      const resultadoFiltrado = q
        ? personas.filter(
            (p) =>
              (p.nombres && p.nombres.toLowerCase().includes(q.toLowerCase())) ||
              (p.apellidos && p.apellidos.toLowerCase().includes(q.toLowerCase())) ||
              (p.cedula_numero && p.cedula_numero.includes(q)) ||
              (p.comunidad && p.comunidad.toLowerCase().includes(q.toLowerCase())) ||
              (p.manzana && p.manzana.toLowerCase().includes(q.toLowerCase())) ||
              (p.etapa && p.etapa.toLowerCase().includes(q.toLowerCase())) ||
              (p.direccion && p.direccion.toLowerCase().includes(q.toLowerCase()))
          )
        : personas;

      return res.json({
        personas: resultadoFiltrado,
        total: resultadoFiltrado.length,
        jefes: personas.filter((p) => p.tipo === 'Jefe de Familia').length,
        integrantes: personas.filter((p) => p.tipo === 'Integrante').length,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/viviendas/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de vivienda inválido.' });
      }
      const expediente = obtenerExpedienteVivienda(id);
      if (!expediente) return res.status(404).json({ error: 'Vivienda no encontrada.' });
      return res.json(expediente);
    } catch (error) {
      return next(error);
    }
  });

  router.put('/api/viviendas/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ID de vivienda inválido.' });
      }

      const expedienteActual = obtenerExpedienteVivienda(id);
      if (!expedienteActual) {
        return res.status(404).json({ error: 'Vivienda no encontrada.' });
      }

      const { vivienda, jefe, integrantes } = req.body ?? {};
      if (vivienda) {
        const consejoId = Number(vivienda.consejo_comunal_id);
        const consejoValido =
          vivienda.consejo_comunal_id === undefined
            ? undefined
            : Number.isInteger(consejoId) && consejoId > 0 && obtenerConsejoComunalPorId(consejoId)
              ? consejoId
              : null;

        actualizarVivienda({
          id,
          estado: vivienda.estado,
          municipio: vivienda.municipio,
          parroquia: vivienda.parroquia,
          comunidad: vivienda.comunidad,
          etapa: vivienda.etapa,
          manzana: vivienda.manzana,
          direccion: vivienda.direccion,
          numero_casa: vivienda.numero_casa,
          consejo_comunal_id: consejoValido,
          es_anexo: vivienda.es_anexo,
          numero_anexo: vivienda.numero_anexo,
        });
      }

      if (jefe && expedienteActual.jefe) {
        const cedulaJefe = normalizarCedulaPersona(jefe.cedula_tipo, jefe.cedula_numero);
        if (
          cedulaJefe.cedula_tipo &&
          cedulaJefe.cedula_tipo !== 'S' &&
          !validarFormatoCedula(`${cedulaJefe.cedula_tipo}-${cedulaJefe.cedula_numero || ''}`)
        ) {
          return res.status(400).json({ error: 'Formato de cédula inválido.' });
        }
        try {
          actualizarJefeFamilia({
            id: expedienteActual.jefe.id,
            cedula_tipo: (cedulaJefe.cedula_tipo || 'V') as TipoCedula,
            cedula_numero: cedulaJefe.cedula_numero,
            nombres: jefe.nombres,
            apellidos: jefe.apellidos,
            fecha_nacimiento: jefe.fecha_nacimiento,
            sexo: jefe.sexo,
            telefono_movil: jefe.telefono_movil,
            telefono_habitacion: jefe.telefono_habitacion,
            telefono_trabajo: jefe.telefono_trabajo,
            correo: jefe.correo,
            nivel_instruccion: jefe.nivel_instruccion,
            estado_civil: jefe.estado_civil,
            profesion: jefe.profesion,
            trabaja_actual: jefe.trabaja_actual,
            clasificacion_ingresos: jefe.clasificacion_ingresos,
            frecuencia_ingresos: jefe.frecuencia_ingresos,
            ingreso_mensual_bs:
              jefe.ingreso_mensual_bs !== undefined
                ? parsearNumeroOpcional(jefe.ingreso_mensual_bs)
                : undefined,
          });
        } catch (error: any) {
          if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            return res.status(409).json({ error: 'La cédula del jefe de familia ya está registrada.' });
          }
          throw error;
        }
      }

      if (Array.isArray(integrantes)) {
        const existentes = obtenerIntegrantesPorVivienda(id);
        const idsExistentes = new Set(existentes.map((e: any) => e.id));
        const idsEnviados = new Set<number>();

        for (const integrante of integrantes) {
          const cedula = normalizarCedulaPersona(integrante.cedula_tipo, integrante.cedula_numero);
          if (integrante.id && idsExistentes.has(integrante.id)) {
            actualizarIntegrante({
              id: integrante.id,
              numero: integrante.numero,
              apellidos: integrante.apellidos,
              nombres: integrante.nombres,
              cedula_tipo: cedula.cedula_tipo,
              cedula_numero: cedula.cedula_numero,
              fecha_nacimiento: integrante.fecha_nacimiento || null,
              sexo: normalizarSexoOpcional(integrante.sexo),
              parentesco: integrante.parentesco,
              nivel_instruccion: integrante.nivel_instruccion || null,
              profesion: integrante.profesion || null,
              ingreso_mensual:
                integrante.ingreso_mensual !== undefined
                  ? parsearNumeroOpcional(integrante.ingreso_mensual)
                  : undefined,
            });
            idsEnviados.add(integrante.id);
          } else {
            const nuevoId = insertarIntegrante({
              vivienda_id: id,
              numero: integrante.numero ?? existentes.length + 1,
              apellidos: integrante.apellidos,
              nombres: integrante.nombres,
              cedula_tipo: cedula.cedula_tipo,
              cedula_numero: cedula.cedula_numero,
              fecha_nacimiento: integrante.fecha_nacimiento || null,
              sexo: normalizarSexoOpcional(integrante.sexo),
              parentesco: integrante.parentesco,
              nivel_instruccion: integrante.nivel_instruccion || null,
              profesion: integrante.profesion || null,
              ingreso_mensual: parsearNumeroOpcional(integrante.ingreso_mensual),
            });
            idsEnviados.add(nuevoId);
          }
        }

        for (const existente of existentes) {
          if (!idsEnviados.has(existente.id)) eliminarIntegrante(existente.id);
        }
      }

      const sufijoNeon = await propagarActualizacionNeon(id);
      return res.json({
        ok: true,
        expediente: obtenerExpedienteVivienda(id),
        mensaje: `Vivienda actualizada.${sufijoNeon}`,
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete(
    '/api/viviendas/:id',
    requerirAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'ID de vivienda inválido.' });
        }
        if (!claveAdministracionValida(req.body.clave || req.query.clave, (res.locals.usuario as any)?.id)) {
          return res.status(403).json({ error: 'Contraseña de administración requerida.' });
        }

        const vivienda = obtenerViviendaPorId(id);
        if (!vivienda) return res.status(404).json({ error: 'Vivienda no encontrada.' });

        const debePropagar = Boolean(vivienda.sincronizado || vivienda.sincronizar_neon);
        const jefe = debePropagar ? obtenerJefePorVivienda(id) : null;
        const cedula = jefe ? cedulaNeonJefe(id, jefe.cedula_tipo, jefe.cedula_numero) : null;

        if (!eliminarVivienda(id)) {
          return res.status(404).json({ error: 'Vivienda no encontrada.' });
        }

        const sufijoNeon = debePropagar
          ? await propagarEliminacionNeon({ cedula, viviendaId: id, tipo: 'vivienda' })
          : '';
        return res.json({ ok: true, mensaje: `Vivienda eliminada.${sufijoNeon}` });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.patch(
    '/api/viviendas/:id/sincronizar-neon',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: 'ID de vivienda inválido.' });
        }
        const { sincronizar_neon } = req.body;
        if (typeof sincronizar_neon !== 'boolean') {
          return res.status(400).json({ error: 'El campo sincronizar_neon es requerido (booleano).' });
        }
        if (!cambiarSincronizarNeon(id, sincronizar_neon)) {
          return res.status(404).json({ error: 'Vivienda no encontrada.' });
        }

        const vivienda = obtenerViviendaPorId(id);
        return res.json({
          ok: true,
          mensaje: sincronizar_neon
            ? 'La vivienda se subirá a Neon en la próxima sincronización.'
            : 'La vivienda se mantendrá solo en local.',
          vivienda: { id: vivienda!.id, sincronizar_neon: vivienda!.sincronizar_neon },
        });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.post(
    '/api/viviendas/:viviendaId/integrantes',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const viviendaId = Number(req.params.viviendaId);
        if (!Number.isInteger(viviendaId) || viviendaId <= 0) {
          return res.status(400).json({ error: 'ID de vivienda inválido.' });
        }
        const {
          numero,
          apellidos,
          nombres,
          cedula_tipo,
          cedula_numero,
          fecha_nacimiento,
          sexo,
          parentesco,
          nivel_instruccion,
          profesion,
        } = req.body;

        if (!apellidos || !nombres || !parentesco) {
          return res.status(400).json({ error: 'Apellidos, nombres y parentesco son obligatorios.' });
        }

        const existentes = obtenerIntegrantesPorVivienda(viviendaId);
        const num = numero ?? existentes.length + 1;
        const cedula = normalizarCedulaPersona(cedula_tipo, cedula_numero);

        const id = insertarIntegrante({
          vivienda_id: viviendaId,
          numero: num,
          apellidos,
          nombres,
          cedula_tipo: cedula.cedula_tipo,
          cedula_numero: cedula.cedula_numero,
          fecha_nacimiento: fecha_nacimiento || null,
          sexo: normalizarSexoOpcional(sexo),
          parentesco,
          nivel_instruccion: nivel_instruccion || null,
          profesion: profesion || null,
        });

        return res.status(201).json({ ok: true, id, mensaje: 'Integrante agregado.' });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.put(
    '/api/viviendas/:viviendaId/integrantes/:integranteId',
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const integranteId = Number(req.params.integranteId);
        if (!Number.isInteger(integranteId) || integranteId <= 0) {
          return res.status(400).json({ error: 'ID de integrante inválido.' });
        }
        const {
          numero,
          apellidos,
          nombres,
          cedula_tipo,
          cedula_numero,
          fecha_nacimiento,
          sexo,
          parentesco,
          nivel_instruccion,
          profesion,
        } = req.body;
        const cedula = normalizarCedulaPersona(cedula_tipo, cedula_numero);

        if (
          !actualizarIntegrante({
            id: integranteId,
            numero,
            apellidos,
            nombres,
            cedula_tipo: cedula.cedula_tipo,
            cedula_numero: cedula.cedula_numero,
            fecha_nacimiento,
            sexo,
            parentesco,
            nivel_instruccion,
            profesion,
          })
        ) {
          return res.status(404).json({ error: 'Integrante no encontrado.' });
        }

        return res.json({ ok: true, mensaje: 'Integrante actualizado.' });
      } catch (error) {
        return next(error);
      }
    }
  );

  router.delete(
    '/api/viviendas/:viviendaId/integrantes/:integranteId',
    requerirAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const viviendaId = Number(req.params.viviendaId);
        const integranteId = Number(req.params.integranteId);
        if (!Number.isInteger(integranteId) || integranteId <= 0) {
          return res.status(400).json({ error: 'ID de integrante inválido.' });
        }
        if (!eliminarIntegrante(integranteId)) {
          return res.status(404).json({ error: 'Integrante no encontrado.' });
        }
        const sufijoNeon =
          Number.isInteger(viviendaId) && viviendaId > 0
            ? await propagarActualizacionNeon(viviendaId)
            : '';
        return res.json({ ok: true, mensaje: `Integrante eliminado.${sufijoNeon}` });
      } catch (error) {
        return next(error);
      }
    }
  );

  // Panel de administración (comparte usuarios en BD)
  router.get('/admin', requerirAdmin, (_req: Request, res: Response) => {
    const ingresos = obtenerEstadisticasIngresos();
    return res.render('admin/index', {
      stats: {
        viviendas: contarViviendas(),
        personas: contarPersonas(),
        usuarios: listarUsuarios().length,
        personasIngresaron: ingresos.personas_unicas,
        totalIngresos: ingresos.total_ingresos,
        ingresosHoy: ingresos.ingresos_hoy,
        activosAhora: ingresos.activos_ahora,
        comunidades: listarTerritorios({ tipo: 'comunidad' }).length,
        manzanas: listarTerritorios({ tipo: 'manzana' }).length,
        campos: listarConfigCampos().length,
        consejos: listarConsejosComunales({ soloActivos: false }).length,
        opciones: listarCamposConOpciones().length,
      },
    });
  });

  router.get('/admin/consejos', requerirAdmin, async (req: Request, res: Response) => {
    const configNeon = await sincronizarConfiguracionNeon();
    return res.render('admin/consejos', {
      consejos: listarConsejosComunalesConConteo({ soloActivos: false }),
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
      configNeon,
    });
  });

  router.post('/admin/consejos', requerirAdmin, async (req: Request, res: Response) => {
    const nombre = normalizarNombre(req.body.nombre);
    const sector = normalizarNombre(req.body.sector) || null;
    const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));

    if (!nombre) {
      return res.redirect('/admin/consejos?error=' + encodeURIComponent('El nombre del consejo es obligatorio.'));
    }

    const repetido = listarConsejosComunales({ soloActivos: false }).some(
      (consejo: any) => consejo.nombre.toLowerCase() === nombre.toLowerCase()
    );
    if (repetido) {
      return res.redirect('/admin/consejos?error=' + encodeURIComponent('Ya existe un consejo comunal con ese nombre.'));
    }

    try {
      const neon = await guardarConsejoEnNeon({ nombre, sector, activo });
      crearConsejoComunal({ nombre, sector, activo, pendiente_neon: !neon.ok });
      const mensaje = neon.ok
        ? 'Consejo comunal creado y sincronizado con Neon.'
        : `Consejo guardado localmente (pendiente de sincronizar). ${neon.mensaje}`;
      return res.redirect('/admin/consejos?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/consejos?error=' + encodeURIComponent('No se pudo crear el consejo comunal.'));
    }
  });

  router.post('/admin/consejos/:id/editar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerConsejoComunalPorId(id);
      if (!actual) {
        return res.redirect('/admin/consejos?error=' + encodeURIComponent('Consejo comunal no encontrado.'));
      }

      const nombre = normalizarNombre(req.body.nombre);
      const sector = normalizarNombre(req.body.sector) || null;
      const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));
      if (!nombre) {
        return res.redirect('/admin/consejos?error=' + encodeURIComponent('El nombre del consejo es obligatorio.'));
      }

      const repetido = listarConsejosComunales({ soloActivos: false }).some(
        (consejo: any) => consejo.id !== id && consejo.nombre.toLowerCase() === nombre.toLowerCase()
      );
      if (repetido) {
        return res.redirect('/admin/consejos?error=' + encodeURIComponent('Ya existe otro consejo con ese nombre.'));
      }

      const neon = await guardarConsejoEnNeon({
        nombre,
        nombreOriginal: actual.nombre,
        sector,
        activo,
      });
      actualizarConsejoComunal({
        id,
        nombre,
        sector,
        activo,
        pendiente_neon: !neon.ok,
        nombre_original_neon: actual.nombre,
      });

      const mensaje = neon.ok
        ? 'Consejo comunal actualizado en Neon.'
        : `Consejo actualizado localmente (pendiente de sincronizar). ${neon.mensaje}`;
      return res.redirect('/admin/consejos?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/consejos?error=' + encodeURIComponent('No se pudo actualizar el consejo comunal.'));
    }
  });

  router.post('/admin/consejos/:id/estado', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerConsejoComunalPorId(id);
      if (!actual) {
        return res.redirect('/admin/consejos?error=' + encodeURIComponent('Consejo comunal no encontrado.'));
      }

      const activo = !actual.activo;
      const neon = await guardarConsejoEnNeon({
        nombre: actual.nombre,
        nombreOriginal: actual.nombre,
        sector: actual.sector,
        activo,
      });
      actualizarConsejoComunal({
        id,
        nombre: actual.nombre,
        sector: actual.sector,
        activo,
        pendiente_neon: !neon.ok,
        nombre_original_neon: actual.nombre,
      });

      const mensaje = neon.ok
        ? `Consejo ${activo ? 'activado' : 'desactivado'} en Neon.`
        : `Estado actualizado localmente (pendiente de sincronizar). ${neon.mensaje}`;
      return res.redirect('/admin/consejos?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/consejos?error=' + encodeURIComponent('No se pudo cambiar el estado del consejo.'));
    }
  });

  router.post('/admin/consejos/:id/eliminar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = Number.isInteger(id) && id > 0 ? obtenerConsejoComunalPorId(id) : null;
      if (!actual) {
        return res.redirect('/admin/consejos?error=' + encodeURIComponent('Consejo comunal no encontrado.'));
      }

      const neon = await eliminarConsejoEnNeon(actual.nombre);
      if (!neon.ok) {
        encolarEliminacionConsejoNeon(actual.nombre);
      }
      eliminarConsejoComunal(id);

      const mensaje = neon.ok
        ? `Consejo comunal «${actual.nombre}» eliminado correctamente.`
        : `Consejo comunal «${actual.nombre}» eliminado localmente (se sincronizará con Neon luego). ${neon.mensaje}`;
      return res.redirect('/admin/consejos?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/consejos?error=' + encodeURIComponent('No se pudo eliminar el consejo comunal.'));
    }
  });

  router.get('/admin/opciones', requerirAdmin, async (req: Request, res: Response) => {
    const configNeon = await sincronizarConfiguracionNeon();
    return res.render('admin/opciones', {
      grupos: listarGruposOpciones(),
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
      configNeon,
    });
  });

  router.post('/admin/opciones', requerirAdmin, async (req: Request, res: Response) => {
    const campo = valorSimple(req.body.campo).toLowerCase();
    const valor = normalizarNombre(req.body.valor);
    const etiqueta = normalizarNombre(req.body.etiqueta) || null;
    const orden = Number(req.body.orden) || 0;
    const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));

    if (!/^[a-z0-9_]{2,60}$/.test(campo) || !valor) {
      return res.redirect(
        '/admin/opciones?error=' + encodeURIComponent('Indique un campo técnico válido y el valor de la opción.')
      );
    }

    try {
      const neon = await guardarOpcionEnNeon({ campo, valor, etiqueta, orden, activo });
      crearOpcionCampo({ campo, valor, etiqueta, orden, activo });
      const mensaje = neon.ok
        ? 'Opción creada y sincronizada con Neon.'
        : `Opción guardada localmente. ${neon.mensaje}`;
      return res.redirect('/admin/opciones?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/opciones?error=' + encodeURIComponent('No se pudo crear la opción.'));
    }
  });

  router.post('/admin/opciones/:id/editar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerOpcionCampoPorId(id);
      if (!actual) {
        return res.redirect('/admin/opciones?error=' + encodeURIComponent('Opción no encontrada.'));
      }

      const valor = normalizarNombre(req.body.valor);
      const etiqueta = normalizarNombre(req.body.etiqueta) || null;
      const orden = Number(req.body.orden) || 0;
      const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));
      if (!valor) {
        return res.redirect('/admin/opciones?error=' + encodeURIComponent('El valor de la opción es obligatorio.'));
      }

      const neon = await guardarOpcionEnNeon({
        campo: actual.campo,
        valor,
        valorOriginal: actual.valor,
        etiqueta,
        orden,
        activo,
      });
      actualizarOpcionCampo({ id, valor, etiqueta, orden, activo });

      const mensaje = neon.ok
        ? 'Opción actualizada en Neon.'
        : `Opción actualizada localmente. ${neon.mensaje}`;
      return res.redirect('/admin/opciones?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/opciones?error=' + encodeURIComponent('No se pudo actualizar la opción.'));
    }
  });

  router.post('/admin/opciones/:id/estado', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerOpcionCampoPorId(id);
      if (!actual) {
        return res.redirect('/admin/opciones?error=' + encodeURIComponent('Opción no encontrada.'));
      }

      const neon = await cambiarEstadoOpcionEnNeon(actual.campo, actual.valor);
      cambiarEstadoOpcionCampo(id);
      const mensaje = neon.ok
        ? 'Estado de la opción actualizado en Neon.'
        : `Estado actualizado localmente. ${neon.mensaje}`;
      return res.redirect('/admin/opciones?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/opciones?error=' + encodeURIComponent('No se pudo cambiar el estado de la opción.'));
    }
  });

  router.post('/admin/opciones/:id/eliminar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerOpcionCampoPorId(id);
      if (!actual) {
        return res.redirect('/admin/opciones?error=' + encodeURIComponent('Opción no encontrada.'));
      }
      const neon = await eliminarOpcionEnNeon(actual.campo, actual.valor);
      eliminarOpcionCampo(id);
      const mensaje = neon.ok
        ? 'Opción eliminada de Neon.'
        : `Opción eliminada localmente. ${neon.mensaje}`;
      return res.redirect('/admin/opciones?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/opciones?error=' + encodeURIComponent('No se pudo eliminar la opción.'));
    }
  });

  router.get('/admin/usuarios', requerirAdmin, async (req: Request, res: Response) => {
    const configNeon = await sincronizarConfiguracionNeon();
    return res.render('admin/usuarios', {
      usuarios: listarUsuarios(),
      estadisticasIngresos: obtenerEstadisticasIngresos(),
      ingresosRecientes: listarIngresosRecientes(30),
      formatearFecha,
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
      usuarioSesion: res.locals.usuario,
      configNeon,
    });
  });

  router.post('/admin/usuarios', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const usuario = valorSimple(req.body.usuario).toLowerCase();
      const nombre = normalizarNombre(req.body.nombre);
      const clave = typeof req.body.clave === 'string' ? req.body.clave : '';
      const rol = valorSimple(req.body.rol) === 'admin' ? 'admin' : 'gestor';

      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('El usuario debe tener entre 3 y 30 caracteres (letras, números, punto, guion).'));
      }
      if (!nombre) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('El nombre es obligatorio.'));
      }
      if (clave.length < 4) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('La contraseña debe tener al menos 4 caracteres.'));
      }
      if (obtenerUsuarioPorUsuario(usuario)) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Ya existe un usuario con ese nombre.'));
      }

      const id = crearUsuario({ usuario, nombre, clave, rol });
      const creado = obtenerUsuarioConHashPorId(id);
      const neon = creado
        ? await guardarUsuarioEnNeon({
            usuario: creado.usuario,
            nombre: creado.nombre,
            clave_hash: creado.clave_hash,
            rol: creado.rol,
            activo: creado.activo,
          })
        : { ok: false, configurado: false, mensaje: 'No se pudo leer el usuario creado.' };

      if (neon.ok && creado) {
        marcarUsuarioSincronizado(creado.id);
      }

      const mensaje = neon.ok
        ? 'Usuario creado y sincronizado con Neon.'
        : `Usuario guardado localmente. ${neon.mensaje}`;
      return res.redirect('/admin/usuarios?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No se pudo crear el usuario.'));
    }
  });

  router.post('/admin/usuarios/:id/editar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Usuario inválido.'));
      }

      const actual = obtenerUsuarioPorId(id);
      if (!actual) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Usuario no encontrado.'));
      }

      const nombre = normalizarNombre(req.body.nombre);
      const rol = valorSimple(req.body.rol) === 'admin' ? 'admin' : 'gestor';
      const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));
      const clave = typeof req.body.clave === 'string' ? req.body.clave.trim() : '';

      if (clave && clave.length < 4) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('La nueva contraseña debe tener al menos 4 caracteres.'));
      }

      const quitaAdmin = actual.rol === 'admin' && (rol !== 'admin' || !activo);
      if (quitaAdmin && actual.activo && contarAdminsActivos() <= 1) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Debe existir al menos un administrador activo.'));
      }

      actualizarUsuario({ id, nombre: nombre || undefined, rol, activo, clave: clave || null });
      const actualizado = obtenerUsuarioConHashPorId(id);
      const neon = actualizado
        ? await guardarUsuarioEnNeon({
            usuario: actualizado.usuario,
            nombre: actualizado.nombre,
            clave_hash: actualizado.clave_hash,
            rol: actualizado.rol,
            activo: actualizado.activo,
          })
        : { ok: false, configurado: false, mensaje: 'No se pudo leer el usuario actualizado.' };

      if (neon.ok && actualizado) {
        marcarUsuarioSincronizado(actualizado.id);
      }

      const mensaje = neon.ok
        ? 'Usuario actualizado y sincronizado con Neon.'
        : `Usuario actualizado localmente. ${neon.mensaje}`;
      return res.redirect('/admin/usuarios?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No se pudo actualizar el usuario.'));
    }
  });

  router.post('/admin/usuarios/:id/eliminar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerUsuarioPorId(id);
      const usuarioSesion = res.locals.usuario as any;

      if (!actual) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Usuario no encontrado.'));
      }
      if (usuarioSesion && usuarioSesion.id === id) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No puede eliminar su propio usuario.'));
      }
      if (actual.rol === 'admin' && actual.activo && contarAdminsActivos() <= 1) {
        return res.redirect('/admin/usuarios?error=' + encodeURIComponent('Debe existir al menos un administrador activo.'));
      }

      const neon = await eliminarUsuarioEnNeon(actual.usuario);
      if (!neon.ok) {
        encolarEliminacionUsuarioNeon(actual.usuario);
      }
      eliminarUsuario(id);

      const mensaje = neon.ok
        ? 'Usuario eliminado de SQLite y Neon.'
        : `Usuario eliminado localmente (pendiente en Neon). ${neon.mensaje}`;
      return res.redirect('/admin/usuarios?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/usuarios?error=' + encodeURIComponent('No se pudo eliminar el usuario.'));
    }
  });

  router.get('/admin/territorio', requerirAdmin, async (req: Request, res: Response) => {
    const configNeon = await sincronizarConfiguracionNeon();
    return res.render('admin/territorio', {
      territorios: listarTerritorios({ soloActivos: false }),
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
      configNeon,
    });
  });

  router.post('/admin/territorio', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const tipo = valorSimple(req.body.tipo).toLowerCase();
      const nombre = normalizarNombre(req.body.nombre);
      const padreRaw = valorSimple(req.body.padre_id);
      const padreId = padreRaw ? Number(padreRaw) : null;
      const activo = req.body.activo === undefined || ['on', '1', 'true'].includes(valorSimple(req.body.activo));

      if (tipo || nombre) {
        if (!TIPOS_TERRITORIO_VALIDOS.includes(tipo)) {
          return res.redirect('/admin/territorio?error=' + encodeURIComponent('Seleccione un nivel territorial válido.'));
        }
        if (!nombre) {
          return res.redirect('/admin/territorio?error=' + encodeURIComponent('El nombre del territorio es obligatorio.'));
        }

        const repetido = listarTerritorios({ tipo: tipo as any, soloActivos: false }).some(
          (t: any) => t.nombre.toLowerCase() === nombre.toLowerCase()
        );
        if (repetido) {
          return res.redirect('/admin/territorio?error=' + encodeURIComponent(`Ya existe ${tipo} con ese nombre.`));
        }

        const padre =
          Number.isInteger(padreId as number) && padreId ? obtenerTerritorioPorId(padreId) : null;
        const neon = await guardarTerritorioEnNeon({
          tipo,
          nombre,
          padreNombre: padre?.nombre || null,
          activo,
        });
        crearTerritorio({
          tipo: tipo as any,
          nombre,
          padre_id: padre ? padre.id : null,
          activo,
          pendiente_neon: !neon.ok,
        });

        const mensaje = neon.ok
          ? `Territorio (${tipo}) «${nombre}» agregado y sincronizado con Neon.`
          : `Territorio (${tipo}) «${nombre}» guardado localmente (pendiente de sincronizar). ${neon.mensaje}`;
        return res.redirect('/admin/territorio?ok=' + encodeURIComponent(mensaje));
      }

      // Compatibilidad con envíos directos de etapa / manzana
      const etapaNombre = normalizarNombre(req.body.etapa);
      const manzanaNombre = normalizarNombre(req.body.manzana);

      if (!etapaNombre && !manzanaNombre) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('Escriba el territorio a agregar.'));
      }

      const agregados: string[] = [];
      let neonFallido = false;

      if (etapaNombre) {
        const existente = listarTerritorios({ tipo: 'etapa', soloActivos: false })
          .find((t: any) => t.nombre.toLowerCase() === etapaNombre.toLowerCase());
        if (!existente) {
          const neon = await guardarTerritorioEnNeon({ tipo: 'etapa', nombre: etapaNombre });
          crearTerritorio({ tipo: 'etapa', nombre: etapaNombre, pendiente_neon: !neon.ok });
          neonFallido = neonFallido || !neon.ok;
          agregados.push('etapa');
        }
      }

      if (manzanaNombre) {
        const existente = listarTerritorios({ tipo: 'manzana', soloActivos: false })
          .find((t: any) => t.nombre.toLowerCase() === manzanaNombre.toLowerCase());
        if (!existente) {
          const neon = await guardarTerritorioEnNeon({ tipo: 'manzana', nombre: manzanaNombre });
          crearTerritorio({ tipo: 'manzana', nombre: manzanaNombre, pendiente_neon: !neon.ok });
          neonFallido = neonFallido || !neon.ok;
          agregados.push('manzana');
        }
      }

      if (!agregados.length) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('Ya existían los valores indicados.'));
      }

      const sufijo = neonFallido ? ' No se pudo sincronizar con Neon; se reintentará.' : ' Sincronizado con Neon.';
      return res.redirect(
        '/admin/territorio?ok=' +
          encodeURIComponent('Se agregó: ' + agregados.join(' y ') + '.' + sufijo)
      );
    } catch {
      return res.redirect('/admin/territorio?error=' + encodeURIComponent('No se pudo agregar el territorio.'));
    }
  });

  router.post('/admin/territorio/:id/editar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const nombre = normalizarNombre(req.body.nombre);
      const padreRaw = valorSimple(req.body.padre_id);
      const padreId = padreRaw ? Number(padreRaw) : null;
      const activo = ['on', '1', 'true'].includes(valorSimple(req.body.activo));
      const actual = obtenerTerritorioPorId(id);

      if (!actual) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('Territorio no encontrado.'));
      }
      if (!nombre) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('El nombre del territorio es obligatorio.'));
      }
      if (padreId === id) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('Un territorio no puede depender de sí mismo.'));
      }

      const repetido = listarTerritorios({ tipo: actual.tipo, soloActivos: false }).some(
        (t: any) => t.id !== id && t.nombre.toLowerCase() === nombre.toLowerCase()
      );
      if (repetido) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('Ya existe otro elemento con ese nombre en este nivel.'));
      }

      const padre = Number.isInteger(padreId as number) && padreId ? obtenerTerritorioPorId(padreId) : null;

      const neon = await guardarTerritorioEnNeon({
        tipo: actual.tipo,
        nombre,
        nombreOriginal: actual.nombre,
        padreNombre: padre?.nombre || null,
        activo,
      });

      actualizarTerritorio({
        id,
        nombre,
        padre_id: padre ? padre.id : null,
        activo,
        pendiente_neon: !neon.ok,
        nombre_original_neon: actual.nombre,
      });

      const mensaje = neon.ok
        ? 'Territorio actualizado y sincronizado con Neon.'
        : `Territorio actualizado localmente (pendiente de sincronizar). ${neon.mensaje}`;
      return res.redirect('/admin/territorio?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/territorio?error=' + encodeURIComponent('No se pudo actualizar el territorio.'));
    }
  });

  router.post('/admin/territorio/:id/eliminar', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const actual = obtenerTerritorioPorId(id);
      if (!actual) {
        return res.redirect('/admin/territorio?error=' + encodeURIComponent('Territorio no encontrado.'));
      }
      const neon = await eliminarTerritorioEnNeon({ tipo: actual.tipo, nombre: actual.nombre });
      if (!neon.ok) {
        encolarEliminacionTerritorioNeon(actual.tipo, actual.nombre);
      }
      eliminarTerritorio(id);
      const mensaje = neon.ok
        ? 'Territorio eliminado de Neon.'
        : `Territorio eliminado localmente (pendiente en Neon). ${neon.mensaje}`;
      return res.redirect('/admin/territorio?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/territorio?error=' + encodeURIComponent('No se pudo eliminar el territorio.'));
    }
  });

  router.get('/admin/formulario', requerirAdmin, (req: Request, res: Response) => {
    const campos = listarConfigCampos();
    const secciones = [...new Set(campos.map((campo: any) => campo.seccion))];

    return res.render('admin/formulario', {
      campos,
      secciones,
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
    });
  });

  router.post('/admin/formulario', requerirAdmin, async (req: Request, res: Response) => {
    try {
      const campos = listarConfigCampos();
      const actualizados = campos.map((campo: any) => ({
        ...campo,
        visible: ['on', '1', 'true'].includes(valorSimple(req.body[`visible_${campo.clave}`])),
        requerido: ['on', '1', 'true'].includes(valorSimple(req.body[`requerido_${campo.clave}`])),
      }));

      const neon = await guardarConfigCamposEnNeon(actualizados);
      for (const campo of actualizados) {
        actualizarConfigCampo({
          clave: campo.clave,
          visible: campo.visible,
          requerido: campo.requerido,
        });
      }

      const mensaje = neon.ok
        ? 'Configuración del formulario guardada y sincronizada con Neon.'
        : `Configuración guardada localmente. ${neon.mensaje}`;
      return res.redirect('/admin/formulario?ok=' + encodeURIComponent(mensaje));
    } catch {
      return res.redirect('/admin/formulario?error=' + encodeURIComponent('No se pudo guardar la configuración.'));
    }
  });

  router.get('/api/territorios', (req: Request, res: Response) => {
    const tipo = typeof req.query.tipo === 'string' ? req.query.tipo : null;
    const padreId = req.query.padre_id !== undefined ? Number(req.query.padre_id) : null;

    const territorios = listarTerritorios({
      tipo: tipo && TIPOS_TERRITORIO_VALIDOS.includes(tipo) ? (tipo as any) : null,
      padreId: Number.isInteger(padreId as number) ? padreId : null,
    });

    return res.json({ territorios });
  });

  // Exportaciones e importación CSV
  router.get('/api/export/csv', (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string) || '';
      const like = `%${q}%`;
      const viviendas = db
        .prepare(`
          SELECT v.*, j.nombres AS jefe_nombres, j.apellidos AS jefe_apellidos, j.cedula_tipo, j.cedula_numero
          FROM viviendas v
          LEFT JOIN jefes_familia j ON j.vivienda_id = v.id
          WHERE v.comunidad LIKE ? OR v.manzana LIKE ? OR v.etapa LIKE ? OR v.direccion LIKE ? OR v.numero_casa LIKE ?
          ORDER BY v.fecha_registro DESC
        `)
        .all(like, like, like, like, like) as any[];

      const cabecera = [
        'ID Vivienda',
        'Estado',
        'Municipio',
        'Parroquia',
        'Comunidad',
        'Etapa',
        'Manzana',
        'Dirección',
        'Número Casa',
        'Jefe Cédula',
        'Jefe Nombres',
        'Jefe Apellidos',
        'Fecha Registro',
      ];

      const filas = viviendas.map((v: any) => [
        v.id,
        v.estado,
        v.municipio,
        v.parroquia,
        v.comunidad,
        v.etapa || '',
        v.manzana || '',
        v.direccion,
        v.numero_casa || '',
        `${v.cedula_tipo || ''}-${v.cedula_numero || ''}`,
        v.jefe_nombres || '',
        v.jefe_apellidos || '',
        formatearFecha(v.fecha_registro),
      ]);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="censo_viviendas.csv"');
      return res.send(generarCsvDesdeTabla(cabecera, filas));
    } catch (error) {
      return next(error);
    }
  });

  router.get('/api/export/personas.csv', (req: Request, res: Response) => {
    const { personas } = obtenerPersonas(leerFiltrosPersonas(req));
    const cabecera = [
      'Tipo',
      'Cédula',
      'Apellidos',
      'Nombres',
      'Edad',
      'Sexo',
      'Parentesco',
      'Nivel de instrucción',
      'Profesión',
      'Trabaja',
      'Comunidad',
      'Etapa',
      'Manzana',
      'Dirección',
      'Número de casa',
    ];

    const filas = personas.map((p: any) => [
      p.tipo === 'jefe' ? 'Jefe de Familia' : 'Integrante',
      p.cedula || '',
      p.apellidos,
      p.nombres,
      p.edad ?? '',
      p.sexo || '',
      p.parentesco || '',
      p.nivel_instruccion || '',
      p.profesion || '',
      p.trabaja_actual || '',
      p.comunidad || '',
      p.etapa || '',
      p.manzana || '',
      p.direccion || '',
      p.numero_casa || '',
    ]);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="padron-personas.csv"');
    return res.send(generarCsvDesdeTabla(cabecera, filas));
  });

  router.get('/api/export/viviendas.csv', (_req: Request, res: Response) => {
    const { viviendas } = obtenerViviendas({ q: '', page: 1, limit: 100000 });
    const cabecera = [
      'N.º',
      'Estado',
      'Municipio',
      'Parroquia',
      'Comunidad',
      'Etapa',
      'Manzana',
      'Dirección',
      'Número de casa',
      'Jefe',
      'Cédula del jefe',
      'Integrantes',
    ];

    const filas = viviendas.map((v: any) => {
      const jefe = obtenerJefePorVivienda(v.id);
      const integrantes = obtenerIntegrantesPorVivienda(v.id);
      return [
        v.id,
        v.estado,
        v.municipio,
        v.parroquia,
        v.comunidad,
        v.etapa || '',
        v.manzana || '',
        v.direccion,
        v.numero_casa || '',
        jefe ? `${jefe.apellidos}, ${jefe.nombres}` : '',
        jefe ? textoCedula(jefe.cedula_tipo, jefe.cedula_numero) : '',
        integrantes.length,
      ];
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="padron-viviendas.csv"');
    return res.send(generarCsvDesdeTabla(cabecera, filas));
  });

  router.post('/api/import/csv', (req: Request, res: Response) => {
    try {
      const archivo = typeof req.body?.archivo === 'string' ? req.body.archivo : '';
      if (!archivo.trim()) {
        return res.status(400).json({ error: 'No se proporcionó un archivo CSV.' });
      }

      const csvContent = archivo.replace(/^\uFEFF/, '');
      const lineas = csvContent.split(/\r?\n/).filter((l: string) => l.trim().length > 0);
      if (lineas.length < 2) {
        return res.status(400).json({ error: 'El archivo CSV no contiene filas de datos.' });
      }

      const separador = lineas[0].includes(';') ? ';' : ',';
      const encabezados = parsearFilaCsv(lineas[0], separador).map(normalizarCabeceraCsv);
      const buscarCol = (candidatos: string[]) => encabezados.findIndex((h) => candidatos.includes(h));

      const idxEstado = buscarCol(['estado']);
      const idxMunicipio = buscarCol(['municipio']);
      const idxParroquia = buscarCol(['parroquia']);
      const idxComunidad = buscarCol(['comunidad']);
      const idxEtapa = buscarCol(['etapa']);
      const idxManzana = buscarCol(['manzana']);
      const idxDireccion = buscarCol(['direccion']);
      const idxNumeroCasa = buscarCol(['numero casa', 'numero de casa']);
      const idxJefe = buscarCol(['jefe']);
      const idxJefeCedula = buscarCol(['jefe cedula', 'cedula del jefe', 'cedula']);
      const idxJefeNombres = buscarCol(['jefe nombres', 'nombres']);
      const idxJefeApellidos = buscarCol(['jefe apellidos', 'apellidos']);
      const idxFechaNacimiento = buscarCol(['fecha de nacimiento', 'fecha nacimiento']);
      const idxSexo = buscarCol(['sexo']);
      const idxNivelInstruccion = buscarCol(['nivel de instruccion', 'nivel instruccion']);
      const idxEstadoCivil = buscarCol(['estado civil']);
      const idxProfesion = buscarCol(['profesion', 'profesion u oficio']);
      const idxTrabaja = buscarCol(['trabaja', 'trabaja actual', 'trabaja actualmente', '¿trabaja actualmente?']);
      const idxClasificacionIngresos = buscarCol(['clasificacion de ingresos', 'clasificacion ingresos']);
      const idxFrecuenciaIngresos = buscarCol(['frecuencia de ingresos', 'frecuencia ingresos']);
      const idxIngresoMensual = buscarCol(['ingreso mensual', 'ingreso mensual bs']);

      if (idxComunidad === -1 || idxEstado === -1) {
        return res.status(400).json({ error: 'Formato CSV inválido: faltan columnas obligatorias.' });
      }

      const inserted: number[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lineas.length; i += 1) {
        const valores = parsearFilaCsv(lineas[i], separador);
        try {
          const comunidad = idxComunidad >= 0 ? valores[idxComunidad] || '' : '';
          const direccion = idxDireccion >= 0 ? valores[idxDireccion] || '' : '';
          if (!comunidad) throw new Error('La comunidad es obligatoria.');

          const datosVivienda = {
            estado: (idxEstado >= 0 ? valores[idxEstado] : '') || 'FALCÓN',
            municipio: (idxMunicipio >= 0 ? valores[idxMunicipio] : '') || 'MIRANDA',
            parroquia: (idxParroquia >= 0 ? valores[idxParroquia] : '') || 'SAN ANTONIO',
            comunidad,
            etapa: idxEtapa >= 0 ? valores[idxEtapa] || null : null,
            manzana: idxManzana >= 0 ? valores[idxManzana] || null : null,
            direccion: direccion || 'Sin dirección',
            numero_casa: idxNumeroCasa >= 0 ? valores[idxNumeroCasa] || null : null,
            consejo_comunal_id: null,
            es_anexo: false,
            numero_anexo: null,
            vivienda_principal_id: null,
            sincronizar_neon: true,
          };

          let nombres = idxJefeNombres >= 0 ? valores[idxJefeNombres] || '' : '';
          let apellidos = idxJefeApellidos >= 0 ? valores[idxJefeApellidos] || '' : '';

          if (!nombres && !apellidos && idxJefe >= 0 && valores[idxJefe]) {
            const textoJefe = valores[idxJefe].trim();
            if (textoJefe.includes(',')) {
              const coma = textoJefe.indexOf(',');
              apellidos = textoJefe.slice(0, coma).trim();
              nombres = textoJefe.slice(coma + 1).trim();
            } else {
              const partes = textoJefe.split(/\s+/).filter(Boolean);
              if (partes.length >= 2) {
                nombres = partes.slice(0, -1).join(' ');
                apellidos = partes[partes.length - 1];
              } else if (partes.length === 1) {
                nombres = partes[0];
                apellidos = '-';
              }
            }
          }

          const cedulaRaw = idxJefeCedula >= 0 ? (valores[idxJefeCedula] || '').trim() : '';
          let cedulaTipo: TipoCedula = 'S';
          let cedulaNumero: string | null = null;

          if (cedulaRaw && !/^sin\s*c[eé]dula$/i.test(cedulaRaw)) {
            const coincidencia = /^([VE])\s*-\s*(\d+)$/i.exec(cedulaRaw);
            if (coincidencia) {
              cedulaTipo = coincidencia[1].toUpperCase() as TipoCedula;
              cedulaNumero = coincidencia[2];
            } else if (/^\d{5,12}$/.test(cedulaRaw)) {
              cedulaTipo = 'V';
              cedulaNumero = cedulaRaw;
            }
          }

          const tieneJefe = Boolean(nombres || apellidos || cedulaNumero);
          let fechaNacimiento = '1980-01-01';
          if (idxFechaNacimiento >= 0 && valores[idxFechaNacimiento]) {
            const fechaParseada = normalizarFechaCsv(valores[idxFechaNacimiento]);
            if (fechaParseada === false) {
              throw new Error(`Fecha de nacimiento inválida en fila ${i + 1}`);
            }
            if (fechaParseada) fechaNacimiento = fechaParseada;
          }

          const sexoRaw = idxSexo >= 0 ? (valores[idxSexo] || '').trim().toUpperCase() : '';
          const sexo: 'M' | 'F' = sexoRaw === 'M' || sexoRaw === 'MASCULINO' ? 'M' : 'F';
          const trabajaRaw = idxTrabaja >= 0 ? valores[idxTrabaja] || '' : '';
          const trabajaActual: 'Sí' | 'No' = /^(1|true|s[ií])$/i.test(trabajaRaw.trim()) ? 'Sí' : 'No';
          const ingresoNum =
            idxIngresoMensual >= 0 && valores[idxIngresoMensual]
              ? Number(valores[idxIngresoMensual].replace(',', '.'))
              : NaN;

          const viviendaId = db.transaction(() => {
            const id = insertarVivienda(datosVivienda);
            if (tieneJefe) {
              insertarJefeFamilia({
                vivienda_id: id,
                cedula_tipo: cedulaTipo,
                cedula_numero: cedulaNumero,
                nombres: nombres || '-',
                apellidos: apellidos || '-',
                fecha_nacimiento: fechaNacimiento,
                sexo,
                telefono_movil: null,
                telefono_habitacion: null,
                telefono_trabajo: null,
                correo: null,
                nivel_instruccion:
                  (idxNivelInstruccion >= 0 ? valores[idxNivelInstruccion] : '') || 'Ninguno',
                estado_civil:
                  (idxEstadoCivil >= 0 ? valores[idxEstadoCivil] : '') || 'Soltero/a',
                profesion: idxProfesion >= 0 ? valores[idxProfesion] || null : null,
                trabaja_actual: trabajaActual,
                clasificacion_ingresos:
                  (idxClasificacionIngresos >= 0 ? valores[idxClasificacionIngresos] : '') || 'Mensual',
                frecuencia_ingresos:
                  idxFrecuenciaIngresos >= 0 ? valores[idxFrecuenciaIngresos] || null : null,
                ingreso_mensual_bs: Number.isFinite(ingresoNum) ? ingresoNum : null,
              });
            }
            return id;
          })();

          inserted.push(viviendaId);
        } catch (error: any) {
          errors.push(`Fila ${i + 1}: ${error.message}`);
        }
      }

      const mensaje =
        inserted.length > 0
          ? `Se importaron ${inserted.length} vivienda${inserted.length === 1 ? '' : 's'}.${errors.length > 0 ? ' Errores: ' + errors.join('; ') : ''}`
          : 'No se importaron viviendas.';

      return res.json({
        ok: inserted.length > 0,
        insertados: inserted.length,
        errores: errors,
        mensaje,
      });
    } catch (error: any) {
      console.error('[import-csv]', error);
      return res.status(500).json({
        ok: false,
        error: error?.message || 'Error al importar el CSV.',
      });
    }
  });

  router.get('/reportes/imprimir', (req: Request, res: Response) => {
    const { personas, total } = obtenerPersonas(leerFiltrosPersonas(req));
    return res.render('reporte', { personas, total, formatearFecha });
  });

  // Sincronización con Neon
  router.post('/api/sincronizar', async (_req: Request, res: Response) => {
    try {
      const resultado = await sincronizarConNeon();
      if (!resultado.ok) return res.status(400).json(resultado);
      return res.json(resultado);
    } catch (error: any) {
      console.error('[sync]', error);
      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          'No se pudo conectar con Neon. Verifique la conexión a Internet y DATABASE_URL.',
      });
    }
  });

  router.post('/api/sincronizar-locales', async (_req: Request, res: Response) => {
    try {
      const marcadas = marcarSoloLocalParaSincronizar();
      if (!marcadas) {
        return res.json({
          ok: true,
          pendientes: 0,
          procesados: 0,
          mensaje: 'No hay viviendas guardadas solo en local.',
        });
      }

      const resultado = await sincronizarConNeon();
      if (!resultado.ok) return res.status(400).json(resultado);

      return res.json({
        ...resultado,
        marcadas,
        mensaje: `${marcadas} vivienda(s) solo local marcada(s) para subir. ${resultado.mensaje}`,
      });
    } catch (error: any) {
      console.error('[sync-locales]', error);
      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          'No se pudo conectar con Neon. Verifique la conexión a Internet y DATABASE_URL.',
      });
    }
  });

  return router;
}
