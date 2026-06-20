// ============================================================================
// CONFIGURACIÓN CENTRAL DEL SITIO — única fuente de verdad.
// Editá acá: email, WhatsApp, redes, métricas y contenido institucional.
// Ningún dato de contacto debería estar hardcodeado en los componentes.
// ============================================================================

export const site = {
  name: 'Activos Academy',
  // Marca pública. NO usar razón social ni otros nombres en el sitio.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.activosacademy.com',
  locale: 'es_AR',
  // Claim institucional (héroe).
  tagline: 'Profesionalizamos a los prestamistas de Latinoamérica.',
  // Descripción para metadatos y comprensión en 10 segundos.
  description:
    'Profesionalizamos y formalizamos la actividad prestamista en Latinoamérica con educación, herramientas legales y contables, tecnología SaaS y cobranzas.',
} as const;

// ---------------------------------------------------------------------------
// CONTACTO  ·  (email del dominio configurable; reemplaza al Gmail anterior)
// ---------------------------------------------------------------------------
export const contact = {
  email: 'hola@activosacademy.com', // TODO: confirmar email definitivo del dominio
  whatsapp: 'https://w.app/jjxwfq', // conservar tal cual
  whatsappLabel: 'WhatsApp',
  city: 'La Plata',
  region: 'Provincia de Buenos Aires',
  country: 'Argentina',
  addressFull: 'Ciudad de La Plata, Provincia de Buenos Aires, Argentina',
} as const;

// ---------------------------------------------------------------------------
// REDES  ·  completá las URLs reales. Solo se renderizan las que tengan valor.
// (Se usan en el footer y en el `sameAs` del JSON-LD para SEO).
// ---------------------------------------------------------------------------
export const social = {
  instagram: '', // TODO: ej. https://www.instagram.com/activosacademy
  facebook: '',
  linkedin: '',
  tiktok: '',
  youtube: '',
} as const;

/** Devuelve solo las redes con URL cargada (para footer y sameAs). */
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
// NAVEGACIÓN  ·  single page con anclas
// ---------------------------------------------------------------------------
export const nav = [
  { label: 'Misión', href: '#mision' },
  { label: 'Ecosistema', href: '#ecosistema' },
  { label: 'Cobranzas', href: '#cobranzas' },
  { label: 'Contacto', href: '#contacto' },
] as const;

// ---------------------------------------------------------------------------
// MÉTRICAS  ·  las 4 reales. NO inventar ni agregar otras.
// ---------------------------------------------------------------------------
export const metrics = [
  { value: '+5', label: 'Países en LATAM' },
  { value: '+200', label: 'Prestamistas en la comunidad' },
  { value: '+1.000', label: 'Usuarios del software' },
  { value: '100%', label: 'Formalización legal' },
] as const;

// ---------------------------------------------------------------------------
// MISIÓN Y VISIÓN
// (Misión: tomada del brief. Visión: BORRADOR — reemplazar por la oficial.)
// ---------------------------------------------------------------------------
export const mision =
  'Llevar a quienes hoy prestan dinero de forma informal hacia una actividad ordenada, legal y escalable. Democratizamos el acceso al crédito en Latinoamérica y combatimos la usura, profesionalizando al prestamista en cada paso.';

export const vision =
  'Ser la cabecera del ecosistema que profesionaliza el crédito privado en Latinoamérica: una red de prestamistas formales, tecnológicos y confiables que amplían el acceso al crédito con reglas claras.';

// ---------------------------------------------------------------------------
// EL ECOSISTEMA  ·  4 áreas integradas (la mejora más importante del sitio)
// `icon` referencia un ícono de lucide-react (ver components/sections/Ecosistema).
// ---------------------------------------------------------------------------
export const ecosystem = [
  {
    id: 'educacion',
    icon: 'GraduationCap',
    title: 'Educación y liderazgo',
    role: 'La puerta de entrada.',
    description:
      'Formamos y profesionalizamos prestamistas, desarrollamos liderazgo y construimos comunidad. Acá empieza el recorrido.',
    bullets: [
      'Formación para profesionalizar al prestamista',
      'Desarrollo de liderazgo',
      'Comunidad y networking en LATAM',
    ],
  },
  {
    id: 'legal',
    icon: 'ShieldCheck',
    title: 'Legal y contable',
    role: 'El blindaje.',
    description:
      'Formalizamos la actividad según la normativa de cada país: constitución de SAS, contratos y estructura contable.',
    bullets: [
      'Constitución de SAS para prestar',
      'Contratos a medida',
      'Estructura contable ordenada',
    ],
  },
  {
    id: 'tecnologia',
    icon: 'MonitorCog',
    title: 'Tecnología y SaaS',
    role: 'El sistema operativo.',
    description:
      'Software de gestión de préstamos a medida para administrar carteras de clientes a gran escala, sin perder el control.',
    bullets: [
      'Gestión de carteras de clientes',
      'Software de préstamos a medida',
      'Escala sin perder el control',
    ],
  },
  {
    id: 'cobranzas',
    icon: 'Handshake',
    title: 'Cobranzas',
    role: 'La gestión de cartera.',
    description:
      'Gestión extrajudicial de carteras —seguimiento, refinanciación y renegociación— respaldada por un equipo de abogados.',
    bullets: [
      'Seguimiento y refinanciación',
      'Renegociación de deudas',
      'Respaldo de un equipo de abogados',
    ],
  },
] as const;

/** Línea que explica la integración del ecosistema (el recorrido del cliente). */
export const ecosystemIntegration =
  'Entrás por educación, te formalizás con legal, escalás con tecnología y gestionás la mora con cobranzas. Un mismo cliente recorre todo el ecosistema.';

// ---------------------------------------------------------------------------
// COBRANZAS  ·  detalle del servicio (profundización del área)
// ---------------------------------------------------------------------------
export const cobranza = {
  title: 'Servicio de cobranzas',
  intro:
    'Gestión extrajudicial de carteras de préstamos, profesional y respaldada legalmente. Recuperamos cartera cuidando la relación con el cliente.',
  items: [
    {
      title: 'Seguimiento',
      description:
        'Monitoreo activo de la cartera y contacto temprano para anticipar la mora.',
    },
    {
      title: 'Refinanciación',
      description:
        'Nuevos esquemas de pago realistas que recuperan el crédito sin romper la relación.',
    },
    {
      title: 'Renegociación',
      description:
        'Acuerdos a medida sobre saldos y plazos para destrabar deudas estancadas.',
    },
    {
      title: 'Respaldo legal',
      description:
        'Cada gestión está respaldada por un equipo de abogados especializado en cobranza extrajudicial.',
    },
  ],
} as const;

// ---------------------------------------------------------------------------
// VALORES  ·  los 6 institucionales
// ---------------------------------------------------------------------------
export const values = [
  {
    icon: 'Award',
    title: 'Profesionalismo',
    description:
      'Estándares altos en cada interacción, del primer contacto al respaldo legal.',
  },
  {
    icon: 'Lightbulb',
    title: 'Innovación',
    description:
      'Tecnología propia para que prestar a escala sea simple y ordenado.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Responsabilidad',
    description: 'Cuidamos el capital, los datos y la palabra de cada miembro.',
  },
  {
    icon: 'HeartHandshake',
    title: 'Humanidad',
    description:
      'Detrás de cada cartera hay personas. Crédito con criterio y respeto.',
  },
  {
    icon: 'Compass',
    title: 'Liderazgo',
    description:
      'Formamos referentes que ordenan y elevan el mercado del crédito.',
  },
  {
    icon: 'Eye',
    title: 'Transparencia',
    description: 'Reglas claras, números a la vista y procesos auditables.',
  },
] as const;
