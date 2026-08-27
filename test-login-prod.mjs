/**
 * test-login-prod.mjs
 * ------------------------------------------------------------------
 * Audit automatisé du flux de connexion NextAuth v5 (Credentials) sur
 * la PRODUCTION Vercel (HTTPS).
 *
 * Reproduit exactement ce que fait le client `next-auth/react` :
 *   1. GET  https://<base>/api/auth/csrf                -> jeton CSRF + cookies
 *   2. POST /api/auth/callback/credentials              -> identifiants + csrf
 *   3. GET  /dashboard (avec le cookie de session)      -> attend 200 (et NON 302/307 vers /login)
 *
 * Critère de succès A : le POST doit émettre un `Set-Cookie` contenant le
 *   cookie de session HTTPS `__Secure-authjs.session-token` (sur Vercel,
 *   Auth.js préfixe le cookie de `__Secure-` car `useSecureCookies` est
 *   auto-détecté à true dès que l'URL est en HTTPS).
 * Critère de succès B : GET /dashboard avec ce cookie doit renvoyer HTTP 200
 *   (session acceptée par le proxy) et non une 302/307 vers /login.
 *
 * Usage :   node test-login-prod.mjs [email] [password]
 *           (défauts : admin@excellence-formation.com / password123,
 *            base fixe https://edu-flow-saas.vercel.app)
 */

const baseUrl = "https://edu-flow-saas.vercel.app";
const email = process.argv[2] ?? "admin@excellence-formation.com";
const password = process.argv[3] ?? "password123";

// Cookie HTTPS attendu en production (préfixé `__Secure-`).
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";
const NON_SECURE_SESSION_COOKIE = "authjs.session-token";
const SESSION_COOKIE_NAMES = [NON_SECURE_SESSION_COOKIE, SECURE_SESSION_COOKIE];

console.log("=".repeat(72));
console.log("AUDIT CONNEXION NEXTAUTH v5 — PRODUCTION VERCEL (HTTPS)");
console.log("=".repeat(72));
console.log(`  URL de base : ${baseUrl}`);
console.log(`  Email       : ${email}`);
console.log(`  Mot de passe: ${password.slice(0, 1)}` + "\u2022".repeat(Math.max(password.length - 1, 0)));
console.log("-".repeat(72));

/** Petit « jar » de cookies pour conserver CSRF puis session entre requêtes. */
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(setCookieHeader) {
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const raw of headers) {
      if (!raw) continue;
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // Ne retient pas les cookies de suppression (Max-Age=0).
      if (!/max-age=0/i.test(raw)) {
        this.cookies.set(name, value);
      } else {
        this.cookies.delete(name);
      }
    }
  }
  get header() {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

let pass = true;
const jar = new CookieJar();

const getSetCookie = (res) =>
  res.headers.getSetCookie?.() ?? res.headers.get("set-cookie");

try {
  // ------------------------------------------------------------------
  // ÉTAPE 1 — Récupération du jeton CSRF (+ cookies de base)
  // ------------------------------------------------------------------
  console.log("\n[1/3] GET /api/auth/csrf");
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "application/json" },
  });
  jar.store(getSetCookie(csrfRes));
  console.log(`      -> statut ${csrfRes.status}`);
  if (!csrfRes.ok) {
    console.log("      ✗ Échec de la récupération du jeton CSRF (serveur injoignable ?).");
    process.exit(2);
  }
  const csrfBody = await csrfRes.json();
  const csrfToken = csrfBody?.csrfToken;
  console.log(`      -> csrfToken : ${csrfToken ? csrfToken.slice(0, 18) + "…" : "(absent)"}`);
  if (!csrfToken) {
    console.log("      ✗ Aucun jeton CSRF renvoyé.");
    process.exit(2);
  }
// ------------------------------------------------------------------
  // ÉTAPE 2 — Connexion POST /api/auth/callback/credentials
  // ------------------------------------------------------------------
  console.log("\n[2/3] POST /api/auth/callback/credentials");
  const postRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Crucial : renvoie le cookie CSRF posé lors du GET précédent.
      ...(jar.cookies.size ? { Cookie: jar.header } : {}),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: "/dashboard",
    }),
  });
  const setCookieHeaders = getSetCookie(postRes);
  jar.store(setCookieHeaders);
  const cookieString = (
    Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]
  )
    .filter(Boolean)
    .join("; ");

  console.log(`      -> statut HTTP : ${postRes.status} ${postRes.statusText}`);
  console.log(`      -> Location    : ${postRes.headers.get("location") ?? "(aucune)"}`);

  // Critère A : le Set-Cookie doit contenir un cookie de session HTTPS `__Secure-`.
  console.log("\n  A) Cookie de session HTTPS (Set-Cookie)");
  const hasSecureSession = cookieString.includes(SECURE_SESSION_COOKIE);
  const hasAnySession = SESSION_COOKIE_NAMES.some((n) => cookieString.includes(n));
  console.log(`     presence de « ${SECURE_SESSION_COOKIE} »      : ${hasSecureSession ? "✓" : "✗"}`);
  console.log(`     presence de « ${NON_SECURE_SESSION_COOKIE} » (HTTP) : ${cookieString.includes(NON_SECURE_SESSION_COOKIE) ? "✓" : "✗"}`);
  console.log(`     Set-Cookie bruts :`);
  for (const raw of Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]) {
    if (raw) console.log(`       - ${raw.split(";")[0]}`);
  }
  if (!hasSecureSession || !hasAnySession) {
    pass = false;
  }

  // ------------------------------------------------------------------
  // ÉTAPE 3 — GET /dashboard avec le cookie de session
  // ------------------------------------------------------------------
  console.log("\n[3/3] GET /dashboard avec le cookie de session");
  console.log(`      cookie envoyé : ${jar.header || "(aucun)"}`);
  const dashRes = await fetch(`${baseUrl}/dashboard`, {
    method: "GET",
    redirect: "manual",
    headers: jar.cookies.size ? { Cookie: jar.header } : {},
  });
  const dashStatus = dashRes.status;
  const dashLoc = dashRes.headers.get("location") ?? "";
  const accepted = dashStatus === 200;
  const bouncedToLogin =
    (dashStatus === 302 || dashStatus === 307) && dashLoc.includes("/login");
  console.log(`      -> statut  : ${dashStatus}`);
  console.log(`      -> Location : ${dashLoc || "(aucune redirection)"}`);
  console.log(`      -> session acceptee (200)   : ${accepted ? "✓" : "✗"}`);
  console.log(`      -> renvoye vers /login (echec)  : ${bouncedToLogin ? "✗ OUI — BUG ACTIF" : "✓ non"}`);
  if (!accepted || bouncedToLogin) pass = false;

  // ------------------------------------------------------------------
  // Bilan
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(72));
  if (pass) {
    console.log("RÉSULTAT : ✓ SUCCÈS — session HTTPS établie et /dashboard accessible (200).");
  } else {
    console.log("RÉSULTAT : ✗ ÉCHEC — cookie `__Secure-authjs.session-token` absent ou /dashboard\n          renvoyé vers /login (302/307). Le proxy ne lit pas la session.");
  }
  console.log("=".repeat(72));
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error("\n✗ Exception imprévue :", err);
  process.exit(1);
}