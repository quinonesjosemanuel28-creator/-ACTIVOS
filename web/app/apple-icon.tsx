import { ImageResponse } from 'next/og';

// Apple touch icon (180×180) generado con el isotipo sobre navy.
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
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: '14px',
          backgroundColor: '#0A1F44',
          padding: '52px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ width: '20px', height: '38px', backgroundColor: '#C9A961', borderRadius: '5px' }} />
        <div style={{ width: '20px', height: '62px', backgroundColor: '#C9A961', borderRadius: '5px' }} />
        <div style={{ width: '20px', height: '86px', backgroundColor: '#B8902F', borderRadius: '5px' }} />
      </div>
    ),
    { ...size },
  );
}
