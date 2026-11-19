import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite o dev server quando acessado via 127.0.0.1 (Playwright).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Fixa a raiz do workspace: sem isto o Next sobe até a pasta do usuário
  // procurando lockfile, o que quebra o cache do Turbopack.
  turbopack: { root: import.meta.dirname },

  // Cabeçalhos de segurança aplicados a todas as respostas. CSP com nonce é
  // emitida por requisição em src/middleware.ts (Fase 09).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [],
  },
  poweredByHeader: false,
};

export default nextConfig;
