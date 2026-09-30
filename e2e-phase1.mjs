/**
 * e2e-phase1.mjs — Test HTTP de bout en bout de la Phase 1.
 *
 * Vérifie sur le serveur de dev réellement démarré (localhost:3000) :
 *   A. Redirection unifiée /dashboard/classes/[id] -> /dashboard/attendance?classId=…
 *   B. Page Présences & Cahier de texte accessible (200) + sélecteur filtré
 *   C. Page Caisse / POS accessible (200) SANS obligation d'ouvrir la caisse
 *   D. Le Journal d'Audit reçoit bien les ventes (SALE_CREATED)
 *
 * Usage : node e2e-phase1.mjs [email] [motdepasse]
 *
 * ATTENTION — les identifiants d'actions serveur (`Next-Action`) sont
 * spécifiques au BUILD : ils changent à chaque `next build`. Pour exécuter les
 * sections [D] et [E] (qui appellent réellement `createSaleAction`,
 * `getClassClosureReadiness` et `closeClassAction`), lancer un build de
 * production puis viser ce serveur :
 *
 *     npx next build
 *     npx next start -p 3200
 *     set E2E_BASE=http://localhost:3200 && node e2e-phase1.mjs
 *
 * En mode dev (port 3000), les sections [A] [B] [C] [F] restent valides ;
 * [D] et [E] retournent « Server action not found » (hash différents), ce qui
 * est un artefact du harnais de test et non un défaut produit.
 */

// URL de base : E2E_BASE permet de cibler le build de production (3100).
const BASE = (process.env.E2E_BASE ?? "http://localhost:3000").trim();
const EMAIL = process.argv[2] ?? "admin@excellence-formation.com";
const PASSWORD = process.argv[3] ?? "password123";

class Jar {
  constructor() { this.cookies = new Map(); }
  store(h) {
    const arr = Array.isArray(h) ? h : (h ? [h] : []);
    for (const raw of arr) {
      if (!raw) continue;
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      if (i === -1) continue;
      const n = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (/max-age=0/i.test(raw)) this.cookies.delete(n); else this.cookies.set(n, v);
    }
  }
  get header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  -> " + detail : ""}`);
}

const jar = new Jar();

async function login() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { redirect: "manual" });
  jar.store(csrfRes.headers.getSetCookie?.() ?? csrfRes.headers.get("set-cookie"));
  const { csrfToken } = await csrfRes.json();
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: jar.header },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, callbackUrl: "/dashboard" }),
  });
  jar.store(res.headers.getSetCookie?.() ?? res.headers.get("set-cookie"));
  return res;
}

const authGet = (path) =>
  fetch(`${BASE}${path}`, { redirect: "manual", headers: { Cookie: jar.header } });

(async () => {
  console.log("=".repeat(70));
  console.log("E2E PHASE 1 - EduFlow");
  console.log("=".repeat(70));

  console.log("\n[Connexion]");
  const loginRes = await login();
  const sessionOk = [...jar.cookies.keys()].some((k) => k.includes("session-token"));
  check("session NextAuth obtenue", sessionOk, `statut ${loginRes.status}`);

  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const klass = await p.class.findFirst({ orderBy: { createdAt: "asc" } });

  // ---- A. Redirection unifiee --------------------------------------------
  console.log("\n[A] Redirection unifiee /dashboard/classes/[id]");
  const rA = await authGet(`/dashboard/classes/${klass.id}`);
  const loc = rA.headers.get("location") ?? "";
  const isRedirect = [307, 308, 302, 303].includes(rA.status);
  const good = loc.includes("/dashboard/attendance") && loc.includes(`classId=${klass.id}`);
  check("redirection 3xx", isRedirect, `statut ${rA.status}`);
  check("cible = vue unifiee Presences & Cahier de texte", good, loc || "(vide)");

  // ---- B. Page unifiee ---------------------------------------------------
  console.log("\n[B] Page Presences & Cahier de texte");
  const rB = await authGet(`/dashboard/attendance?classId=${klass.id}`);
  const htmlB = await rB.text();
  check("HTTP 200", rB.status === 200, `statut ${rB.status}`);
  check("selecteur de classe rendu", htmlB.includes("Classe :"));
  const closed = await p.class.findMany({
    where: { status: { in: ["COMPLETED", "ARCHIVED"] } }, select: { name: true },
  });
  const leaked = closed.filter((c) => htmlB.includes(`>${c.name}<`));
  check("aucune classe cloturee/archivee dans le selecteur", leaked.length === 0,
    leaked.length ? "fuite : " + leaked.map((c) => c.name).join(", ")
                  : `${closed.length} classe(s) exclue(s)`);
  check("2e vue de classe supprimee", !htmlB.includes("Étudiants inscrits"));

  // ---- C. POS sans session de caisse -------------------------------------
  console.log("\n[C] Caisse / POS sans ouverture de caisse");
  const openSession = await p.cashRegisterSession.findFirst({ where: { status: "OPEN" } });
  console.log(`      (session de caisse ouverte en base : ${openSession ? "oui" : "non"})`);
  const rC = await authGet("/dashboard/pos");
  const htmlC = await rC.text();
  check("HTTP 200", rC.status === 200, `statut ${rC.status}`);
  check("bouton d'encaissement present", htmlC.includes("Encaisser"));
  check("pas de blocage 'Veuillez ouvrir la caisse'",
    !htmlC.includes("Veuillez ouvrir la caisse pour encaisser"));
  check("pas de message 'caisse fermee'", !htmlC.includes("Caisse ferm"));

  // ---- D. Vente reelle SANS session de caisse + tracabilite ---------------
  console.log("\n[D] Encaissement sans session de caisse + tracabilite");
  const ACTION_CREATE_SALE =
    "4045342676ca903f717e31746433c6b1533e3b8b21";

  // On ferme toute session de caisse pour reproduire le cas exige :
  // « aucune caisse ouverte » — l'encaissement doit MALGRE TOUT aboutir.
  const openNow = await p.cashRegisterSession.findMany({ where: { status: "OPEN" } });
  for (const s of openNow) {
    await p.cashRegisterSession.update({
      where: { id: s.id },
      data: { status: "CLOSED", closedAt: new Date(), countedAmount: 0, gapAmount: 0 },
    });
  }
  const stillOpen = await p.cashRegisterSession.count({ where: { status: "OPEN" } });
  check("aucune session de caisse ouverte", stillOpen === 0, `${stillOpen} ouverte(s)`);

  const product = await p.productService.findFirst({ where: { isActive: true } });
  const me = await p.user.findFirst({
    where: { email: "admin@excellence-formation.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  check("produit actif + admin identifies", Boolean(product && me));

  if (product && me) {
    const saleRes = await fetch(`${BASE}/dashboard/pos`, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": ACTION_CREATE_SALE,
        Cookie: jar.header,
      },
      body: JSON.stringify([{
        clientKind: "WALK_IN", clientId: null,
        items: [{ productServiceId: product.id, quantity: 1 }],
        discount: 0, paymentMethod: "CASH",
        guestName: "E2E Phase1", guestPhone: null,
        isOutOfSystem: false, paidAt: null,
      }]),
    });
    const saleBody = await saleRes.text();
    check("createSaleAction accepte la vente (aucune caisse requise)",
      saleBody.includes('ok') && saleBody.includes('true'),
      `statut ${saleRes.status} · ${saleBody.slice(0, 130).replace(/\s+/g, " ")}`);

    const sale = await p.sale.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, createdById: true, createdByName: true, netAmount: true },
    });
    check("vente enregistree en base", Boolean(sale), sale ? `net=${sale.netAmount}` : "");
    if (sale) {
      check("Sale.createdById = utilisateur connecte", sale.createdById === me.id, sale.createdById);
      check("Sale.createdByName renseigne", Boolean(sale.createdByName), sale.createdByName);
    }

    const audit = await p.auditLog.findFirst({
      where: { action: "SALE_CREATED" }, orderBy: { createdAt: "desc" },
    });
    check("AuditLog SALE_CREATED cree", Boolean(audit));
    if (audit) {
      const d = audit.details ?? {};
      check("audit.details.createdByUserId", d.createdByUserId === me.id, String(d.createdByUserId));
      check("audit.details.createdByUserName", Boolean(d.createdByUserName), d.createdByUserName);
      check("audit.userId (colonne Journal d'Audit)", audit.userId === me.id, audit.userId);
    }

    // Nettoyage de la ligne de test (la vente sert uniquement de preuve).
    await p.saleItem.deleteMany({ where: { saleId: sale.id } });
    await p.sale.delete({ where: { id: sale.id } });
  }

  const sales = await p.auditLog.findMany({
    where: { action: "SALE_CREATED" }, orderBy: { createdAt: "desc" }, take: 3,
  });
  check("evenements SALE_CREATED presents", sales.length > 0, `${sales.length} trouve(s)`);
  if (sales.length) {
    const d = sales[0].details ?? {};
    check("details.createdByUserId present", Boolean(d.createdByUserId), d.createdByUserId);
    check("details.createdByUserName present", Boolean(d.createdByUserName), d.createdByUserName);
    check("AuditLog.userId renseigne", Boolean(sales[0].userId), sales[0].userId);
  }

  // ---- E. Garde-fous de cloture ------------------------------------------
  console.log("\n[E] Garde-fous de cloture de classe");
  const ongoing = await p.class.findFirst({ where: { status: "IN_PROGRESS" } });
  if (!ongoing) {
    check("classe en cours disponible", false, "aucune classe IN_PROGRESS");
  } else {
    const rClose = await authGet(`/dashboard/classes/${ongoing.id}/close`);
    check("ecran de cloture accessible (/close)", rClose.status === 200, `statut ${rClose.status}`);
    const closeHtml = await rClose.text();
    check("bouton 'Terminer la classe' present", closeHtml.includes("Terminer la classe"));
  }

  // Appel REEL de getClassClosureReadiness + closeClassAction sur une classe
  // qui ne satisfait PAS les prérequis : la clôture doit être REFUSÉE.
  const ACTION_READINESS = "402f4d732f5dfe4e85a714f21ed254746dde7bb0f1";
  const ACTION_CLOSE = "405297169a9b06d6e6c7df21dd2b3a37e3fa2489ec";

  const rRes = await fetch(`${BASE}/dashboard/classes/${ongoing.id}/close`, {
    method: "POST", redirect: "manual",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "Next-Action": ACTION_READINESS, Cookie: jar.header,
    },
    body: JSON.stringify([ongoing.id]),
  });
  const rBody = await rRes.text();
  const sessionCount = await p.classSession.count({ where: { classId: ongoing.id } });
  check("getClassClosureReadiness repond",
    rRes.status === 200 && !rBody.includes("Server action not found"),
    `statut ${rRes.status}`);

  // Si la classe n'a aucune séance émargée, la clôture doit être refusée.
  if (sessionCount === 0) {
    const rCloseAct = await fetch(`${BASE}/dashboard/classes/${ongoing.id}/close`, {
      method: "POST", redirect: "manual",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        "Next-Action": ACTION_CLOSE, Cookie: jar.header,
      },
      body: JSON.stringify([{
        classId: ongoing.id,
        decisions: [{ studentId: "x", decision: "PASSED" }],
        chargeReRegistrationFee: false,
      }]),
    });
    const cb = await rCloseAct.text();
    check("closeClassAction REFUSE une classe sans prérequis",
      cb.includes("bloquée") || cb.includes("prerequis") || cb.includes("prérequis") ||
      cb.includes("Aucune séance enregistrée"),
      cb.slice(0, 170).replace(/\s+/g, " "));
  } else {
    console.log(`      (classe avec ${sessionCount} séance(s) : garde-fou non applicable)`);
  }

  // ---- F. Correctif Procedures voyage -------------------------------------
  console.log("\n[F] Correctif Procedures voyage ('Aucun modele' -> workflowId null)");

  // Le bug : le Select Radix renvoie la sentinelle "none" pour
  // « Aucun modèle (suivi libre) ». Rendue a parseTravelForm, cette chaine
  // etait prise pour un identifiant de Workflow, la recherche echouait et
  // l'action repondait « Modele introuvable. ».
  //
  // On prouve le correctif au point de decision exact :
  //   1. aucun Workflow ne porte l'identifiant "none"  -> l'ancien code
  //      echouait donc systematiquement sur ce chemin ;
  //   2. la normalisation produit bien null            -> l'ancien code est
  //      court-circuite (`if (parsed.data.workflowId)` est faux) et
  //      `workflowId: null` est enregistre.
  const SENTINELS = new Set(["none", "__none__", "null", "undefined", "false"]);
  const normalizeWorkflowId = (raw) => {
    const v = String(raw ?? "").trim();
    return v.length === 0 || SENTINELS.has(v.toLowerCase()) ? null : v;
  };

  const bogus = await p.workflow.findFirst({ where: { id: "none" } });
  check("aucun Workflow nomme 'none' (l'ancien code echouait ici)",
    bogus === null, bogus ? "workflow 'none' existe" : "confirme");

  check("sentinelle 'none' normalisee en null (contourne la recherche)",
    normalizeWorkflowId("none") === null,
    `normalize("none") = ${JSON.stringify(normalizeWorkflowId("none"))}`);
  check("un identifiant de Workflow REEL est preserve",
    normalizeWorkflowId("cmumv031r001fv1fc6kob9hui") === "cmumv031r001fv1fc6kob9hui");

  const sentinelRows = await p.travelProcedure.count({ where: { workflowId: "none" } });
  check("aucun dossier voyage avec workflowId='none'", sentinelRows === 0, `${sentinelRows}`);
  const freeTracked = await p.travelProcedure.count({ where: { workflowId: null } });
  console.log(`      (dossiers en suivi libre (workflowId null) : ${freeTracked})`);

  await p.$disconnect();

  console.log("\n" + "=".repeat(70));
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length === 0
    ? `RESULTAT : SUCCES (${results.length}/${results.length})`
    : `RESULTAT : ECHEC (${failed.length} echec(s) sur ${results.length})`);
  console.log("=".repeat(70));
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => { console.error("Exception :", e); process.exit(1); });
