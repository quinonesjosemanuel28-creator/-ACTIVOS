import { ImageResponse } from 'next/og';

// Apple touch icon (180×180): el isotipo «+» sobre el dorado institucional.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #C9A961 0%, #B8902F 100%)',
          borderRadius: '40px',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', width: '24px', height: '96px', backgroundColor: '#0A1F44', borderRadius: '6px' }} />
        <div style={{ position: 'absolute', width: '96px', height: '24px', backgroundColor: '#0A1F44', borderRadius: '6px' }} />
      </div>
    ),
    { ...size },
  );
}
