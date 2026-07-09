// ============================================================================
// CONFIGURACIÓN CENTRAL DEL SITIO — única fuente de verdad.
// Contenido tomado del Manual de Marca +Activos Holding v1.0 (2026).
// Editá acá: email, WhatsApp, redes y textos. Los componentes no hardcodean nada.
// ============================================================================

export const site = {
  name: '+Activos Holding',
  shortName: 'Activos',
  bajada: 'Holding',
  // Dominio según el manual (Aplicaciones · Web institucional). Configurable por env.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.masactivosholding.com',
  locale: 'es_AR',
  // Claim del héroe (manual · Aplicaciones · Web institucional).
  tagline: 'Profesionalizamos el dinero en Latinoamérica.',
  taglineAccent: 'Latinoamérica.', // parte del claim que va en dorado
  subtitle:
    'Formación, capital, estructura y tecnología en un solo ecosistema financiero.',
  eyebrow: 'Holding financiero · Latinoamérica',
  description:
    'Holding financiero con presencia en Latinoamérica: educación financiera aplicada, capital con respaldo, estructura legal y contable, y software de gestión de carteras. De prestamista a empresario financiero.',
} as const;

// ---------------------------------------------------------------------------
// CONTACTO
// ---------------------------------------------------------------------------
export const contact = {
  email: 'hola@masactivosholding.com', // TODO: confirmar casilla real del dominio
  whatsapp: 'https://w.app/jjxwfq', // conservar tal cual
  city: 'La Plata',
  region: 'Provincia de Buenos Aires',
  country: 'Argentina',
  addressFull: 'Ciudad de La Plata, Provincia de Buenos Aires, Argentina',
} as const;

// ---------------------------------------------------------------------------
// REDES · completar URLs reales. Solo se renderizan las que tengan valor.
// ---------------------------------------------------------------------------
export const social = {
  instagram: '',
  facebook: '',
  linkedin: '',
  tiktok: '',
  youtube: '',
} as const;

/** Devuelve solo las redes con URL cargada (footer y sameAs del JSON-LD). */
export function socialLinks(): { label: string; url: string }[] {
  const map: Record<string, string> = {
    Instagram: social.instagram,
    Facebook: social.facebook,
    LinkedIn: social.linkedin,
    TikTok: social.tiktok,
    YouTube: social.youtube,
  };
  return Object.entries(map)
    .filter(([, url]) => url.length > 0)
    .map(([label, url]) => ({ label, url }));
}

// ---------------------------------------------------------------------------
// NAVEGACIÓN · single page con anclas (orden según mockup del manual, p. 33)
// ---------------------------------------------------------------------------
export const nav = [
  { label: 'Ecosistema', href: '#ecosistema' },
  { label: 'Academy', href: '#academy' },
  { label: 'Financiera', href: '#financiera' },
  { label: 'Legal', href: '#legal' },
  { label: 'Contacto', href: '#contacto' },
] as const;

// ---------------------------------------------------------------------------
// MÉTRICAS DEL HÉROE (manual, p. 33) + MÉTRICAS DE TRACCIÓN (reales)
// ---------------------------------------------------------------------------
export const heroStats = [
  { value: '4', label: 'Unidades de negocio' },
  { value: 'LATAM', label: 'Presencia regional' },
  { value: 'Propio', label: 'Software de gestión' },
] as const;

export const metrics = [
  { value: '+5', label: 'Países en LATAM' },
  { value: '+200', label: 'Prestamistas en la comunidad' },
  { value: '+1.000', label: 'Usuarios del software' },
  { value: '100%', label: 'Formalización legal' },
] as const;

// ---------------------------------------------------------------------------
// ESENCIA DE MARCA (manual, p. 7)
// ---------------------------------------------------------------------------
export const esencia = {
  claim: 'Crear libertad a través de la educación financiera aplicada.',
  claimAccent: 'educación financiera aplicada.',
  body: 'Llevamos orden, método y respaldo adonde no llegan el banco ni la fintech. Democratizamos un conocimiento que casi nunca está disponible: cómo gestionar capital, prestar con criterio y construir una empresa financiera desde cero.',
  pilares: [
    'No depender únicamente de un sueldo.',
    'Usar el capital con inteligencia.',
    'Construir una fuente de ingresos propia.',
    'Profesionalizar una actividad que ya se realiza.',
    'Transformar la economía personal y familiar.',
  ],
} as const;

// ---------------------------------------------------------------------------
// HISTORIA Y FUNDADOR (manual, pp. 5–6)
// ---------------------------------------------------------------------------
export const historia = {
  title: 'Todo empezó con una pregunta.',
  lead: 'Desde chico se preguntaba por qué unos tienen más y otros menos. Con los años, esa respuesta se volvió su propósito.',
  body: '+Activos no nace de un banco ni de una carrera corporativa. Nace de una historia real de esfuerzo, disciplina y aprendizaje en el mercado financiero alternativo. Esa raíz es la que le da autoridad a la marca: no habla desde un escritorio, habla desde la experiencia — y desde las ganas de llevar educación financiera a toda Latinoamérica.',
  timeline: [
    {
      etapa: '14 años',
      titulo: 'La obra.',
      texto: 'Acompaña a su padre a construir. Toma conciencia del sacrificio y decide revertir la realidad de su familia.',
    },
    {
      etapa: '15—21',
      titulo: 'El ring.',
      texto: 'Kickboxing de alto rendimiento hasta semiprofesional. La disciplina del entrenamiento fue su primera escuela.',
    },
    {
      etapa: '19 años',
      titulo: 'El libro.',
      texto: '«Padre Rico, Padre Pobre» responde lo que la escuela no. Se vuelve autodidacta en finanzas y negocios.',
    },
    {
      etapa: 'El salto',
      titulo: 'El primer préstamo.',
      texto: 'Del crédito informal al modelo rentable. Construye cartera, se asocia y formaliza una empresa financiera.',
    },
    {
      etapa: 'Hoy',
      titulo: '+Activos.',
      texto: 'Al negocio de prestar e invertir le suma enseñar el método. Hoy todo convive en un mismo holding.',
    },
  ],
  fundador: {
    nombre: 'José Manuel Quiñones',
    cargo: 'Fundador de +Activos Holding',
    cita: 'Me puse un objetivo y me dije: lo voy a lograr, no importa cuánto tiempo me lleve. Fe y determinación son las dos palabras que más me definen.',
    citaAccent: 'Fe y determinación',
    foto: '/fundador.jpg',
    fotoAlt:
      'José Manuel Quiñones, fundador de +Activos Holding, frente a la Catedral de La Plata',
  },
} as const;

// ---------------------------------------------------------------------------
// MISIÓN Y VISIÓN (manual, p. 8)
// ---------------------------------------------------------------------------
export const mision =
  'Profesionalizar y democratizar el acceso al dinero en los sectores que el sistema tradicional no atiende, transformando la informalidad en un negocio ordenado, rentable y escalable.';

export const vision = [
  {
    plazo: '5 años',
    titulo: 'Presencia pan-latinoamericana',
    texto: 'Una marca de referencia en formación y servicios financieros en toda la región, con partners e inversores en varios países.',
    dark: false,
  },
  {
    plazo: '10 años',
    titulo: 'Una plataforma que conecta',
    texto: 'Un ecosistema central que une a prestamistas, inversores y prestatarios, sostenido por un software propio de gestión de cartera.',
    dark: true,
  },
] as const;

// ---------------------------------------------------------------------------
// POSICIONAMIENTO (manual, p. 10)
// ---------------------------------------------------------------------------
export const posicionamiento = {
  claim: '+Activos es el puente entre el desorden financiero y la profesionalización del negocio.',
  accents: ['desorden financiero', 'profesionalización'],
  support:
    'De la experiencia real a la profesionalización financiera. No competimos con cursos genéricos de finanzas: somos específicos, prácticos y forjados en la experiencia real del mercado.',
} as const;

// ---------------------------------------------------------------------------
// EL ECOSISTEMA · una casa, cuatro unidades (manual, pp. 12–13)
// `accent` es el color exacto de cada unidad definido en el manual.
// ---------------------------------------------------------------------------
export const arquitectura = {
  title: 'Una casa, cuatro unidades.',
  intro:
    '+Activos es una casa monolítica: una sola marca madre —navy y dorado— que respalda a cada unidad de negocio. Todas comparten el mismo sistema visual y verbal; lo único que cambia es un color de acento que identifica a cada una.',
  madre: {
    nombre: '+Activos Holding',
    rol: 'La marca madre',
  },
} as const;

export const unidades = [
  {
    id: 'academy',
    nombre: 'Academy',
    rol: 'Formación',
    accent: '#B8902F', // dorado — el corazón educativo del holding
    descripcion: 'Enseña a prestar con método: análisis, cobranza y control de capital.',
  },
  {
    id: 'financiera',
    nombre: 'Financiera',
    rol: 'Capital',
    accent: '#3F65A6', // azul — solidez y confianza institucional
    descripcion: 'Presta con criterio y respaldo. Evalúa antes de financiar.',
  },
  {
    id: 'legal',
    nombre: 'Legal & Contable',
    rol: 'Estructura',
    accent: '#24503C', // verde inglés — establecido y sobrio
    descripcion: 'Formaliza la actividad: SAS, contratos de mutuo y contabilidad.',
  },
  {
    id: 'software',
    nombre: 'Software',
    rol: 'Tecnología',
    accent: '#2BB89C', // teal — acento vivo del producto
    descripcion: 'SaaS de gestión y administración de la cartera de clientes.',
  },
] as const;

/** Servicio transversal de gestión de cartera (se conserva del sitio anterior). */
export const cobranzas = {
  titulo: 'Gestión de cobranzas para carteras activas',
  texto: 'Seguimiento, refinanciación y renegociación extrajudicial, con respaldo de un equipo de abogados.',
  cta: 'Hablar con el equipo',
} as const;

// ---------------------------------------------------------------------------
// VALORES (manual, p. 9 — los 7 oficiales, con sus descripciones exactas)
// ---------------------------------------------------------------------------
export const valores = [
  {
    titulo: 'Visión',
    descripcion: 'Pensar más allá del préstamo individual y construir una verdadera empresa financiera.',
  },
  {
    titulo: 'Determinación',
    descripcion: 'Crecer con disciplina y constancia, incluso cuando el camino empieza desde abajo.',
  },
  {
    titulo: 'Fe',
    descripcion: 'Creer en el proyecto y en las personas antes de que lleguen los resultados.',
  },
  {
    titulo: 'Liderazgo',
    descripcion: 'Formar personas capaces de tomar mejores decisiones y liderar su crecimiento.',
  },
  {
    titulo: 'Autenticidad',
    descripcion: 'Comunicar desde la experiencia real, sin promesas vacías ni discursos de escritorio.',
  },
  {
    titulo: 'Innovación',
    descripcion: 'Modernizar una actividad que muchas veces se maneja de forma manual e informal.',
  },
  {
    titulo: 'Comunidad',
    descripcion: 'Un espacio donde emprendedores y gestores financieros aprenden y crecen juntos.',
  },
] as const;

export const valoresIntro =
  'No son palabras de pared. Son el filtro con el que se decide cada pieza de comunicación, producto y comunidad.';
