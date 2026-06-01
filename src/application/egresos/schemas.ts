/**
 * CAPA 2 — APLICACIÓN · Módulo Egresos · Validación Zod.
 * Doble moneda con derivación (ARS+USD mandan; misma regla que pagos).
 */
import { z } from 'zod';
import { CATEGORIAS_EGRESO } from '../../domain/egresos/categorias';

export const categoriaEgresoSchema = z.enum(CATEGORIAS_EGRESO);

export const egresoInputSchema = z
  .object({
    idEgreso: z.string().min(1).optional(),
    fecha: z.string().min(8, 'Fecha inválida'),
    categoria: categoriaEgresoSchema,
    concepto: z.string().optional(),
    montoUsd: z.number().positive().optional(),
    montoArs: z.number().positive().optional(),
    cotizacion: z.number().positive().optional(),
    recurrente: z.boolean().default(false),
    medioPago: z.string().optional(),
    comentarios: z.string().optional(),
  })
  .transform((e) => {
    // ARS + USD mandan → cotización derivada; si falta uno y hay cotización, se completa.
    let { montoUsd, montoArs, cotizacion } = e;
    const ok = (n?: number) => n !== undefined && n > 0;
    if (ok(montoUsd) && ok(montoArs)) cotizacion = montoArs! / montoUsd!;
    else if (ok(montoUsd) && ok(cotizacion)) montoArs = montoUsd! * cotizacion!;
    else if (ok(montoArs) && ok(cotizacion)) montoUsd = montoArs! / cotizacion!;
    return { ...e, montoUsd, montoArs, cotizacion };
  })
  .superRefine((e, ctx) => {
    if (e.montoUsd === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cargá monto USD, o monto ARS junto a la cotización.',
        path: ['montoUsd'],
      });
    }
  });

export type EgresoInput = z.infer<typeof egresoInputSchema>;
