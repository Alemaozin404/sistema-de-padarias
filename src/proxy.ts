import { NextResponse, type NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Cabeçalhos de segurança da Fase 09.
 *
 * O nonce é gerado por requisição e propagado por `x-nonce`, para que o Next.js
 * o adicione automaticamente aos seus próprios `<script>` inline. Sem o nonce,
 * cada atualização do framework quebraria a política.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ];
  const csp = directives.join("; ");

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  // API não precisa de CSP; os cabeçalhos de HSTS/X-Content-Type vêm do
  // next.config.ts para todas as rotas.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
