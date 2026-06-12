/**
 * CAPA 2 — APLICACIÓN · Asistente IA (text-to-SQL).
 *
 * Flujo: pregunta + esquema (solo nombres) → Claude genera UNA SELECT →
 * guard puro valida solo-lectura → ejecución READONLY (segundo candado) →
 * filas (máx 50) de vuelta a Claude para explicarlas en español rioplatense.
 *
 * Errores con elegancia: si falta la API key o la IA falla, devuelve un
 * objeto con `disponible/ok` en false y un mensaje claro (no rompe la app).
 */
import { ASISTENTE_MODELO, asistenteDisponible, getAnthropic } from '../../infrastructure/anthropic/cliente';
import { extraerEsquema, ejecutarSelect } from '../../infrastructure/db/asistenteDb';
import { driverConfigurado } from '../../infrastructure/db/factory';
import { describirEsquema } from '../../domain/asistente/esquema';
import { contextoSql, type DialectoSql } from '../../domain/asistente/guia';
import { conLimite, esSoloLectura } from '../../domain/asistente/sqlGuard';

export const LIMITE_FILAS = 50;

export interface RespuestaAsistente {
  disponible: boolean;
  ok: boolean;
  respuesta: string;
  sql?: string;
  columnas?: string[];
  filas?: unknown[][];
}

/** Extrae la primera SQL de la respuesta del modelo (tolera ```sql fences). */
function extraerSql(texto: string): string {
  const fence = texto.match(/```(?:sql)?\s*([\s\S]*?)```/i);
  const crudo = (fence?.[1] ?? texto).trim();
  // Toma desde el primer SELECT/WITH hasta el final (descarta prosa previa).
  const m = crudo.match(/\b(select|with)\b[\s\S]*/i);
  return (m ? m[0] : crudo).trim();
}

function primerTexto(content: { type: string; text?: string }[]): string {
  const t = content.find((b) => b.type === 'text');
  return t?.text ?? '';
}

export async function responderPregunta(pregunta: string): Promise<RespuestaAsistente> {
  if (typeof pregunta !== 'string' || pregunta.trim() === '') {
    return { disponible: true, ok: false, respuesta: 'Escribí una pregunta.' };
  }
  if (!asistenteDisponible()) {
    return {
      disponible: false,
      ok: false,
      respuesta:
        'El asistente IA no está configurado. Cargá tu ANTHROPIC_API_KEY en el archivo .env y reiniciá el server.',
    };
  }

  const client = getAnthropic()!;
  const esquema = describirEsquema(await extraerEsquema());
  // El SQL generado debe hablar el dialecto del motor activo (DB_DRIVER).
  const dialecto: DialectoSql = driverConfigurado() === 'postgres' ? 'postgres' : 'sqlite';
  const motor = dialecto === 'postgres' ? 'PostgreSQL' : 'SQLite';
  const filtroMes =
    dialecto === 'postgres' ? "substr(fecha_pago,1,7) = 'YYYY-MM'" : "strftime('%Y-%m', fecha_pago)";

  try {
    // 1) Pregunta + esquema → SQL (solo nombres de tablas/columnas, sin datos).
    const genie = await client.messages.create({
      model: ASISTENTE_MODELO,
      max_tokens: 1024,
      system:
        `Sos un generador de SQL para ${motor} del dashboard de +Activos Academy. ` +
        'A partir del ESQUEMA REAL, las notas de negocio y los ejemplos, devolvés UNA sola ' +
        'consulta SELECT de solo lectura que responda la pregunta.\n' +
        'REGLAS ESTRICTAS:\n' +
        '- Usá EXCLUSIVAMENTE nombres de tablas y columnas que aparecen en el ESQUEMA REAL. NO inventes columnas.\n' +
        `- La tabla "pagos" NO tiene columna "mes": para filtrar por mes usá ${filtroMes}.\n` +
        '- Facturación/cash = SUM(monto_usd) de "pagos" (NO de "ventas" ni "cobros", que son legacy).\n' +
        '- Solo SELECT (o WITH … SELECT); nunca INSERT/UPDATE/DELETE/DDL; una sola sentencia, sin punto y coma extra.\n' +
        '- Respondé ÚNICAMENTE con la SQL, sin explicación ni markdown.\n\n' +
        contextoSql(esquema, dialecto),
      messages: [{ role: 'user', content: `Pregunta: ${pregunta}\n\nSQL:` }],
    });
    const sql = extraerSql(primerTexto(genie.content as { type: string; text?: string }[]));

    // 2) Guard puro (primer candado).
    const guard = esSoloLectura(sql);
    if (!guard.ok) {
      return { disponible: true, ok: false, sql, respuesta: `No pude generar una consulta segura: ${guard.motivo}` };
    }

    // 3) Ejecución READONLY (segundo candado) con LIMIT defensivo.
    const sqlConLimite = conLimite(sql, LIMITE_FILAS);
    const { columnas, filas } = await ejecutarSelect(sqlConLimite);
    const filasAcotadas = filas.slice(0, LIMITE_FILAS);

    // 4) Filas → Claude para explicar en español rioplatense.
    const tabla = [columnas.join(' | '), ...filasAcotadas.map((f) => f.map((c) => String(c ?? '')).join(' | '))].join('\n');
    const explica = await client.messages.create({
      model: ASISTENTE_MODELO,
      max_tokens: 1024,
      system:
        'Sos el asistente financiero de +Activos Academy. Explicás resultados de consultas en español rioplatense, ' +
        'claro y conciso. Usás los datos provistos; no inventás. Montos en USD salvo que la columna indique ARS.',
      messages: [
        {
          role: 'user',
          content: `Pregunta del usuario: ${pregunta}\n\nResultado de la consulta (máx ${LIMITE_FILAS} filas):\n${tabla || '(sin filas)'}\n\nRespondé la pregunta en base a estos datos.`,
        },
      ],
    });
    const respuesta = primerTexto(explica.content as { type: string; text?: string }[]).trim();

    return { disponible: true, ok: true, sql: sqlConLimite, columnas, filas: filasAcotadas, respuesta };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return { disponible: true, ok: false, respuesta: `Hubo un problema al consultar la IA o ejecutar la consulta: ${msg}` };
  }
}
