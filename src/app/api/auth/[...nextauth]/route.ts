import { handlers } from "@/auth";

// Expose les endpoints NextAuth (GET/POST) :
// - /api/auth/signin, /api/auth/signout, /api/auth/session, /api/auth/callback…
export const { GET, POST } = handlers;