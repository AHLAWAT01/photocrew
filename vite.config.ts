import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Link previews need absolute URLs. Netlify sets URL during its own builds; elsewhere run
// `SITE_URL=https://your-domain npm run build`. Without either, the tags are left out.
function socialMeta(siteUrl: string | undefined): Plugin {
  return {
    name: 'photocrew-social-meta',
    transformIndexHtml(html, ctx) {
      if (!siteUrl || ctx.path !== '/index.html') return html;
      const base = siteUrl.replace(/\/+$/, '');
      return [
        { tag: 'link', attrs: { rel: 'canonical', href: `${base}/` }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:url', content: `${base}/` }, injectTo: 'head' },
        { tag: 'meta', attrs: { property: 'og:image', content: `${base}/og.jpg` }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'twitter:image', content: `${base}/og.jpg` }, injectTo: 'head' },
      ];
    },
  };
}

// HTTPS is required: WebRTC signaling crypto (crypto.subtle), Screen Wake Lock
// and the Web Share API are only available in secure contexts. basicSsl gives
// the dev server a self-signed cert so phones on your Wi-Fi can use the LAN URL.
export default defineConfig({
  // Two static pages: the landing page at / and the app at /app/.
  appType: 'mpa',
  // Relative asset URLs, so the build also works from a sub-folder (e.g. GitHub Pages).
  base: './',
  plugins: [react(), tailwindcss(), basicSsl(), socialMeta(process.env.SITE_URL ?? process.env.URL)],
  build: { rolldownOptions: { input: { landing: 'index.html', app: 'app/index.html' } } },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
