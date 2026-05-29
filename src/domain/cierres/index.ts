/**
 * CAPA 3 — DOMINIO · Barrel del módulo "Cierres y Clientes".
 *
 * Se exporta como namespace para evitar colisiones con el núcleo legacy
 * (que ya define cashCollected, cashNuevo, etc. sobre Venta/Cobro).
 */
export * from './types';
export * as cierresMetrics from './metrics';
