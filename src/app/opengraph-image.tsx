import { ImageResponse } from 'next/og';

export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';
export const runtime = 'edge';

export default function OGImage() {
  return new ImageResponse(
    (
      <div tw="flex h-full w-full flex-col items-center justify-center bg-gradient-to-tr from-blue-50 to-indigo-50 text-gray-900 font-sans">
        <div tw="text-7xl font-extrabold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Bank o&apos;Bryan
        </div>
        <div tw="mt-4 text-3xl text-gray-600">Family Banking for Kids</div>
      </div>
    ),
    { ...size }
  );
}


