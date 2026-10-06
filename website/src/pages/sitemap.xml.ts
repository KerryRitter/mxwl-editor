import type { APIRoute } from 'astro';
import { guides } from '../data/product';
export const GET: APIRoute = () => {
  const routes = [
    '',
    'tour/',
    'agents/',
    'remote/',
    'tailscale/',
    'github/',
    'plugins/',
    'download/',
    'about/',
    'docs/',
    ...guides.map((guide) => `docs/${guide.slug}/`),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>https://www.mxwl.work/${route}</loc></url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } },
  );
};
