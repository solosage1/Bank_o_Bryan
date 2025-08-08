// Serve a simple SVG favicon at /favicon.ico to avoid 404s in production
// Some browsers accept SVG for favicons even on .ico path.

export function GET() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="12" fill="url(#g)"/>
  <g fill="#fff" font-family="System-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif" font-weight="700">
    <text x="50%" y="50%" font-size="28" dominant-baseline="middle" text-anchor="middle">B</text>
  </g>
  <rect x="10" y="46" width="44" height="6" rx="3" fill="rgba(255,255,255,0.85)"/>
  <rect x="18" y="40" width="28" height="6" rx="3" fill="rgba(255,255,255,0.85)"/>
  <rect x="22" y="18" width="20" height="16" rx="2" fill="rgba(255,255,255,0.9)"/>
  <rect x="26" y="22" width="4" height="8" rx="1" fill="#7c3aed"/>
  <rect x="34" y="22" width="4" height="8" rx="1" fill="#2563eb"/>
  <rect x="10" y="52" width="44" height="2" fill="rgba(0,0,0,0.1)"/>
  <rect x="18" y="46" width="28" height="2" fill="rgba(0,0,0,0.08)"/>
  <rect x="20" y="34" width="24" height="2" fill="rgba(0,0,0,0.1)"/>
  <rect x="22" y="16" width="20" height="2" fill="rgba(0,0,0,0.1)"/>
  <rect x="22" y="18" width="20" height="1" fill="rgba(0,0,0,0.06)"/>
  <rect x="22" y="34" width="20" height="1" fill="rgba(0,0,0,0.06)"/>
  <rect x="26" y="30" width="4" height="1" fill="rgba(0,0,0,0.06)"/>
  <rect x="34" y="30" width="4" height="1" fill="rgba(0,0,0,0.06)"/>
  Sorry, your browser does not support inline SVG.
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}


