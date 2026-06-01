/**
 * CAPA 2 — APLICACIÓN · Validación con Zod en los bordes de datos.
 * Toda entrada externa (formularios, API) se valida acá antes de tocar
 * el dominio o la base.
 */
import { z } from 'zod';

const mesRegex = /^\d{4}-(0[1-9]|1[0-2])$/;
export const mesSchema = z.string().regex(mesRegex, 'Formato de mes inválido (YYYY-MM)');
export const programaSchema = z.enum(['Empresario', 'Gestor']);
export const unidadSchema = z.enum(['ACADEMY', 'LEGAL', 'TECNOLOGIA']);
export const tipoEgresoSchema = z.enum(['Directo', 'Operativo', 'Extraordinario']);

export const ventaInputSchema = z.object({
  idVenta: z.string().min(1).optional(),
  fechaVenta: z.string().min(8),
  cliente: z.string().optional(),
  programa: programaSchema,
  closer: z.string().optional(),
  setter: z.string().optional(),
  funnel: z.string().optional(),
  ticketTotalUsd: z.number().positive(),
  unidadNegocio: unidadSchema.default('ACADEMY'),
});
export type VentaInput = z.infer<typeof ventaInputSchema>;

export const cobroInputSchema = z.object({
  idCobro: z.string().min(1).optional(),
  idVentaOrigen: z.string().optional(),
  fechaCobro: z.string().min(8),
  mesOriginalVenta: mesSchema,
  montoUsd: z.number().positive(),
  programa: programaSchema,
  unidadNegocio: unidadSchema.default('ACADEMY'),
});
export type CobroInput = z.infer<typeof cobroInputSchema>;

export const egresoInputSchema = z.object({
  idEgreso: z.string().min(1).optional(),
  fecha: z.string().min(8),
  tipo: tipoEgresoSchema,
  categoria: z.string().min(1),
  concepto: z.string().optional(),
  montoUsd: z.number().positive(),
  programa: programaSchema.optional(),
  unidadNegocio: unidadSchema.default('ACADEMY'),
});
export type EgresoInput = z.infer<typeof egresoInputSchema>;

export const parametrosInputSchema = z
  .object({
    cajaInicialUsd: z.number(),
    costosFijosMensualesUsd: z.number().nonnegative(),
    metaCashCollectedUsd: z.number().nonnegative(),
    metaMargenOperativo: z.number().min(0).max(1),
    topeCacUsd: z.number().nonnegative(),
    metaTasaCierre: z.number().min(0).max(1),
    runwayMinimoMeses: z.number().nonnegative(),
    objetivoRoas: z.number().nonnegative(),
    objetivoMer: z.number().nonnegative(),
  })
  .partial();
export type ParametrosInput = z.infer<typeof parametrosInputSchema>;

export const funnelInputSchema = z.object({
  agendas: z.number().int().nonnegative(),
  asistieron: z.number().int().nonnegative(),
  // cerrados NO se carga: se deriva de los cierres reales del mes.
});
