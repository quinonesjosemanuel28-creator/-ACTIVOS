/**
 * CALCULADORA DE MÁRGENES · +Activos Academy — capa de interfaz.
 *
 * Se opera en vivo mientras el closer habla con el lead: cada tecla recalcula
 * y repinta. Toda la matemática vive en el dominio (`margenes.ts`, testeado);
 * acá solo se lee del DOM, se formatea y se dibuja.
 *
 * Este archivo se empaqueta y se inyecta dentro del HTML: el resultado es un
 * único archivo sin dependencias externas, que abre en cualquier navegador
 * aunque no haya internet en la sala.
 */
import {
  calcular,
  descomponer,
  escenarioSugerido,
  normalizar,
  retornoPrograma,
  type Descomposicion,
  type EscenarioPrestamista,
  type ResultadoPrestamista,
} from '../src/domain/calculadora/margenes';
import { parsearNumero } from './texto';

type ClaveCampo = keyof EscenarioPrestamista;
type Moneda = 'ARS' | 'USD';
type Tema = 'auto' | 'light' | 'dark';

const CLAVE_GUARDADO = 'activos.calculadora.margenes.v1';
const RAYA = '—';

// ───────────────────────── Campos de la consola ─────────────────────────

interface DefCampo {
  campo: ClaveCampo;
  grupo: string;
  nombre: string;
  ayuda: string;
  unidad: 'dinero' | 'pct' | 'meses' | 'dias';
  /** [mínimo, máximo, paso] en unidades de pantalla. */
  rango?: [number, number, number];
}

const GRUPOS: { id: string; titulo: string }[] = [
  { id: 'cartera', titulo: 'La cartera' },
  { id: 'precio', titulo: 'Precio y plazo' },
  { id: 'cobranza', titulo: 'Cobranza' },
  { id: 'estructura', titulo: 'Estructura' },
];

const DEFS: DefCampo[] = [
  {
    campo: 'capitalColocado',
    grupo: 'cartera',
    nombre: 'Capital colocado',
    ayuda: 'Cuánta plata tiene hoy prestada en la calle',
    unidad: 'dinero',
  },
  {
    campo: 'capitalTerceros',
    grupo: 'cartera',
    nombre: 'De eso, plata de terceros',
    ayuda: 'Capital de inversores o socios que hay que devolver',
    unidad: 'dinero',
  },
  {
    campo: 'costoCapitalMensual',
    grupo: 'cartera',
    nombre: 'Costo mensual de esa plata',
    ayuda: 'Lo que le paga por mes a esos inversores',
    unidad: 'pct',
    rango: [0, 15, 0.25],
  },
  {
    campo: 'tasaMensual',
    grupo: 'precio',
    nombre: 'Tasa mensual que cobra',
    ayuda: 'Interés mensual sobre el monto prestado',
    unidad: 'pct',
    rango: [0, 30, 0.25],
  },
  {
    campo: 'plazoMeses',
    grupo: 'precio',
    nombre: 'Plazo promedio',
    ayuda: 'Cuántos meses dura un préstamo típico',
    unidad: 'meses',
    rango: [0.25, 24, 0.25],
  },
  {
    campo: 'mora',
    grupo: 'cobranza',
    nombre: 'Cartera en mora',
    ayuda: 'Qué parte de lo prestado está atrasada',
    unidad: 'pct',
    rango: [0, 60, 0.5],
  },
  {
    campo: 'diasAtraso',
    grupo: 'cobranza',
    nombre: 'Días de atraso promedio',
    ayuda: 'Cuánto tarda de más el que se atrasa',
    unidad: 'dias',
    rango: [0, 120, 1],
  },
  {
    campo: 'incobrable',
    grupo: 'cobranza',
    nombre: 'Cartera incobrable',
    ayuda: 'Qué parte no vuelve nunca',
    unidad: 'pct',
    rango: [0, 40, 0.5],
  },
  {
    campo: 'gastosMensuales',
    grupo: 'estructura',
    nombre: 'Gastos operativos por mes',
    ayuda: 'Sueldos, cobradores, movilidad, oficina',
    unidad: 'dinero',
  },
];

const VACIO: EscenarioPrestamista = {
  capitalColocado: 0,
  capitalTerceros: 0,
  costoCapitalMensual: 0,
  tasaMensual: 0,
  plazoMeses: 1,
  mora: 0,
  diasAtraso: 0,
  incobrable: 0,
  gastosMensuales: 0,
};

/**
 * Ejemplo para demostrar la herramienta sin un lead delante: un prestamista
 * que gana plata pero deja mucha sobre la mesa. Deliberadamente NO es un caso
 * catastrófico — el que ya está perdiendo no necesita una calculadora para
 * darse cuenta.
 */
function ejemplo(moneda: Moneda): EscenarioPrestamista {
  const escala = moneda === 'ARS' ? 1 : 1 / 250;
  return {
    capitalColocado: 15_000_000 * escala,
    capitalTerceros: 5_000_000 * escala,
    costoCapitalMensual: 0.04,
    tasaMensual: 0.1,
    plazoMeses: 3,
    mora: 0.25,
    diasAtraso: 35,
    incobrable: 0.05,
    gastosMensuales: 600_000 * escala,
  };
}

// ───────────────────────── Estado ─────────────────────────

interface Estado {
  nombre: string;
  moneda: Moneda;
  tema: Tema;
  hoy: EscenarioPrestamista;
  objetivo: EscenarioPrestamista;
  /** Campos del objetivo que el closer editó a mano: dejan de auto-sugerirse. */
  tocados: ClaveCampo[];
  inversion: number;
  roiVisible: boolean;
  presentacion: boolean;
}

const estado: Estado = {
  nombre: '',
  moneda: 'ARS',
  tema: 'auto',
  hoy: { ...VACIO },
  objetivo: { ...VACIO },
  tocados: [],
  inversion: 0,
  roiVisible: false,
  presentacion: false,
};

// ───────────────────────── Números: leer y mostrar ─────────────────────────

function fmtDinero(n: number | null, decimales = 0): string {
  if (n === null || !Number.isFinite(n)) return RAYA;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: estado.moneda,
    maximumFractionDigits: decimales,
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtDineroConSigno(n: number): string {
  if (!Number.isFinite(n)) return RAYA;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtDinero(Math.abs(n))}`;
}

function fmtPct(fraccion: number | null, decimales = 1): string {
  if (fraccion === null || !Number.isFinite(fraccion)) return RAYA;
  return `${(fraccion * 100).toFixed(decimales).replace('.', ',')}%`;
}

function fmtNumero(n: number | null, decimales = 1): string {
  if (n === null || !Number.isFinite(n)) return RAYA;
  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: decimales,
    minimumFractionDigits: 0,
  }).format(n);
}

/** Valor de dominio → texto que se muestra en el campo. */
function aPantalla(def: DefCampo, valor: number): string {
  if (!Number.isFinite(valor)) return '';
  if (def.unidad === 'pct') return fmtNumero(valor * 100, 2);
  if (def.unidad === 'dinero') return fmtNumero(valor, 0);
  return fmtNumero(valor, 2);
}

/** Texto tipeado → valor de dominio. */
function aDominio(def: DefCampo, texto: string): number {
  const n = parsearNumero(texto);
  if (!Number.isFinite(n)) return 0;
  return def.unidad === 'pct' ? n / 100 : n;
}

function sufijo(def: DefCampo): string {
  if (def.unidad === 'pct') return '%';
  if (def.unidad === 'meses') return 'meses';
  if (def.unidad === 'dias') return 'días';
  return '';
}

// ───────────────────────── Atajos de DOM ─────────────────────────

function $(id: string): HTMLElement {
  const nodo = document.getElementById(id);
  if (!nodo) throw new Error(`Falta el nodo #${id} en la plantilla`);
  return nodo;
}

function crear<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  clase?: string,
  texto?: string,
): HTMLElementTagNameMap[K] {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

interface RefCampo {
  hoy: HTMLInputElement;
  objetivo: HTMLInputElement;
  rango?: HTMLInputElement;
}
const refs = new Map<ClaveCampo, RefCampo>();

// ───────────────────────── Construcción de la consola ─────────────────────────

function construirConsola(): void {
  const contenedor = $('grupos');
  contenedor.textContent = '';

  for (const grupo of GRUPOS) {
    const defs = DEFS.filter((d) => d.grupo === grupo.id);
    if (!defs.length) continue;

    const bloque = crear('div', 'grupo');
    bloque.append(crear('span', 'micro grupo-titulo', grupo.titulo));
    for (const def of defs) bloque.append(construirFila(def));
    contenedor.append(bloque);
  }
}

function construirFila(def: DefCampo): HTMLElement {
  const fila = crear('div', 'fila');

  const texto = crear('div', 'fila-txt');
  texto.append(crear('span', 'fila-nombre', def.nombre));
  texto.append(crear('span', 'fila-ayuda', def.ayuda));
  fila.append(texto);

  const campos = crear('div', 'fila-campos');
  const entradaHoy = construirCampo(def, 'hoy');
  const entradaObj = construirCampo(def, 'objetivo');
  campos.append(entradaHoy.caja, entradaObj.caja);
  fila.append(campos);

  const ref: RefCampo = { hoy: entradaHoy.input, objetivo: entradaObj.input };

  if (def.rango) {
    const [min, max, paso] = def.rango;
    const rango = crear('input', 'deslizador') as HTMLInputElement;
    rango.type = 'range';
    rango.min = String(min);
    rango.max = String(max);
    rango.step = String(paso);
    rango.setAttribute('aria-label', `${def.nombre} — objetivo`);
    rango.addEventListener('input', () => {
      const valor = Number(rango.value);
      estado.objetivo[def.campo] = def.unidad === 'pct' ? valor / 100 : valor;
      marcarTocado(def.campo);
      guardar();
      pintar();
    });
    fila.append(rango);
    ref.rango = rango;
  }

  refs.set(def.campo, ref);
  return fila;
}

function construirCampo(
  def: DefCampo,
  lado: 'hoy' | 'objetivo',
): { caja: HTMLElement; input: HTMLInputElement } {
  const caja = crear('label', lado === 'objetivo' ? 'campo campo--obj' : 'campo');
  caja.append(crear('span', 'campo-tag', lado === 'hoy' ? 'Hoy' : 'Objetivo'));

  const input = crear('input') as HTMLInputElement;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.placeholder = '0';
  input.setAttribute('aria-label', `${def.nombre} — ${lado === 'hoy' ? 'hoy' : 'objetivo'}`);

  input.addEventListener('input', () => {
    const valor = aDominio(def, input.value);
    if (lado === 'hoy') {
      estado.hoy[def.campo] = valor;
      sincronizarSugerencia();
    } else {
      estado.objetivo[def.campo] = valor;
      marcarTocado(def.campo);
    }
    guardar();
    pintar();
  });

  // Al salir del campo se normaliza lo tipeado ("15000000" → "15.000.000").
  input.addEventListener('blur', () => {
    const escenario = lado === 'hoy' ? estado.hoy : estado.objetivo;
    input.value = aPantalla(def, normalizar(escenario)[def.campo]);
  });

  caja.append(input);
  const suf = sufijo(def);
  if (suf) caja.append(crear('span', 'campo-sufijo', suf));

  return { caja, input };
}

function marcarTocado(campo: ClaveCampo): void {
  if (!estado.tocados.includes(campo)) estado.tocados.push(campo);
}

/**
 * Los campos del objetivo que el closer todavía no tocó siguen al escenario
 * sugerido: así, con solo cargar los datos de hoy, ya hay una propuesta arriba
 * de la mesa. En cuanto los edita, mandan sus valores.
 */
function sincronizarSugerencia(): void {
  const sugerido = escenarioSugerido(estado.hoy);
  for (const def of DEFS) {
    if (!estado.tocados.includes(def.campo)) {
      estado.objetivo[def.campo] = sugerido[def.campo];
    }
  }
}

// ───────────────────────── Pintado ─────────────────────────

function pintar(): void {
  pintarCampos();

  const hoy = calcular(estado.hoy);
  const objetivo = calcular(estado.objetivo);
  const desglose = descomponer(estado.hoy, estado.objetivo);

  pintarCabecera(hoy, objetivo, desglose);
  pintarMetricas(hoy, objetivo);
  pintarCascada(desglose);
  pintarComposicion(hoy, objetivo);
  pintarRetorno(desglose);
}

/** Refresca los inputs sin pisar el que el closer está tipeando. */
function pintarCampos(): void {
  for (const def of DEFS) {
    const ref = refs.get(def.campo);
    if (!ref) continue;
    const hoy = normalizar(estado.hoy)[def.campo];
    const objetivo = normalizar(estado.objetivo)[def.campo];

    if (document.activeElement !== ref.hoy) ref.hoy.value = aPantalla(def, hoy);
    if (document.activeElement !== ref.objetivo) ref.objetivo.value = aPantalla(def, objetivo);
    if (ref.rango) ref.rango.value = String(def.unidad === 'pct' ? objetivo * 100 : objetivo);
  }

  const nombre = $('nombreLead') as HTMLInputElement;
  if (document.activeElement !== nombre) nombre.value = estado.nombre;
}

function pintarCabecera(
  hoy: ResultadoPrestamista,
  objetivo: ResultadoPrestamista,
  desglose: Descomposicion,
): void {
  $('utilHoy').textContent = fmtDinero(hoy.utilidadAnual);
  $('utilHoyMes').textContent = `${fmtDinero(hoy.utilidadMensual)} por mes`;
  $('utilObj').textContent = fmtDinero(objetivo.utilidadAnual);
  $('utilObjMes').textContent = `${fmtDinero(objetivo.utilidadMensual)} por mes`;

  const delta = desglose.deltaTotal;
  const negativo = delta < 0;
  $('cajaDelta').classList.toggle('delta--negativo', negativo);
  $('deltaRotulo').textContent = negativo
    ? 'Lo que perdería con esos cambios'
    : 'Lo que está dejando sobre la mesa';
  $('deltaAnual').textContent = `${fmtDineroConSigno(delta)} al año`;
  $('deltaMes').textContent = `${fmtDineroConSigno(delta / 12)} por mes`;
  $('flotanteValor').textContent = fmtDineroConSigno(delta);

  const titulo = estado.nombre.trim();
  $('tituloTablero').textContent = titulo
    ? `Utilidad neta anual · ${titulo}`
    : 'Utilidad neta anual';
}

interface DefMetrica {
  etiqueta: string;
  leer: (r: ResultadoPrestamista) => number | null;
  formato: (v: number | null) => string;
  mayorEsMejor: boolean;
}

const METRICAS: DefMetrica[] = [
  {
    etiqueta: 'Margen neto',
    leer: (r) => r.margenNeto,
    formato: (v) => fmtPct(v),
    mayorEsMejor: true,
  },
  {
    etiqueta: 'Retorno sobre tu plata',
    leer: (r) => r.roeAnual,
    formato: (v) => fmtPct(v, 0),
    mayorEsMejor: true,
  },
  {
    etiqueta: 'Giros del capital al año',
    leer: (r) => r.ciclosPorAno,
    formato: (v) => (v === null ? RAYA : `${fmtNumero(v, 1)}×`),
    mayorEsMejor: true,
  },
  {
    etiqueta: 'Capital quieto por mora',
    leer: (r) => r.capitalInmovilizado,
    formato: (v) => fmtDinero(v),
    mayorEsMejor: false,
  },
];

function pintarMetricas(hoy: ResultadoPrestamista, objetivo: ResultadoPrestamista): void {
  const contenedor = $('metricas');
  contenedor.textContent = '';

  for (const def of METRICAS) {
    const valorHoy = def.leer(hoy);
    const valorObj = def.leer(objetivo);

    const celda = crear('div', 'metrica');
    celda.append(crear('span', 'micro', def.etiqueta));

    const valores = crear('div', 'metrica-valores');
    valores.append(crear('span', 'metrica-hoy', def.formato(valorHoy)));
    valores.append(crear('span', 'metrica-flecha', '→'));

    let tono = 'metrica-obj--igual';
    if (valorHoy !== null && valorObj !== null && valorObj !== valorHoy) {
      const mejora = def.mayorEsMejor ? valorObj > valorHoy : valorObj < valorHoy;
      tono = mejora ? 'metrica-obj--mejor' : 'metrica-obj--peor';
    }
    valores.append(crear('span', `metrica-obj ${tono}`, def.formato(valorObj)));

    celda.append(valores);
    contenedor.append(celda);
  }
}

interface FilaCascada {
  nombre: string;
  desde: number;
  hasta: number;
  total: boolean;
  color: string;
  valor: string;
  tonoValor: string;
}

function pintarCascada(desglose: Descomposicion): void {
  const contenedor = $('cascada');
  contenedor.textContent = '';

  // Solo se dibujan las palancas que efectivamente se movieron: una barra de
  // cero no dice nada y ensucia la lectura en la llamada.
  const movidas = desglose.aportes.filter((a) => Math.abs(a.delta) > 0.5);

  const filas: FilaCascada[] = [
    {
      nombre: 'Utilidad hoy',
      desde: 0,
      hasta: desglose.utilidadActual,
      total: true,
      color: 'var(--tinta-2)',
      valor: fmtDinero(desglose.utilidadActual),
      tonoValor: 'var(--tinta)',
    },
    ...movidas.map((aporte) => ({
      nombre: aporte.etiqueta,
      desde: aporte.desde,
      hasta: aporte.hasta,
      total: false,
      color: aporte.delta >= 0 ? 'var(--verde)' : 'var(--rojo)',
      valor: fmtDineroConSigno(aporte.delta),
      tonoValor: aporte.delta >= 0 ? 'var(--verde)' : 'var(--rojo)',
    })),
    {
      nombre: 'Utilidad ordenada',
      desde: 0,
      hasta: desglose.utilidadObjetivo,
      total: true,
      color: 'var(--oro)',
      valor: fmtDinero(desglose.utilidadObjetivo),
      tonoValor: 'var(--oro-tinta)',
    },
  ];

  const puntos = filas.flatMap((f) => [f.desde, f.hasta]).concat(0);
  const minimo = Math.min(...puntos);
  const maximo = Math.max(...puntos);
  const amplitud = maximo - minimo || 1;
  const posicion = (v: number) => ((v - minimo) / amplitud) * 100;

  for (const fila of filas) {
    const nodo = crear('div', `cascada-fila${fila.total ? ' cascada-fila--total' : ''}`);

    const cabecera = crear('div', 'cascada-cab');
    cabecera.append(crear('span', 'cascada-nombre', fila.nombre));
    const valor = crear('span', 'cascada-valor', fila.valor);
    valor.style.color = fila.tonoValor;
    cabecera.append(valor);
    nodo.append(cabecera);

    const pista = crear('div', 'cascada-pista');
    const barra = crear('div', 'cascada-barra');
    const desde = Math.min(fila.desde, fila.hasta);
    const hasta = Math.max(fila.desde, fila.hasta);
    barra.style.left = `${posicion(desde)}%`;
    barra.style.width = `${Math.max(posicion(hasta) - posicion(desde), 0)}%`;
    barra.style.background = fila.color;
    pista.append(barra);

    // Línea del cero, solo si el gráfico cruza a terreno negativo.
    if (minimo < 0) {
      const cero = crear('div', 'cascada-cero');
      cero.style.left = `${posicion(0)}%`;
      pista.append(cero);
    }

    nodo.append(pista);
    contenedor.append(nodo);
  }

  if (!movidas.length) {
    contenedor.append(
      crear(
        'p',
        'vacio',
        'Mové alguna palanca de la columna dorada para ver de dónde sale la mejora.',
      ),
    );
  }
}

interface DefSegmento {
  etiqueta: string;
  color: string;
  tinta: string;
  leer: (r: ResultadoPrestamista) => number;
}

const SEGMENTOS: DefSegmento[] = [
  {
    etiqueta: 'Incobrables',
    color: 'var(--serie-4)',
    tinta: 'var(--sobre-serie-4)',
    leer: (r) => r.perdidaIncobrables,
  },
  {
    etiqueta: 'Costo del capital',
    color: 'var(--serie-2)',
    tinta: 'var(--sobre-serie-2)',
    leer: (r) => r.costoCapitalAnual,
  },
  {
    etiqueta: 'Gastos operativos',
    color: 'var(--serie-1)',
    tinta: 'var(--sobre-serie-1)',
    leer: (r) => r.gastosAnuales,
  },
  {
    etiqueta: 'Utilidad neta',
    color: 'var(--serie-3)',
    tinta: 'var(--sobre-serie-3)',
    leer: (r) => Math.max(0, r.utilidadAnual),
  },
];

function pintarComposicion(hoy: ResultadoPrestamista, objetivo: ResultadoPrestamista): void {
  const contenedor = $('composicion');
  contenedor.textContent = '';
  contenedor.append(barraComposicion('Hoy', hoy));
  contenedor.append(barraComposicion('Ordenado', objetivo));

  const leyenda = $('leyenda');
  leyenda.textContent = '';
  for (const seg of SEGMENTOS) {
    const item = crear('span', 'leyenda-item');
    const chip = crear('span', 'leyenda-chip');
    chip.style.background = seg.color;
    item.append(chip, document.createTextNode(seg.etiqueta));
    leyenda.append(item);
  }
}

function barraComposicion(titulo: string, r: ResultadoPrestamista): HTMLElement {
  const bloque = crear('div', 'comp-bloque');

  // Si los costos superan a los intereses, la base pasa a ser el total de
  // costos: la barra sigue sumando 100% y se ve que la utilidad no entra.
  const costos = r.perdidaIncobrables + r.costoCapitalAnual + r.gastosAnuales;
  const base = Math.max(r.interesesAnuales, costos);

  const cabecera = crear('div', 'comp-cab');
  cabecera.append(crear('span', 'comp-titulo', titulo));
  // El rótulo dice siempre sobre qué total están calculados los porcentajes:
  // cuando hay pérdida la barra ya no es el interés, son los costos.
  cabecera.append(
    crear(
      'span',
      'comp-total',
      r.utilidadAnual < 0
        ? `Costos ${fmtDinero(costos)} vs. intereses ${fmtDinero(r.interesesAnuales)} · pierde ${fmtDinero(Math.abs(r.utilidadAnual))}`
        : `${fmtDinero(r.interesesAnuales)} de intereses al año`,
    ),
  );
  bloque.append(cabecera);

  const barra = crear('div', 'comp-barra');
  if (base <= 0) {
    const vacio = crear('div', 'comp-seg');
    vacio.style.flex = '1';
    vacio.style.background = 'var(--panel-2)';
    barra.append(vacio);
    bloque.append(barra);
    return bloque;
  }

  for (const seg of SEGMENTOS) {
    const valor = seg.leer(r);
    if (valor <= 0) continue;
    const parte = valor / base;
    const nodo = crear('div', 'comp-seg');
    nodo.style.flex = `${parte} 1 0`;
    nodo.style.background = seg.color;
    nodo.style.color = seg.tinta;
    nodo.title = `${seg.etiqueta}: ${fmtDinero(valor)} · ${fmtPct(parte, 0)}`;
    // Etiqueta directa solo si el segmento tiene lugar para leerla.
    if (parte >= 0.09) nodo.textContent = fmtPct(parte, 0);
    barra.append(nodo);
  }

  bloque.append(barra);
  return bloque;
}

function pintarRetorno(desglose: Descomposicion): void {
  const { roi, mesesRecupero } = retornoPrograma(desglose.deltaTotal, estado.inversion);
  $('roiVeces').textContent = roi === null || roi <= 0 ? RAYA : `${fmtNumero(roi, 1)}×`;
  $('roiMeses').textContent =
    mesesRecupero === null
      ? RAYA
      : mesesRecupero < 1
        ? `${fmtNumero(mesesRecupero * 30, 0)} días`
        : `${fmtNumero(mesesRecupero, 1)} meses`;
}

// ───────────────────────── Resumen para pasarle al cliente ─────────────────────────

function armarResumen(): string {
  const hoy = calcular(estado.hoy);
  const objetivo = calcular(estado.objetivo);
  const desglose = descomponer(estado.hoy, estado.objetivo);
  const nombre = estado.nombre.trim();

  const lineas: string[] = [];
  lineas.push(`DIAGNÓSTICO DE MÁRGENES${nombre ? ` · ${nombre}` : ''}`);
  lineas.push('+Activos Academy');
  lineas.push('');
  lineas.push('COMO ESTÁ HOY');
  lineas.push(`• Capital colocado: ${fmtDinero(normalizar(estado.hoy).capitalColocado)}`);
  lineas.push(`• Utilidad neta: ${fmtDinero(hoy.utilidadAnual)} al año (${fmtDinero(hoy.utilidadMensual)} por mes)`);
  lineas.push(`• Margen neto: ${fmtPct(hoy.margenNeto)}`);
  lineas.push(`• Retorno sobre tu plata: ${fmtPct(hoy.roeAnual, 0)}`);
  lineas.push(`• El capital gira ${fmtNumero(hoy.ciclosPorAno, 1)} veces al año`);
  lineas.push(`• Capital quieto por mora: ${fmtDinero(hoy.capitalInmovilizado)}`);
  lineas.push('');
  lineas.push('CON EL NEGOCIO ORDENADO');
  lineas.push(`• Utilidad neta: ${fmtDinero(objetivo.utilidadAnual)} al año (${fmtDinero(objetivo.utilidadMensual)} por mes)`);
  lineas.push(`• Margen neto: ${fmtPct(objetivo.margenNeto)}`);
  lineas.push(`• Retorno sobre tu plata: ${fmtPct(objetivo.roeAnual, 0)}`);
  lineas.push(`• El capital gira ${fmtNumero(objetivo.ciclosPorAno, 1)} veces al año`);
  lineas.push('');
  lineas.push(`DIFERENCIA: ${fmtDineroConSigno(desglose.deltaTotal)} al año (${fmtDineroConSigno(desglose.deltaTotal / 12)} por mes)`);

  const movidas = desglose.aportes.filter((a) => Math.abs(a.delta) > 0.5);
  if (movidas.length) {
    lineas.push('');
    lineas.push('DE DÓNDE SALE');
    for (const aporte of movidas) {
      lineas.push(`• ${aporte.etiqueta}: ${fmtDineroConSigno(aporte.delta)}`);
    }
  }

  if (estado.roiVisible && estado.inversion > 0) {
    const { roi, mesesRecupero } = retornoPrograma(desglose.deltaTotal, estado.inversion);
    if (roi !== null && roi > 0 && mesesRecupero !== null) {
      lineas.push('');
      lineas.push(
        `Con una inversión de ${fmtDinero(estado.inversion)}, la mejora la paga en ${fmtNumero(mesesRecupero, 1)} meses (${fmtNumero(roi, 1)}× en el primer año).`,
      );
    }
  }

  lineas.push('');
  lineas.push('Proyección estimada sobre los datos declarados en la llamada. No es una promesa de resultados.');
  return lineas.join('\n');
}

async function copiarResumen(): Promise<void> {
  const texto = armarResumen();
  const boton = $('btnCopiar');
  const original = 'Copiar resumen';
  try {
    await navigator.clipboard.writeText(texto);
    boton.textContent = 'Copiado ✓';
  } catch {
    // Sin permiso de portapapeles (o sin HTTPS): se deja seleccionado para
    // copiar a mano en vez de dejar al closer sin nada.
    const area = crear('textarea') as HTMLTextAreaElement;
    area.value = texto;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const exito = document.execCommand('copy');
    area.remove();
    boton.textContent = exito ? 'Copiado ✓' : 'No se pudo copiar';
  }
  window.setTimeout(() => {
    boton.textContent = original;
  }, 1800);
}

// ───────────────────────── Persistencia ─────────────────────────

function guardar(): void {
  try {
    localStorage.setItem(
      CLAVE_GUARDADO,
      JSON.stringify({
        nombre: estado.nombre,
        moneda: estado.moneda,
        tema: estado.tema,
        hoy: estado.hoy,
        objetivo: estado.objetivo,
        tocados: estado.tocados,
        inversion: estado.inversion,
        roiVisible: estado.roiVisible,
      }),
    );
  } catch {
    // Navegador con almacenamiento bloqueado: la herramienta sigue andando,
    // solo que no recuerda entre recargas.
  }
}

function restaurar(): void {
  let crudo: string | null = null;
  try {
    crudo = localStorage.getItem(CLAVE_GUARDADO);
  } catch {
    return;
  }
  if (!crudo) return;

  try {
    const datos = JSON.parse(crudo) as Partial<Estado>;
    if (typeof datos.nombre === 'string') estado.nombre = datos.nombre;
    if (datos.moneda === 'ARS' || datos.moneda === 'USD') estado.moneda = datos.moneda;
    if (datos.tema === 'auto' || datos.tema === 'light' || datos.tema === 'dark') {
      estado.tema = datos.tema;
    }
    if (datos.hoy) estado.hoy = { ...VACIO, ...datos.hoy };
    if (datos.objetivo) estado.objetivo = { ...VACIO, ...datos.objetivo };
    if (Array.isArray(datos.tocados)) {
      estado.tocados = datos.tocados.filter((c) => DEFS.some((d) => d.campo === c));
    }
    if (typeof datos.inversion === 'number' && Number.isFinite(datos.inversion)) {
      estado.inversion = datos.inversion;
    }
    estado.roiVisible = Boolean(datos.roiVisible);
  } catch {
    // Estado guardado corrupto: se arranca limpio en vez de romper la pantalla.
  }
}

// ───────────────────────── Controles ─────────────────────────

function aplicarMoneda(): void {
  ($('monedaArs') as HTMLButtonElement).setAttribute(
    'aria-pressed',
    String(estado.moneda === 'ARS'),
  );
  ($('monedaUsd') as HTMLButtonElement).setAttribute(
    'aria-pressed',
    String(estado.moneda === 'USD'),
  );
  $('roiSimbolo').textContent = estado.moneda === 'ARS' ? '$' : 'US$';
}

function aplicarTema(): void {
  const raiz = document.documentElement;
  if (estado.tema === 'auto') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', estado.tema);
  const etiqueta = { auto: 'Tema · auto', light: 'Tema · claro', dark: 'Tema · oscuro' };
  $('btnTema').textContent = etiqueta[estado.tema];
}

function aplicarPresentacion(): void {
  document.body.classList.toggle('presentacion', estado.presentacion);
  $('btnPresentacion').setAttribute('aria-pressed', String(estado.presentacion));
}

function aplicarRoi(): void {
  const panel = $('panelRoi');
  panel.hidden = !estado.roiVisible;
  const boton = $('btnRoi');
  boton.setAttribute('aria-pressed', String(estado.roiVisible));
  boton.textContent = estado.roiVisible ? 'Ocultar' : 'Mostrar';
}

function conectarControles(): void {
  const nombre = $('nombreLead') as HTMLInputElement;
  nombre.addEventListener('input', () => {
    estado.nombre = nombre.value;
    guardar();
    pintar();
  });

  $('monedaArs').addEventListener('click', () => {
    estado.moneda = 'ARS';
    aplicarMoneda();
    guardar();
    pintar();
  });
  $('monedaUsd').addEventListener('click', () => {
    estado.moneda = 'USD';
    aplicarMoneda();
    guardar();
    pintar();
  });

  $('btnTema').addEventListener('click', () => {
    const ciclo: Tema[] = ['auto', 'light', 'dark'];
    estado.tema = ciclo[(ciclo.indexOf(estado.tema) + 1) % ciclo.length]!;
    aplicarTema();
    guardar();
  });

  $('btnPresentacion').addEventListener('click', () => {
    estado.presentacion = !estado.presentacion;
    aplicarPresentacion();
  });

  $('btnImprimir').addEventListener('click', () => window.print());
  $('btnCopiar').addEventListener('click', () => void copiarResumen());

  $('btnNuevo').addEventListener('click', () => {
    if (!window.confirm('¿Empezar con un cliente nuevo? Se borran los datos cargados.')) return;
    estado.nombre = '';
    estado.hoy = { ...VACIO };
    estado.objetivo = { ...VACIO };
    estado.tocados = [];
    estado.inversion = 0;
    ($('roiInversion') as HTMLInputElement).value = '';
    guardar();
    pintar();
  });

  $('btnSugerir').addEventListener('click', () => {
    estado.tocados = [];
    sincronizarSugerencia();
    guardar();
    pintar();
  });

  $('btnIgualar').addEventListener('click', () => {
    estado.objetivo = { ...normalizar(estado.hoy) };
    estado.tocados = DEFS.map((d) => d.campo);
    guardar();
    pintar();
  });

  $('btnEjemplo').addEventListener('click', () => {
    estado.nombre = estado.nombre || 'Cliente de ejemplo';
    estado.hoy = ejemplo(estado.moneda);
    estado.tocados = [];
    sincronizarSugerencia();
    guardar();
    pintar();
  });

  $('btnRoi').addEventListener('click', () => {
    estado.roiVisible = !estado.roiVisible;
    aplicarRoi();
    guardar();
  });

  const inversion = $('roiInversion') as HTMLInputElement;
  inversion.addEventListener('input', () => {
    const valor = parsearNumero(inversion.value);
    estado.inversion = Number.isFinite(valor) ? Math.max(0, valor) : 0;
    guardar();
    pintar();
  });
  inversion.addEventListener('blur', () => {
    inversion.value = estado.inversion ? fmtNumero(estado.inversion, 0) : '';
  });

  $('btnFlotante').addEventListener('click', () => {
    document.querySelector('.tablero')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ───────────────────────── Arranque ─────────────────────────

function iniciar(): void {
  restaurar();
  construirConsola();
  conectarControles();
  aplicarMoneda();
  aplicarTema();
  aplicarPresentacion();
  aplicarRoi();

  const inversion = $('roiInversion') as HTMLInputElement;
  inversion.value = estado.inversion ? fmtNumero(estado.inversion, 0) : '';

  pintar();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', iniciar);
} else {
  iniciar();
}
