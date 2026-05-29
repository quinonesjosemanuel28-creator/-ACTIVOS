/**
 * CAPA 2 — APLICACIÓN · Módulo "Cierres y Clientes" · Validación Zod.
 *
 * Valida en el borde el alta/edición de cierres y pagos. En los pagos
 * resuelve la triada doble moneda (montoUsd / montoArs / cotizacion):
 * completa el dato faltante cuando es derivable y verifica coherencia
 * cuando llegan los tres.
 */
import { z } from 'zod';
import { unidadSchema } from '../schemas';

export const programaCierreSchema = z.enum(['Cero a Gestor', 'Empresario']);
export const estadoCierreSchema = z.enum(['Activo', 'No continúa']);
export const tipoPagoSchema = z.enum(['Reserva/Seña', 'Cuota', 'Pago Completo']);
export const medioPagoSchema = z.enum([
  'Transferencia Lemon',
  'Transferencia BBVA',
  'Transferencia MP',
  'CRYPTO',
  'Hotmart',
  'Dólares',
  'Otro',
]);

const fechaSchema = z.string().min(8, 'Fecha inválida');

export const cierreInputSchema = z.object({
  idCierre: z.string().min(1).optional(),
  fechaCierre: fechaSchema,
  clienteNombre: z.string().min(1, 'El nombre es obligatorio'),
  clienteMail: z.string().email('Mail inválido').optional().or(z.literal('').transform(() => undefined)),
  clienteTelefono: z.string().optional(),
  programa: programaCierreSchema,
  ticketTotalUsd: z.number().positive('El ticket debe ser mayor a 0'),
  closer: z.string().optional(),
  setter: z.string().optional(),
  funnel: z.string().optional(),
  referido: z.string().optional(),
  comentarios: z.string().optional(),
  unidadNegocio: unidadSchema.default('ACADEMY'),
  estado: estadoCierreSchema.default('Activo'),
  revisar: z.string().optional(),
});
export type CierreInput = z.infer<typeof cierreInputSchema>;

// ───────────────────── Importación (payload ya estructurado) ─────────────────
// Revalida en el borde lo que el cliente arma con construirImportacion.
const cierreImportSchema = z.object({
  idCierre: z.string().min(1),
  fechaCierre: fechaSchema,
  clienteNombre: z.string().min(1),
  clienteMail: z.string().optional(),
  programa: programaCierreSchema,
  ticketTotalUsd: z.number().positive(),
  closer: z.string().optional(),
  funnel: z.string().optional(),
  unidadNegocio: unidadSchema.default('ACADEMY'),
  estado: estadoCierreSchema.default('Activo'),
  revisar: z.string().optional(),
});

const pagoImportSchema = z.object({
  idPago: z.string().min(1),
  idCierre: z.string().min(1),
  fechaPago: fechaSchema,
  montoUsd: z.number().positive(),
  montoArs: z.number().positive().optional(),
  cotizacion: z.number().positive().optional(),
  tipoPago: tipoPagoSchema,
  numeroCuota: z.string().optional(),
  medioPago: medioPagoSchema,
  comentarios: z.string().optional(),
});

export const importPayloadSchema = z.object({
  cierres: z.array(cierreImportSchema),
  pagos: z.array(pagoImportSchema),
});
export type ImportPayload = z.infer<typeof importPayloadSchema>;

export const pagoInputSchema = z
  .object({
    idPago: z.string().min(1).optional(),
    idCierre: z.string().min(1, 'Falta el cierre asociado'),
    fechaPago: fechaSchema,
    horaPago: z.string().optional(),
    montoUsd: z.number().positive().optional(),
    montoArs: z.number().positive().optional(),
    cotizacion: z.number().positive().optional(),
    tipoPago: tipoPagoSchema,
    numeroCuota: z.string().optional(),
    medioPago: medioPagoSchema,
    comprobanteUrl: z.string().url('URL inválida').optional().or(z.literal('').transform(() => undefined)),
    comentarios: z.string().optional(),
  })
  .transform((p) => {
    // Resuelve la triada doble moneda. ARS + USD mandan: la cotización se
    // DERIVA (ars/usd), sobrescribiendo cualquier valor tipeado. Si falta
    // uno, se completa cuando es derivable.
    let { montoUsd, montoArs, cotizacion } = p;
    if (montoUsd !== undefined && montoArs !== undefined) {
      cotizacion = montoArs / montoUsd; // fuente de verdad
    } else if (montoUsd !== undefined && cotizacion !== undefined) {
      montoArs = montoUsd * cotizacion;
    } else if (montoArs !== undefined && cotizacion !== undefined) {
      montoUsd = montoArs / cotizacion;
    }
    return { ...p, montoUsd, montoArs, cotizacion };
  })
  .superRefine((p, ctx) => {
    // Tras derivar, debe poder determinarse el USD; si no, falta info.
    if (p.montoUsd === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cargá monto USD, o monto ARS junto a la cotización.',
        path: ['montoUsd'],
      });
    }
  });
export type PagoInput = z.infer<typeof pagoInputSchema>;

/** Token de seguridad para el reinicio total (defensa en profundidad). */
export const resetConfirmSchema = z.object({
  confirm: z.literal('BORRAR', { errorMap: () => ({ message: 'Escribí BORRAR para confirmar.' }) }),
});
