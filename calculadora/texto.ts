/**
 * Borde de entrada de la calculadora: interpretar lo que se tipea a las
 * apuradas en medio de una llamada. Puro y testeado — es el único lugar donde
 * un dato del cliente puede entrar mal y arruinar todo el diagnóstico.
 */

/**
 * Convención argentina: la coma es decimal y el punto agrupa miles
 * ("1.500" = mil quinientos, "12,5" = doce y medio). Pero "12.5" también se
 * entiende como 12,5, porque nadie escribe miles con un solo dígito adelante.
 *
 * Devuelve NaN si no hay ningún número reconocible; quien llama decide qué
 * hacer con eso (la UI lo trata como 0).
 */
export function parsearNumero(texto: string): number {
  const limpio = String(texto).replace(/[^\d.,-]/g, '').trim();
  if (!limpio || !/\d/.test(limpio)) return Number.NaN;

  const negativo = limpio.startsWith('-');
  const cuerpo = limpio.replace(/-/g, '');
  const ultimaComa = cuerpo.lastIndexOf(',');
  const ultimoPunto = cuerpo.lastIndexOf('.');
  const corte = Math.max(ultimaComa, ultimoPunto);

  let valor: number;
  if (corte === -1) {
    valor = Number(cuerpo);
  } else {
    const decimales = cuerpo.length - corte - 1;
    // Un punto con exactamente 3 dígitos detrás es separador de miles
    // ("1.500"); la coma siempre es decimal.
    const esMiles = cuerpo[corte] === '.' && decimales === 3;
    if (esMiles) {
      valor = Number(cuerpo.replace(/[.,]/g, ''));
    } else {
      const entero = cuerpo.slice(0, corte).replace(/[.,]/g, '');
      valor = Number(`${entero || '0'}.${cuerpo.slice(corte + 1)}`);
    }
  }

  if (!Number.isFinite(valor)) return Number.NaN;
  return negativo ? -valor : valor;
}
