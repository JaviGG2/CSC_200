import { Router, Request, Response } from 'express';
import { requerirAuth } from '../../nucleo/autenticacion';
import {
  mensajeQuery,
  normalizarFecha,
  normalizarNombre,
  valorSimple,
} from '../../nucleo/http';
import { sincronizarConfiguracionNeon } from '../../nucleo/base-datos';
import {
  actualizarEstadoBeneficio,
  crearEntregaBeneficio,
  eliminarEntregaBeneficio,
  eliminarBeneficioEnNeon,
  encolarEliminacionBeneficioNeon,
  EstadoBeneficio,
  guardarBeneficioEnNeon,
  listarBeneficiariosCompartidos,
  listarConsejosParaBeneficios,
  listarEntregasBeneficios,
  obtenerEntregaBeneficioPorId,
  obtenerEstadisticasBeneficios,
  sincronizarBeneficiosNeon,
  TipoEntregaBeneficio,
} from './beneficios.repositorio';

const PROGRAMAS_SUGERIDOS = [
  'Bolsa / Módulo Alimentario (CLAP)',
  'Gas Comunal',
  'Medicinas e Insumos Médicos',
  'Ayuda Social / Bono',
  'Materiales de Vivienda',
  'Útiles / Beca Escolar',
  'Otro beneficio',
];

export function crearRouterBeneficios(): Router {
  const router = Router();
  router.use('/beneficios', requerirAuth);

  router.get('/beneficios', async (req: Request, res: Response) => {
    await sincronizarConfiguracionNeon().catch(() => null);

    const q = valorSimple(req.query.q);
    const programa = valorSimple(req.query.programa);
    const consejo = valorSimple(req.query.consejo);
    const estado = valorSimple(req.query.estado);

    return res.render('modulos/beneficios/index', {
      modulo: 'beneficios',
      subseccion: 'lista',
      entregas: listarEntregasBeneficios({ q, programa, consejo, estado }),
      stats: obtenerEstadisticasBeneficios(),
      beneficiarios: listarBeneficiariosCompartidos(),
      consejos: listarConsejosParaBeneficios(),
      programasSugeridos: PROGRAMAS_SUGERIDOS,
      filtros: { q, programa, consejo, estado },
      ok: mensajeQuery(req, 'ok'),
      error: mensajeQuery(req, 'error'),
    });
  });

  router.post('/beneficios', async (req: Request, res: Response) => {
    try {
      const personaRef = valorSimple(req.body.persona_ref);
      let viviendaId: number | null = null;
      let personaTipo: 'jefe' | 'integrante' | null = null;
      let personaId: number | null = null;
      let cedula = normalizarNombre(req.body.cedula) || null;
      let beneficiarioNombre = normalizarNombre(req.body.beneficiario_nombre);
      let consejoComunal = normalizarNombre(req.body.consejo_comunal) || null;
      let comunidad = normalizarNombre(req.body.comunidad) || null;

      if (personaRef && /^(jefe|integrante):(\d+)$/.test(personaRef)) {
        const [, tipo, idStr] = /^(jefe|integrante):(\d+)$/.exec(personaRef)!;
        const encontrado = listarBeneficiariosCompartidos().find(
          (b) => b.tipo === tipo && b.persona_id === Number(idStr)
        );
        if (encontrado) {
          personaTipo = encontrado.tipo;
          personaId = encontrado.persona_id;
          viviendaId = encontrado.vivienda_id;
          cedula = cedula || encontrado.cedula || null;
          beneficiarioNombre =
            beneficiarioNombre || `${encontrado.apellidos}, ${encontrado.nombres}`.replace(/^, |, $/g, '');
          consejoComunal = consejoComunal || encontrado.consejo_comunal || null;
          comunidad = comunidad || encontrado.comunidad || null;
        }
      }

      const programaBase = normalizarNombre(req.body.programa);
      const programaOtro = normalizarNombre(req.body.programa_otro);
      const programa =
        programaBase === 'Otro beneficio' && programaOtro ? programaOtro : programaBase;

      if (!beneficiarioNombre || !programa) {
        return res.redirect(
          '/beneficios?error=' +
            encodeURIComponent('Indique el beneficiario y el programa o tipo de ayuda.')
        );
      }

      const tipoRaw = valorSimple(req.body.tipo_entrega);
      const tipoEntrega: TipoEntregaBeneficio =
        tipoRaw === 'Mensual' || tipoRaw === 'Quincenal' || tipoRaw === 'Periódica'
          ? tipoRaw
          : 'Única';

      const estadoRaw = valorSimple(req.body.estado);
      const estado: EstadoBeneficio =
        estadoRaw === 'Pendiente' || estadoRaw === 'Programado' ? estadoRaw : 'Entregado';

      const fechaRaw = valorSimple(req.body.fecha_entrega) || new Date().toISOString().slice(0, 10);
      const fechaNorm = normalizarFecha(fechaRaw);
      if (fechaNorm === false) {
        return res.redirect(
          '/beneficios?error=' + encodeURIComponent('La fecha de entrega es inválida.')
        );
      }

      const usuarioSesion = res.locals.usuario as { usuario?: string } | undefined;
      const id = crearEntregaBeneficio({
        vivienda_id: viviendaId,
        persona_tipo: personaTipo,
        persona_id: personaId,
        cedula,
        beneficiario_nombre: beneficiarioNombre,
        consejo_comunal: consejoComunal,
        comunidad,
        programa,
        tipo_entrega: tipoEntrega,
        cantidad: normalizarNombre(req.body.cantidad) || null,
        estado,
        fecha_entrega: fechaNorm.slice(0, 10),
        observaciones: normalizarNombre(req.body.observaciones) || null,
        registrado_por: usuarioSesion?.usuario || null,
      });

      const neon = await guardarBeneficioEnNeon(id);
      const mensaje = neon.ok
        ? 'Beneficio registrado y sincronizado con Neon.'
        : `Beneficio registrado localmente. ${neon.mensaje}`;
      return res.redirect('/beneficios?ok=' + encodeURIComponent(mensaje));
    } catch (error) {
      return res.redirect(
        '/beneficios?error=' + encodeURIComponent('No se pudo registrar la entrega.')
      );
    }
  });

  router.post('/beneficios/:id/estado', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !obtenerEntregaBeneficioPorId(id)) {
      return res.redirect('/beneficios?error=' + encodeURIComponent('Entrega no encontrada.'));
    }

    const estadoRaw = valorSimple(req.body.estado);
    const estado: EstadoBeneficio =
      estadoRaw === 'Pendiente' || estadoRaw === 'Programado' ? estadoRaw : 'Entregado';

    actualizarEstadoBeneficio(id, estado);
    const neon = await guardarBeneficioEnNeon(id);
    const mensaje = neon.ok
      ? `Estado actualizado a «${estado}» en Neon.`
      : `Estado actualizado localmente. ${neon.mensaje}`;
    return res.redirect('/beneficios?ok=' + encodeURIComponent(mensaje));
  });

  router.post('/beneficios/:id/eliminar', async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0 || !obtenerEntregaBeneficioPorId(id)) {
      return res.redirect('/beneficios?error=' + encodeURIComponent('Entrega no encontrada.'));
    }

    const neon = await eliminarBeneficioEnNeon(id);
    if (!neon.ok) {
      encolarEliminacionBeneficioNeon(id);
    }
    eliminarEntregaBeneficio(id);

    const mensaje = neon.ok
      ? 'Entrega eliminada de SQLite y Neon.'
      : `Entrega eliminada localmente (pendiente en Neon). ${neon.mensaje}`;
    return res.redirect('/beneficios?ok=' + encodeURIComponent(mensaje));
  });

  router.post('/beneficios/sincronizar', async (_req: Request, res: Response) => {
    const resultado = await sincronizarBeneficiosNeon();
    const clave = resultado.ok ? 'ok' : 'error';
    return res.redirect(`/beneficios?${clave}=${encodeURIComponent(resultado.mensaje)}`);
  });

  return router;
}
