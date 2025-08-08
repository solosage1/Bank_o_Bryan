// Redirect legacy /favicon.ico requests to the dynamic /icon generator
export function GET() {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/icon',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}


