/**
 * CAPA 3 — DOMINIO · Módulo de alumnos · Teléfono y WhatsApp (ticket 7C).
 *
 * El teléfono se guarda en DOS campos — código de país sin '+' y número solo
 * dígitos — porque el link de wa.me exige E.164 sin '+' y porque Argentina
 * tiene una regla propia: WhatsApp exige un 9 entre el país y el área para
 * celulares (54 9 351 …). Un string libre no puede garantizar nada de eso.
 *
 * Todo puro y sin red: el link se ARMA acá, abrirlo es problema de la UI.
 */

/** Códigos de país donde opera la academia (LATAM + EE.UU./Canadá). */
export const CODIGOS_PAIS: readonly string[] = [
  '54', '55', '56', '57', '58', '51', '52', '53', '502', '503', '504', '505',
  '506', '507', '509', '591', '593', '595', '598', '1',
] as const;

export const soloDigitos = (s: string): string => s.replace(/\D/g, '');

export interface TelefonoParseado {
  pais: string;
  numero: string;
}

/**
 * Parsea un teléfono crudo (el `whatsapp` libre de la ficha) SOLO si se puede
 * con confianza. La regla: hace falta una marca internacional explícita — el
 * '+', el '00', o el inconfundible '549…' argentino. Un número local pelado
 * ('351 555-1234') NO se adivina: devuelve null y queda para revisión manual.
 * Adivinar mal acá significa escribirle por WhatsApp a un desconocido.
 */
export function parsearTelefono(crudo: string): TelefonoParseado | null {
  const limpio = crudo.trim();
  if (limpio === '') return null;

  const tieneMarca = limpio.startsWith('+') || limpio.startsWith('00');
  let digitos = soloDigitos(limpio);
  if (limpio.startsWith('00')) digitos = digitos.slice(2);

  // Sin marca internacional, lo único que se acepta es el prefijo argentino
  // completo de celular (549 + área + número: 12 dígitos o más).
  if (!tieneMarca && !(digitos.startsWith('549') && digitos.length >= 12)) return null;

  // Código de país: el prefijo conocido MÁS LARGO que matchee (593 antes que 5).
  const pais = [...CODIGOS_PAIS].sort((a, b) => b.length - a.length).find((c) => digitos.startsWith(c));
  if (!pais) return null;

  const numero = digitos.slice(pais.length);
  if (numero.length < 6 || numero.length > 12) return null;
  return { pais, numero };
}

/**
 * Número E.164 SIN '+', listo para wa.me.
 *
 * ⚠️ Argentina: WhatsApp exige el 9 entre país y área para celulares
 * (54 9 11 …). Si falta, se inserta acá — y el 0 de discado local que suele
 * venir pegado al área ('0351…') se saca, porque en E.164 no va.
 */
export function numeroWhatsapp(pais: string, numero: string): string {
  let n = soloDigitos(numero);
  if (pais === '54') {
    if (n.startsWith('0')) n = n.slice(1);
    if (!n.startsWith('9')) n = `9${n}`;
  }
  return `${soloDigitos(pais)}${n}`;
}

/**
 * La plantilla del mensaje precargado. Con un KR pendiente identificable el
 * mensaje pregunta por ESO; sin KR, cae a la versión genérica. El texto es el
 * borrador acordado en el ticket — si se cambia, se cambia acá.
 */
export function mensajeSeguimiento(nombre: string, krPendiente: string | null): string {
  const nombrePila = nombre.trim().split(/\s+/)[0] ?? nombre;
  return krPendiente
    ? `Hola ${nombrePila}, ¿cómo venís con ${krPendiente}? Quería ver si te trabaste en algo.`
    : `Hola ${nombrePila}, ¿cómo venís con el plan? Quería ver si te trabaste en algo.`;
}

/**
 * El mensaje para una NOTA abierta (ticket 10A): el flujo real es resolver la
 * conversación por WhatsApp y volver a escribir la devolución en dos líneas.
 * La nota va citada para que el alumno sepa de qué le hablan.
 */
export function mensajeNota(nombre: string, nota: string): string {
  const nombrePila = nombre.trim().split(/\s+/)[0] ?? nombre;
  const recorte = nota.length > 160 ? `${nota.slice(0, 157)}…` : nota;
  return `Hola ${nombrePila}, vi tu nota: «${recorte}». Contame un poco más así lo resolvemos.`;
}

/** El link listo para abrir: wa.me con el mensaje precargado. */
export function linkWhatsapp(pais: string, numero: string, mensaje: string): string {
  return `https://wa.me/${numeroWhatsapp(pais, numero)}?text=${encodeURIComponent(mensaje)}`;
}
