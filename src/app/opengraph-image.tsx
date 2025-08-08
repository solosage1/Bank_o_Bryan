/* eslint-disable */
import { ImageResponse } from 'next/server';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
          color: '#111827',
          fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            backgroundImage: 'linear-gradient(90deg, #2563eb, #7c3aed)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Bank o'Bryan
        </div>
        <div style={{ fontSize: 28, marginTop: 16, color: '#374151' }}>
          Family Banking for Kids
        </div>
      </div>
    ),
    { ...size }
  );
}


