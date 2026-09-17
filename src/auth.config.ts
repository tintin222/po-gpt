import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Prisma / Node-only imports) shared between
 * middleware and the full server-side auth setup in src/auth.ts.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { nextUrl, headers } = request;
      const isLoggedIn = !!auth?.user?.id;
      const path = nextUrl.pathname;
      const isPublic = path.startsWith("/login") || path.startsWith("/setup");

      // Behind proxies (Railway) the Host header the app sees is the internal
      // upstream (localhost:8080), so URLs derived from the request would
      // redirect the browser there. Prefer AUTH_URL, then the proxy's
      // forwarded headers, then the request origin (local dev).
      const envBase = process.env.AUTH_URL || process.env.NEXTAUTH_URL;
      const fwdHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
      const fwdProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
      const base = envBase || (fwdHost ? `${fwdProto || "https"}://${fwdHost}` : nextUrl.origin);
      const redirectTo = (to: string) => Response.redirect(new URL(to, base), 307);

      if (isPublic) {
        if (isLoggedIn) return redirectTo("/chat");
        return true;
      }
      if (!isLoggedIn) return redirectTo("/login");
      if (path.startsWith("/admin") && auth.user.role !== "ADMIN") {
        return redirectTo("/chat");
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as "ADMIN" | "USER") ?? "USER";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
