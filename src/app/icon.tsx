/* eslint-disable */
import { ImageResponse } from 'next/server';

export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
          borderRadius: 96,
          color: 'white',
          fontSize: 300,
          fontWeight: 800,
        }}
      >
        B
      </div>
    ),
    { ...size }
  );
}


