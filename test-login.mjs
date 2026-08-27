/**
 * test-login.mjs
 * ------------------------------------------------------------------
 * Audit automatisé du flux de connexion NextAuth v5 (Credentials).
 *
 * Reproduit exactement ce que fait le client `next-auth/react` :
 *   1. GET  /api/auth/csrf                    → récupère le jeton CSRF (+ cookies)
 *   2. POST /api/auth/callback/credentials    → envoie email / mot de passe / csrf
 *
 * Le script inspecte la réponse du POST SANS suivre la redirection
 * (`redirect: "manual"`) afin de vérifier les deux critères de succès :
 *   - Statut HTTP 302/303 (vs 200 sans redirection) ;
 *   - En-tête `Set-Cookie` contenant le jeton de session (`authjs.session-token`
 *     ou `__Secure-authjs.session-token`).
 *
 * Usage :  node test-login.mjs [baseUrl] [email] [password]
 *          (défauts : http://localhost:3000, admin@excellence-formation.com, password123)
 */

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const email = process.argv[3] ?? "admin@excellence-formation.com";
const password = process.argv[4] ?? "password123";

const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

console.log("=".repeat(72));
console.log("AUDIT CONNEXION NEXTAUTH v5 — Credentials");
console.log("=".repeat(72));
console.log(`  URL de base : ${baseUrl}`);
console.log(`  Email       : ${email}`);
console.log(`  Mot de passe: ${password.slice(0, 1)}${"•".repeat(Math.max(password.length - 1, 0))}`);
console.log("-".repeat(72));

/** Petit « jar » de cookies pour conserver le jeton CSRF entre requêtes. */
class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  /** Mémorise les Set-Cookie de la réponse. */
  store(setCookieHeader) {
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    for (const raw of headers) {
      if (!raw) continue;
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq === -1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      // Ne stocke pas les cookies de suppression (Max-Age=0) pour la suite.
      if (!/max-age=0/i.test(raw)) {
        this.cookies.set(name, value);
      } else {
        this.cookies.delete(name);
      }
    }
  }
  /** Renvoie la valeur d'un cookie, si présent. */
  get(name) {
    return this.cookies.get(name);
  }
  get header() {
    return [...this.cookies.entries()]
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

let pass = true;
const jar = new CookieJar();

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
  jar.store(csrfRes.headers.getSetCookie?.() ?? csrfRes.headers.get("set-cookie"));
  console.log(`      → statut ${csrfRes.status}`);
  if (!csrfRes.ok) {
    console.log("      ✗ Échec de la récupération du jeton CSRF.");
    console.log("        Vérifiez que le serveur de dev tourne sur " + baseUrl);
    process.exit(2);
  }
  const csrfBody = await csrfRes.json();
  const csrfToken = csrfBody?.csrfToken;
  console.log(`      → csrfToken : ${csrfToken ? csrfToken.slice(0, 18) + "…" : "(absent)"}`);
  if (!csrfToken) {
    console.log("      ✗ Aucun jeton CSRF renvoyé.");
    process.exit(2);
  }

  // ------------------------------------------------------------------
  // ÉTAPE 2 — POST des identifiants vers /api/auth/callback/credentials
  // ------------------------------------------------------------------
  console.log("\n[2/3] POST /api/auth/callback/credentials");
  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    // Sans l'en-tête `X-Auth-Return-Redirect`, Auth.js renvoie une vraie
    // redirection HTTP (302/303) au lieu d'un JSON — on l'inspecte donc
    // MANUELLEMENT (redirect: manual) : statut, Location, Set-Cookie.
    callbackUrl: "/dashboard",
  });

  const postRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      // Crucial : renvoie le cookie CSRF mémorisé lors du GET précédent.
      ...(jar.cookies.size ? { Cookie: jar.header } : {}),
    },
    body,
  });

  const setCookieHeaders = postRes.headers.getSetCookie?.() ?? postRes.headers.get("set-cookie");
  jar.store(setCookieHeaders);

  console.log(`      → statut HTTP : ${postRes.status} ${postRes.statusText}`);
  console.log(`      → Location    : ${postRes.headers.get("location") ?? "(aucune)"}`);

  // ------------------------------------------------------------------
  // ÉTAPE 3 — Inspection des critères de succès
  // ------------------------------------------------------------------
  console.log("\n[3/3] Inspection des critères de succès");

  // Critère A : statut 302/303 vers /dashboard SUR LE MÊME ORIGINE.
  // Le bug "HTTP 200 / bloqué sur login" provenait du fait que `NEXTAUTH_URL`
  // pointait vers la production : la redirection renvoyée était
  // `https://edu-flow-saas.vercel.app/dashboard` (origine étrangère), donc le
  // navigateur local partait vers le site de prod. On vérifie que la Location
  // reste sur l'origine de la requête (ou est relative) ET cible /dashboard.
  const location = postRes.headers.get("location") ?? "";
  const isRedirectStatus = postRes.status === 302 || postRes.status === 303;
  const redirectsToDashboard = location.includes("/dashboard");

  const baseOrigin = new URL(baseUrl).origin;
  let sameOrigin = false;
  try {
    const locOrigin = new URL(location, baseUrl).origin;
    sameOrigin = locOrigin === baseOrigin;
  } catch {
    sameOrigin = false;
  }

  console.log(`\n  A) Redirection 302/303 → /dashboard (même origine)`);
  console.log(`     statut ${postRes.status} (attendu 302/303)   : ${isRedirectStatus ? "✓" : "✗"}`);
  console.log(`     cible /dashboard                            : ${redirectsToDashboard ? "✓" : "✗"}`);
  console.log(`     origine « ${new URL(location, baseUrl).origin} » == « ${baseOrigin} » : ${sameOrigin ? "✓" : "✗ (origine étrangère !)"}`);
  if (!isRedirectStatus || !redirectsToDashboard || !sameOrigin) pass = false;

  // Critère B : cookie de session présent dans Set-Cookie
  const cookieString = (Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders])
    .filter(Boolean)
    .join("; ");
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) =>
    cookieString.includes(name)
  );
  console.log(`\n  B) Cookie de session (Set-Cookie)`);
  console.log(`     présence de ${SESSION_COOKIE_NAMES.join(" / ")} : ${hasSessionCookie ? "✓" : "✗"}`);
  console.log(`     Set-Cookie bruts :`);
  for (const raw of Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]) {
    if (raw) console.log(`       - ${raw.split(";")[0]}`);
  }
  if (!hasSessionCookie) pass = false;

  // ------------------------------------------------------------------
  // PHASE B (diagnostic) — flux EXACT client `next-auth/react` (redirect:false)
  // ------------------------------------------------------------------
  // Le formulaire utilise `signIn("credentials", { redirect: false, redirectTo })`,
  // ce qui envoie l'en-tête `X-Auth-Return-Redirect: 1` : Auth.js répond alors en
  // JSON `{ url }` avec un statut 200 (et le cookie de session dans Set-Cookie),
  // au lieu d'une vraie redirection 302. La page lira `result.url` pour naviguer.
  console.log("\n[4/4] PHASE B — Flux client (X-Auth-Return-Redirect: 1)");
  try {
    const clientRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1",
        ...(jar.cookies.size ? { Cookie: jar.header } : {}),
      },
      body: new URLSearchParams({
        csrfToken,
        email,
        password,
        callbackUrl: "/dashboard",
      }),
    });
    const clientData = await clientRes.json();
    const url = clientData?.url ?? "(absent)";
    const hasError = typeof url === "string" && url.includes("error=");
    const clientCookieString = (
      clientRes.headers.getSetCookie?.() ?? clientRes.headers.get("set-cookie")
    )
      .filter(Boolean)
      .join("; ");
    const clientHasSession = SESSION_COOKIE_NAMES.some((n) => clientCookieString.includes(n));

    console.log(`      → statut JSON     : ${clientRes.status}`);
    console.log(`      → url renvoyé     : ${url}`);
    console.log(`      → contient error= : ${hasError ? "✓ (échec identifiants)" : "✗ (aucune erreur)"}`);
    console.log(`      → cookie session  : ${clientHasSession ? "✓ présent" : "✗ absent"}`);
  } catch (e2) {
    console.log(`      (sautée — ${e2.message})`);
  }

  // ------------------------------------------------------------------
  // PHASE C (validation) — /dashboard après connexion : la session EST valide
  // ------------------------------------------------------------------
  // On reprend le cookie de session créé en phase A et l'on suit la redirection
  // vers /dashboard. Le proxy (src/proxy.ts) doit lire le même JWT via
  // `getToken(..., secret: AUTH_SECRET)` et laisser passer (200). S'il renvoyait
  // une 307 vers /login?callbackUrl=…, la session serait invalide (secret
  // incohérent / cookie rejeté) : c'est le scénario exact du bug.
  console.log("\n[5/5] PHASE C — Accès /dashboard avec le cookie de session");
  try {
    const dashRes = await fetch(`${baseUrl}/dashboard`, {
      method: "GET",
      redirect: "manual",
      headers: jar.cookies.size ? { Cookie: jar.header } : {},
    });
    const dashStatus = dashRes.status;
    const dashLoc = dashRes.headers.get("location") ?? "";
    const accepted = dashStatus === 200;
    const bouncedToLogin = dashStatus === 307 || dashStatus === 302 && dashLoc.includes("/login");
    console.log(`      → GET /dashboard avec session → statut ${dashStatus}`);
    console.log(`      → session acceptée (200)      : ${accepted ? "✓" : "✗"}`);
    console.log(`      → renvoyé vers /login (échec) : ${bouncedToLogin ? "✗ OUI" : "✓ non"}`);
    if (!accepted || bouncedToLogin) pass = false;
  } catch (e3) {
    console.log(`      (sautée — ${e3.message})`);
  }

  // ------------------------------------------------------------------
  // Bilan
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(72));
  if (pass) {
    console.log("RÉSULTAT : ✓ SUCCÈS — session créée et redirection opérée.");
  } else {
    console.log("RÉSULTAT : ✗ ÉCHEC — cookie de session absent ou pas de redirection 302/303.");
  }
  console.log("=".repeat(72));
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.error("\n✗ Exception imprévue :", err);
  process.exit(1);
}

