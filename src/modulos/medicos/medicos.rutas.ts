import { Router, Request, Response } from 'express';
import { requerirAuth } from '../../nucleo/autenticacion';
import {
  mensajeQuery,
  normalizarFecha,
  normalizarNombre,
  valorSimple,
} from '../../nucleo/http';
import {
  actualizarExpedienteMedico,
  crearExpedienteMedico,
  eliminarExpedienteMedico,
  eliminarExpedienteMedicoEnNeon,
  encolarEliminacionExpedienteNeon,
  guardarExpedienteMedicoEnNeon,
  listarExpedientesMedicos,
  listarPersonasCompartidas,
  NivelRiesgo,
  obtenerEstadisticasMedicas,
  obtenerExpedienteMedicoPorId,
  sincronizarExpedientesMedicosNeon,
} from './medicos.repositorio';

export function crearRouterMedicos(): Router {
  const router = Router();
  router.use('/expedientes-medicos', requerirAuth);

  router.get('/expedientes-medicos', (req: Request, res: Response) => {
    const q = valorSimple(req.query.q);
    const nivelRiesgo = valorSimple(req.query.riesgo);
    const discapacidad = valorSimple(req.query.discapacidad);
    const editarId = Number(req.query.editar);

    const expedientes = listarExpedientesMedicos({ q, nivelRiesgo, discapacidad });
    const stats = obtenerEstadisticasMedicas();
    const personas = listarPersonasCompartidas();
    const editarItem =
      Number.isInteger(editarId) && editarId > 0
        ? obtenerExpedienteMedicoPorId(editarId)
        : null;

    return res.render('modulos/medicos/index', {
      modulo: 'expedientes',
      subseccion: 'lista',
      expedientes,
      stats,
      personas,
      editarItem,
      filtros: { q, riesgo: nivelRiesgo, discapacidad },
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
    });
  });

  router.post('/expedientes-medicos', async (req: Request, res: Response) => {
    try {
      const editId = Number(req.body.id);
      const personaRef = valorSimple(req.body.persona_ref);
      let viviendaId: number | null = null;
      let personaTipo: 'jefe' | 'integrante' | null = null;
      let personaId: number | null = null;
      let cedula = normalizarNombre(req.body.cedula) || null;
      let pacienteNombre = normalizarNombre(req.body.paciente_nombre);
      let comunidad = normalizarNombre(req.body.comunidad) || null;

      if (personaRef && /^(jefe|integrante):(\d+)$/.test(personaRef)) {
        const [, tipo, idStr] = /^(jefe|integrante):(\d+)$/.exec(personaRef)!;
        const encontrada = listarPersonasCompartidas().find(
          (p) => p.tipo === tipo && p.persona_id === Number(idStr)
        );
        if (encontrada) {
          personaTipo = encontrada.tipo;
          personaId = encontrada.persona_id;
          viviendaId = encontrada.vivienda_id;
          cedula = cedula || encontrada.cedula || null;
          pacienteNombre =
            pacienteNombre || `${encontrada.apellidos}, ${encontrada.nombres}`.replace(/^, |, $/g, '');
          comunidad = comunidad || encontrada.comunidad || null;
        }
      }

      if (!pacienteNombre) {
        return res.redirect(
          '/expedientes-medicos?error=' +
            encodeURIComponent('Seleccione una persona del padrón o indique el nombre del paciente.')
        );
      }

      const riesgoRaw = valorSimple(req.body.nivel_riesgo);
      const nivelRiesgo: NivelRiesgo =
        riesgoRaw === 'Alto' || riesgoRaw === 'Moderado' ? riesgoRaw : 'Bajo';

      const consultaRaw = valorSimple(req.body.ultima_consulta);
      let ultimaConsulta: string | null = null;
      if (consultaRaw) {
        const normalizada = normalizarFecha(consultaRaw);
        if (normalizada === false) {
          return res.redirect(
            '/expedientes-medicos?error=' + encodeURIComponent('La fecha de última consulta es inválida.')
          );
        }
        ultimaConsulta = normalizada.slice(0, 10);
      }

      const payload = {
        vivienda_id: viviendaId,
        persona_tipo: personaTipo,
        persona_id: personaId,
        cedula,
        paciente_nombre: pacienteNombre,
        comunidad,
        grupo_sanguineo: normalizarNombre(req.body.grupo_sanguineo) || null,
        condiciones_cronicas: normalizarNombre(req.body.condiciones_cronicas) || null,
        discapacidad: normalizarNombre(req.body.discapacidad) || null,
        alergias: normalizarNombre(req.body.alergias) || null,
        medicamentos_actuales: normalizarNombre(req.body.medicamentos_actuales) || null,
        nivel_riesgo: nivelRiesgo,
        ultima_consulta: ultimaConsulta,
        observaciones: normalizarNombre(req.body.observaciones) || null,
      };

      const usuarioSesion = res.locals.usuario as { usuario?: string } | undefined;
      let id: number;
      let accion: string;

      if (Number.isInteger(editId) && editId > 0 && obtenerExpedienteMedicoPorId(editId)) {
        actualizarExpedienteMedico(editId, payload);
        id = editId;
        accion = 'actualizado';
      } else {
        id = crearExpedienteMedico({
          ...payload,
          registrado_por: usuarioSesion?.usuario || null,
        });
        accion = 'registrado';
      }

      const neon = await guardarExpedienteMedicoEnNeon(id);
      const mensaje = neon.ok
        ? `Expediente médico ${accion} y sincronizado con Neon.`
        : `Expediente médico ${accion} localmente. ${neon.mensaje}`;

      return res.redirect('/expedientes-medicos?ok=' + encodeURIComponent(mensaje));
    } catch (error) {
      return res.redirect(
        '/expedientes-medicos?error=' + encodeURIComponent('No se pudo guardar el expediente médico.')
      );
    }
  });

  router.post('/expedientes-medicos/:id/eliminar', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !obtenerExpedienteMedicoPorId(id)) {
      return res.redirect(
        '/expedientes-medicos?error=' + encodeURIComponent('Expediente médico no encontrado.')
      );
    }

    const neon = await eliminarExpedienteMedicoEnNeon(id);
    if (!neon.ok) {
      encolarEliminacionExpedienteNeon(id);
    }
    eliminarExpedienteMedico(id);

    const mensaje = neon.ok
      ? 'Expediente médico eliminado de SQLite y Neon.'
      : `Expediente eliminado localmente (pendiente en Neon). ${neon.mensaje}`;
    return res.redirect('/expedientes-medicos?ok=' + encodeURIComponent(mensaje));
  });

  router.post('/expedientes-medicos/sincronizar', async (_req: Request, res: Response) => {
    const resultado = await sincronizarExpedientesMedicosNeon();
    const clave = resultado.ok ? 'ok' : 'error';
    return res.redirect(`/expedientes-medicos?${clave}=${encodeURIComponent(resultado.mensaje)}`);
  });

  return router;
}
