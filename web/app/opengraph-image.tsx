import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

// Imagen Open Graph en marca (navy/dorado, Satoshi real) — 1200×630.
export const alt = '+Activos Holding — Profesionalizamos el dinero en Latinoamérica';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  // Satoshi estático en .woff (satori no soporta woff2). Lectura por FS:
  // la ruta se prerenderiza en build, donde app/fonts existe en el proyecto.
  const fontsDir = path.join(process.cwd(), 'app', 'fonts');
  const [bold, black] = await Promise.all([
    readFile(path.join(fontsDir, 'Satoshi-Bold.woff')),
    readFile(path.join(fontsDir, 'Satoshi-Black.woff')),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(180deg, #10305E 0%, #0A1F44 45%, #06122B 100%)',
          padding: '72px',
          fontFamily: 'Satoshi',
        }}
      >
        {/* Lockup del logo: isotipo + Activos + bajada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              background: 'linear-gradient(135deg, #C9A961 0%, #B8902F 100%)',
              borderRadius: '16px',
              position: 'relative',
            }}
          >
            {/* Signo + */}
            <div style={{ position: 'absolute', width: '8px', height: '32px', backgroundColor: '#0A1F44', borderRadius: '2px' }} />
            <div style={{ position: 'absolute', width: '32px', height: '8px', backgroundColor: '#0A1F44', borderRadius: '2px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: '34px', color: '#F8F7F3', fontWeight: 900 }}>
              Activos
            </div>
            <div style={{ display: 'flex', fontSize: '13px', letterSpacing: '7px', color: '#C9A961', fontWeight: 700, marginTop: '2px' }}>
              HOLDING
            </div>
          </div>
        </div>

        {/* Eyebrow + claim */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '22px' }}>
            <div style={{ display: 'flex', width: '36px', height: '2px', backgroundColor: '#B8902F' }} />
            <div style={{ display: 'flex', fontSize: '21px', letterSpacing: '5px', color: '#C9A961', fontWeight: 700 }}>
              HOLDING FINANCIERO · LATINOAMÉRICA
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: '64px', lineHeight: 1.08, color: '#F8F7F3', fontWeight: 900, maxWidth: '980px' }}>
            Profesionalizamos el dinero en&nbsp;
            <span style={{ color: '#C9A961' }}>Latinoamérica.</span>
          </div>
        </div>

        {/* Las 4 unidades con sus acentos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '28px', fontSize: '22px', fontWeight: 700 }}>
          {[
            { n: 'Academy', c: '#C9A961' },
            { n: 'Financiera', c: '#7A9BD1' },
            { n: 'Legal & Contable', c: '#6FA88C' },
            { n: 'Software', c: '#2BB89C' },
          ].map((u, i) => (
            <div key={u.n} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', width: '10px', height: '10px', borderRadius: '5px', backgroundColor: u.c }} />
              <div style={{ display: 'flex', color: 'rgba(248,247,243,0.8)' }}>{u.n}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Satoshi', data: bold, weight: 700, style: 'normal' },
        { name: 'Satoshi', data: black, weight: 900, style: 'normal' },
      ],
    },
  );
}
