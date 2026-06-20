import { ImageResponse } from 'next/og';

// Imagen Open Graph diseñada en marca (navy/gold) — 1200×630.
// Next la usa para og:image y twitter:image automáticamente.
export const alt = 'Activos Academy — Profesionalizamos a los prestamistas de Latinoamérica';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#0A1F44',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Lockup del logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '5px',
              width: '56px',
              height: '56px',
              backgroundColor: 'rgba(245,241,232,0.08)',
              border: '1px solid #C9A961',
              borderRadius: '10px',
              padding: '12px',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ width: '7px', height: '14px', backgroundColor: '#C9A961', borderRadius: '2px' }} />
            <div style={{ width: '7px', height: '22px', backgroundColor: '#C9A961', borderRadius: '2px' }} />
            <div style={{ width: '7px', height: '30px', backgroundColor: '#B8902F', borderRadius: '2px' }} />
          </div>
          <div style={{ display: 'flex', fontSize: '30px', color: '#F5F1E8', fontWeight: 600 }}>
            Activos Academy
          </div>
        </div>

        {/* Eyebrow + claim */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: '22px', letterSpacing: '4px', color: '#C9A961', marginBottom: '20px' }}>
            PRESENTES EN +5 PAÍSES DE LATAM
          </div>
          <div style={{ display: 'flex', fontSize: '62px', lineHeight: 1.1, color: '#F5F1E8', fontWeight: 700, maxWidth: '920px' }}>
            Profesionalizamos a los prestamistas de Latinoamérica.
          </div>
        </div>

        {/* Las 4 áreas del ecosistema */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', width: '48px', height: '3px', backgroundColor: '#B8902F' }} />
          <div style={{ display: 'flex', fontSize: '24px', color: 'rgba(245,241,232,0.75)' }}>
            Educación · Legal y contable · Tecnología · Cobranzas
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
