/**
 * Vérification UI de la page « Rôles & Permissions » rendue par le serveur.
 * Connexion NextAuth (compte de démo) puis GET de /dashboard/settings/roles :
 * le tableau « Attribution aux utilisateurs » doit lister les administrateurs
 * avec la mention fixe « Tous les accès (Admin) ».
 *
 * Usage : node scripts/verify-roles-ui.mjs [baseUrl] [email] [password]
 */
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const email = process.argv[3] ?? "admin@excellence-formation.com";
const password = process.argv[4] ?? "password123";

const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"];

const jar = new Map();
function store(setCookieHeader) {
  const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const raw of headers) {
    if (!raw) continue;
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (/max-age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

let ok = true;
function check(label, condition) {
  console.log(`${condition ? "✅" : "❌"} ${label}`);
  if (!condition) ok = false;
}

// 1) CSRF
const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { Accept: "application/json" } });
store(csrfRes.headers.getSetCookie?.() ?? csrfRes.headers.get("set-cookie"));
const { csrfToken } = await csrfRes.json();
check("Jeton CSRF récupéré", Boolean(csrfToken));

// 2) Connexion credentials (flux serveur NextAuth) — « manual » : le cookie
//    de session est posé par la redirection 302, un « follow » le perdrait.
const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
  method: "POST",
  redirect: "manual",
  headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
  body: new URLSearchParams({ csrfToken, email, password, callbackUrl: "/dashboard" }),
});
store(loginRes.headers.getSetCookie?.() ?? loginRes.headers.get("set-cookie"));
check(
  `Connexion (statut ${loginRes.status}, session créée)`,
  [302, 303].includes(loginRes.status) && SESSION_COOKIE_NAMES.some((name) => jar.has(name))
);

// 3) Page Rôles & Permissions
const pageRes = await fetch(`${baseUrl}/dashboard/settings/roles`, {
  headers: { Cookie: cookieHeader() },
});
const html = await pageRes.text();
check("Page rendue (HTTP 200)", pageRes.status === 200);
check("Section « Attribution aux utilisateurs » présente", html.includes("Attribution aux utilisateurs"));
check("Mention fixe « Tous les accès (Admin) » affichée", html.includes("Tous les accès (Admin)"));

// Extrait de preuve : contexte HTML autour de la mention fixe (texte brut).
const badgeIndex = html.indexOf("Tous les accès (Admin)");
if (badgeIndex >= 0) {
  const snippet = html
    .slice(Math.max(0, badgeIndex - 800), badgeIndex + 200)
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-400);
  console.log(`\n--- Extrait rendu autour de la mention ---\n${snippet}\n---------------------------------------------`);
}

process.exit(ok ? 0 : 1);
