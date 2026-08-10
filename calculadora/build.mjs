/**
 * Empaqueta la Calculadora de Márgenes en un único archivo HTML, sin una sola
 * request externa: la tipografía va embebida en base64 y el JavaScript
 * compilado se inyecta en línea.
 *
 * Por qué así: el closer la usa en la casa del cliente, en un coworking o con
 * el wifi de un bar. Un archivo suelto que abre con doble clic no falla nunca.
 *
 * Genera dos salidas del mismo contenido:
 *   calculadora-margenes.html  documento completo — abrir local o subir a un hosting
 *   artifact.html              fragmento sin <html>/<head>/<body> para publicar
 *
 * Uso: npm run build:calculadora
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = join(AQUI, 'publicar');

/** `String.replace` trata `$&`, `$1`… como especiales: con función, no. */
function reemplazar(texto, marca, contenido) {
  if (!texto.includes(marca)) {
    throw new Error(`La plantilla no tiene la marca ${marca}`);
  }
  return texto.replace(marca, () => contenido);
}

async function main() {
  const plantilla = await readFile(join(AQUI, 'plantilla.html'), 'utf8');

  // 1 · Tipografía de la marca embebida (Fraunces, subconjunto latino).
  const fuente = await readFile(join(AQUI, 'assets', 'fraunces-latin.woff2'));

  // 2 · TypeScript → un bundle de navegador, sin dependencias externas.
  const paquete = await build({
    entryPoints: [join(AQUI, 'app.ts')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: true,
    write: false,
    legalComments: 'none',
  });
  const primero = paquete.outputFiles[0];
  if (!primero) throw new Error('esbuild no devolvió ningún archivo');
  // Un "</script>" dentro del bundle cerraría la etiqueta antes de tiempo.
  const js = primero.text.replace(/<\/script/gi, '<\\/script');

  // 3 · Inyección en la plantilla.
  let cuerpo = reemplazar(plantilla, '__FUENTE_BASE64__', fuente.toString('base64'));
  cuerpo = reemplazar(cuerpo, '__APP__', js);

  // 4 · El fragmento (título + estilos + markup) se envuelve para la versión
  //     que se abre como archivo suelto.
  const corte = cuerpo.indexOf('</style>');
  if (corte === -1) throw new Error('La plantilla no tiene bloque <style>');
  const cabeza = cuerpo.slice(0, corte + '</style>'.length);
  const resto = cuerpo.slice(corte + '</style>'.length);

  const documento = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0a1628" />
<meta name="description" content="Calculadora de márgenes para prestamistas — herramienta de diagnóstico en vivo de +Activos Academy." />
<meta name="robots" content="noindex" />
${cabeza}
</head>
<body>
${resto.trim()}
</body>
</html>
`;

  await mkdir(SALIDA, { recursive: true });
  await writeFile(join(SALIDA, 'calculadora-margenes.html'), documento, 'utf8');
  await writeFile(join(SALIDA, 'artifact.html'), cuerpo.trim(), 'utf8');

  const kb = (t) => `${(Buffer.byteLength(t, 'utf8') / 1024).toFixed(0)} KB`;
  console.log(`✓ calculadora-margenes.html  ${kb(documento)}`);
  console.log(`✓ artifact.html              ${kb(cuerpo)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
