/**
 * test-jwt-secure.mjs
 * ------------------------------------------------------------------
 * Validation HORS-LIGNE de la correction apportée à src/proxy.ts.
 *
 * Reproduit la mécanique interne d'Auth.js v5 pour prouver la cause racine
 * du bug « /login?callbackUrl=/dashboard » sur Vercel (HTTPS) :
 *
 *   - À l'ÉCRITURE, Auth.js tasse le JWT avec `salt = options.cookies.sessionToken.name`.
 *     Sur Vercel `useSecureCookies` est auto-détecté à true (`url.protocol === "https:"`),
 *     donc le cookie s'appelle `__Secure-authjs.session-token` ET le salt vaut ce nom.
 *   - À la LECTURE, `getToken` (next-auth/jwt) utilise par défaut `secureCookie ?? false`,
 *     c.-à-d. cookie `authjs.session-token` NON préfixé (et donc un salt différent).
 *     L'ancien proxy ne lisait donc JAMAIS le cookie `__Secure-` → session null →
 *     redirect /login. C'est le bug.
 *
 * Ce script vérifie :
 *   1. encode() d'un JWT avec salt `__Secure-authjs.session-token`
 *      (= comportement serveur prod) ;
 *   2. la lecture CORRIGÉE (`cookieName` + `secureCookie:true`, comme dans le nouveau
 *      proxy) doit restituer le token → ✓ ;
 *   3. la lecture ANCIENNE (défaut, sans préfixe) échoue → ✓ (preuve de la cause racine).
 *
 * Usage :   node test-jwt-secure.mjs
 */

import { encode, decode, getToken } from "@auth/core/jwt";

const SECRET = "test-secret-not-used-in-prod-that-is-fine-for-this-demo-1234";
const SECURE_COOKIE = "__Secure-authjs.session-token";
const INSECURE_COOKIE = "authjs.session-token";

const payload = {
  sub: "00000000-0000-0000-0000-000000000001",
  email: "admin@excellence-formation.com",
  role: "ADMIN",
  organizationId: "org-01",
  name: "Jean Dupont",
};

// 1) Écriture : le serveur (prod HTTPS) encode avec salt = nom du cookie "__Secure-".
let jwe;
try {
  jwe = await encode({ token: payload, secret: SECRET, salt: SECURE_COOKIE });
  console.log("[1/3] ENCODE (comme prod HTTPS) — OK");
} catch (e) {
  console.log("[1/3] ENCODE — ÉCHEC :", e.message);
  process.exit(1);
}

// 2) Lecture CORRIGÉE : getToken avec cookieName/secureCookie = nouveau proxy.
let tokenOut = null;
try {
  tokenOut = await getToken({
    req: { headers: new Headers({ cookie: `${SECURE_COOKIE}=${jwe}` }) },
    secret: SECRET,
    secureCookie: true,
    cookieName: SECURE_COOKIE,
  });
} catch (e) {
  console.log("[2/3] (corrigé) — erreur :", e.message);
}
const readOk = !!tokenOut && tokenOut.email === payload.email;
console.log(`[2/3] Lecture CORRIGÉE (cookieName+secureCookie)  : ${readOk ? "✓ token restitué" : "✗ NUJET"}`);

// 3) Lecture ANCIENNE (défaut) — preuve de la cause racine.
let fallback = null;
try {
  // getToken sans cookieName/secureCookie → cookie "authjs.session-token" (non __Secure-)
  fallback = await getToken({
    req: { headers: new Headers({ cookie: `${SECURE_COOKIE}=${jwe}` }) },
    secret: SECRET,
  });
} catch (e) {
  console.log("[3/3] (ancien) — erreur :", e.message);
}
console.log(`[3/3] Lecture ANCIENNE (défaut, sans préfixe)   : ${fallback ? "✗ (restitue — inattendu)" : "✓ null (cause racine démontrée)"}`);

const fixedFailure = !readOk || fallback;
if (fixedFailure || !readOk) {
  console.log("\nRÉSULTAT : ✗ ÉCHEC de la logique corrigée.");
  process.exit(1);
}
console.log("\nRÉSULTAT : ✓ SUCCÈS — la lecture `__Secure-` est opérationnelle.");
console.log("           Cause racine démontrée : l'ancien défaut de getToken ne lit pas");
console.log("           le cookie `__Secure-authjs.session-token` (=> redirect /login).");
process.exit(0);