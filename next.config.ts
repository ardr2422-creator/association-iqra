import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Politique de sécurité du contenu : le navigateur n'exécute et ne charge que
 * ce qui vient de l'application elle-même, n'envoie de formulaire nulle part
 * ailleurs et refuse d'afficher l'application dans une autre page (cadre).
 * `'unsafe-inline'` est nécessaire aux scripts de démarrage de Next.js tant que
 * les pages sont pré-rendues (voir la doc Next « CSP without nonces »).
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? " ws:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS obligatoire pendant deux ans (ignoré par les navigateurs en HTTP local).
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Le reçu PDF est affiché par le lecteur intégré du navigateur, que la règle
      // `object-src 'none'` peut bloquer. Un PDF n'exécute rien dans la page : il
      // garde l'interdiction d'être affiché dans un cadre (et `nosniff`).
      {
        source: "/recus/:id/pdf",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
