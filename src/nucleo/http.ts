import type { Request } from 'express';

export type TipoCedula = 'V' | 'E' | 'S';

export function valorSimple(valor: unknown): string {
  if (Array.isArray(valor)) valor = valor[0];
  return typeof valor === 'string' ? valor.trim() : '';
}

export function normalizarCedula(valor: unknown): string {
  return valorSimple(valor).toUpperCase().replace(/\s+/g, '');
}

export function normalizarNombre(valor: unknown): string {
  return valorSimple(valor).replace(/\s+/g, ' ');
}

export function normalizarBusqueda(valor: unknown): string {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizarFecha(valor: unknown): string | false {
  const limpio = valorSimple(valor);
  if (!limpio) return null as unknown as false;

  const patron = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
  const coincidencia = patron.exec(limpio);
  if (!coincidencia) return false;

  const [, anio, mes, dia, hora = '00', minuto = '00', segundo = '00'] = coincidencia;
  const fecha = new Date(
    Date.UTC(
      Number(anio),
      Number(mes) - 1,
      Number(dia),
      Number(hora),
      Number(minuto),
      Number(segundo)
    )
  );

  const esValida =
    fecha.getUTCFullYear() === Number(anio) &&
    fecha.getUTCMonth() === Number(mes) - 1 &&
    fecha.getUTCDate() === Number(dia) &&
    fecha.getUTCHours() === Number(hora) &&
    fecha.getUTCMinutes() === Number(minuto) &&
    fecha.getUTCSeconds() === Number(segundo);

  if (!esValida) return false;

  return `${anio}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;
}

export function formatearFecha(valor: unknown): string {
  if (!valor) return '—';
  const coincidencia = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(String(valor));
  if (!coincidencia) return String(valor);

  const [, anio, mes, dia, hora, minuto] = coincidencia;
  return hora ? `${dia}/${mes}/${anio} ${hora}:${minuto}` : `${dia}/${mes}/${anio}`;
}

export function validarFormatoCedula(cedula: string): boolean {
  return /^[VE]-\d{6,8}$/.test(cedula);
}

export function normalizarTipoCedula(valor: unknown): TipoCedula {
  const tipo = valorSimple(valor).toUpperCase();
  return tipo === 'E' || tipo === 'S' ? tipo : 'V';
}

export function textoCedula(tipo?: string | null, numero?: string | null): string {
  return (tipo === 'V' || tipo === 'E') && numero ? `${tipo}-${numero}` : 'Sin cédula';
}

export function normalizarCedulaPersona(
  tipo: unknown,
  numero: unknown
): { cedula_tipo: TipoCedula | null; cedula_numero: string | null } {
  const valorTipo = valorSimple(tipo).toUpperCase();
  if (valorTipo === 'S') return { cedula_tipo: 'S', cedula_numero: null };
  if (valorTipo !== 'V' && valorTipo !== 'E') return { cedula_tipo: null, cedula_numero: null };
  return { cedula_tipo: valorTipo, cedula_numero: normalizarCedula(numero) || null };
}

export function normalizarSexoJefe(valor: unknown): 'M' | 'F' {
  const texto = valorSimple(valor).toLowerCase();
  return texto === 'f' || texto.startsWith('fem') ? 'F' : 'M';
}

export function normalizarSexoOpcional(valor: unknown): 'M' | 'F' | null {
  const texto = valorSimple(valor).toLowerCase();
  if (!texto) return null;
  if (texto === 'm' || texto.startsWith('masc')) return 'M';
  if (texto === 'f' || texto.startsWith('fem')) return 'F';
  return null;
}

export function parsearNumeroOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const texto = typeof valor === 'string' ? valor.trim() : String(valor);
  if (!texto) return null;
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export function cedulaNeonJefe(
  viviendaId: number,
  tipo?: string | null,
  numero?: string | null
): string {
  return (tipo === 'V' || tipo === 'E') && numero ? `${tipo}-${numero}` : `S-${viviendaId}`;
}

export function rutaLocalSegura(valor: unknown, defecto = '/inicio'): string {
  const texto = typeof valor === 'string' ? valor : '';
  return texto.startsWith('/') && !texto.startsWith('//') ? texto : defecto;
}

export function mensajeQuery(req: Request, clave: string): string | null {
  const valor = req.query[clave];
  return typeof valor === 'string' ? valor.slice(0, 300) : null;
}

export function escaparCsv(valor: unknown): string {
  const texto = valor === null || valor === undefined ? '' : String(valor);
  return /[";,\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}
