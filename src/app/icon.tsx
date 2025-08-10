/* eslint-disable */
import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';
export const runtime = 'edge';

export default function Icon() {
  return new ImageResponse(
    (
      <div tw="flex h-full w-full items-center justify-center bg-gradient-to-tr from-blue-600 to-purple-600 rounded-[96px] text-white text-[300px] font-extrabold">
        B
      </div>
    ),
    { ...size }
  );
}


