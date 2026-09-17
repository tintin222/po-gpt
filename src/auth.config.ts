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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user?.id;
      const path = nextUrl.pathname;
      const isPublic = path.startsWith("/login") || path.startsWith("/setup");

      if (isPublic) {
        if (isLoggedIn) return Response.redirect(new URL("/chat", nextUrl));
        return true;
      }
      if (!isLoggedIn) return false; // NextAuth redirects to the sign-in page
      if (path.startsWith("/admin") && auth.user.role !== "ADMIN") {
        return Response.redirect(new URL("/chat", nextUrl));
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
