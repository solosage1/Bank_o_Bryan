import { Loader2, Check } from 'lucide-react';

export const Icons = {
  spinner: Loader2,
  check: Check,
  // Multi-color Google "G" glyph (brand colors), not driven by currentColor
  googleGlyph: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
      <path fill="#4285F4" d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.8-6.8C35.9 2.3 30.5 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.1C12.3 13.7 17.7 9.5 24 9.5z"/>
      <path fill="#34A853" d="M46.5 24.5c0-1.6-.2-3.1-.6-4.5H24v9h12.6c-.5 2.7-1.9 5-4.1 6.8l6.4 5c3.8-3.5 6.1-8.7 6.1-16.3z"/>
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.8l7.9-6.1z"/>
      <path fill="#EA4335" d="M24 48c6.5 0 12-2.1 16-5.9l-6.4-5c-2 1.4-4.6 2.3-9.6 2.3-6.3 0-11.7-4.2-13.5-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
    </svg>
  )
};