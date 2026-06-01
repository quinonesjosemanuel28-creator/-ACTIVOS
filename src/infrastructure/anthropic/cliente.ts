/**
 * CAPA 4 — INFRAESTRUCTURA · Cliente de la API de Claude (Anthropic SDK).
 *
 * Lee la API key del entorno (.env, NO hardcodeada). El modelo está en una
 * constante fácil de cambiar (override por ASISTENTE_MODELO). Si no hay key,
 * `disponible` es false y la app sigue funcionando con un aviso claro.
 */
import Anthropic from '@anthropic-ai/sdk';

/** Modelo por defecto: rápido y barato para text-to-SQL. Cambiable por env. */
export const ASISTENTE_MODELO = process.env.ASISTENTE_MODELO ?? 'claude-haiku-4-5';

let instancia: Anthropic | null = null;

export function asistenteDisponible(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Devuelve el cliente, o null si falta la API key (la UI muestra el aviso). */
export function getAnthropic(): Anthropic | null {
  if (!asistenteDisponible()) return null;
  if (!instancia) instancia = new Anthropic(); // toma ANTHROPIC_API_KEY del entorno
  return instancia;
}
