/**
 * Test de bout en bout du flux de connexion NextAuth :
 * 1. Récupération du CSRF token (+ cookies)
 * 2. POST /api/auth/callback/credentials avec les identifiants de démo
 * 3. Vérification de la session obtenue via /api/auth/session
 */
import "dotenv/config";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const EMAIL = "admin@excellence-formation.com";
const PASSWORD = "password123";

function extractCookies(res: Response): string[] {
  // Node 18+/undici : getSetCookie() renvoie un tableau de chaînes "k=v; Path=...; ..."
  const anyHeaders = res.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

async function main() {
  console.log(`🌐 Test contre ${BASE}\n`);

  // Étape 1 : CSRF
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrfRes.ok) {
    console.log(`❌ GET /api/auth/csrf → HTTP ${csrfRes.status}`);
    return;
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const csrfCookies = extractCookies(csrfRes)
    .map((c) => c.split(";")[0])
    .join("; ");
  console.log(`✅ CSRF token récupéré (${csrfToken.slice(0, 12)}...)`);

  // Étape 2 : POST des identifiants
  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });

  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies,
    },
    body: body.toString(),
    redirect: "manual",
  });

  console.log(`→ POST /api/auth/callback/credentials → HTTP ${loginRes.status}`);

  const loginCookies = extractCookies(loginRes);
  const sessionCookie = loginCookies.find((c) =>
    c.startsWith("authjs.session-token=")
  );

  if (!sessionCookie) {
    console.log("❌ Aucun cookie de session reçu → connexion ÉCHOUÉE");
    console.log("   Cookies reçus :", loginCookies.map((c) => c.split("=")[0]).join(", ") || "(aucun)");
    const text = await loginRes.text();
    if (text) console.log("   Réponse :", text.slice(0, 300));
    return;
  }
  console.log("✅ Cookie de session émis");

  // Étape 3 : Vérification de la session
  const sessionValue = sessionCookie.split(";")[0];
  const sessionRes = await fetch(`${BASE}/api/auth/session`, {
    headers: { Cookie: `${csrfCookies}; ${sessionValue}` },
  });
  const sessionData = await sessionRes.json();

  if (sessionData && Object.keys(sessionData).length > 0) {
    console.log("\n🎉 CONNEXION RÉUSSIE !");
    console.log("   Session :", JSON.stringify(sessionData.user ?? sessionData));
  } else {
    console.log("\n❌ Session invalide après connexion");
  }
}

main().catch((e) => {
  console.error("❌ Erreur :", e.message);
  process.exit(1);
});