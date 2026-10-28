import { defineConfig, type Plugin } from 'vite';

// Only Google's sign-in script and the Drive API are allowed to talk to the app.
// Applied to production builds only: the dev server needs inline styles and a websocket.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "manifest-src 'self'",
  "worker-src 'self'",
].join('; ');

function csp(): Plugin {
  return {
    name: 'kb-csp',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}">`),
  };
}

export default defineConfig({
  // Relative base so the same build works on any GitHub Pages path.
  base: './',
  plugins: [csp()],
  build: { target: 'es2022' },
});
