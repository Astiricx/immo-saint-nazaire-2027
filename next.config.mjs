// Sur GitHub Pages, le site est servi sous /<nom-du-dépôt> : le workflow fournit ce préfixe.
// Partout ailleurs (Vercel, Netlify, serveur local), il reste vide.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Application 100 % côté navigateur : export statique dans le dossier out/.
  output: 'export',
  basePath,
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
