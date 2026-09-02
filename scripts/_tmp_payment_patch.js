const fs = require("fs");
const p = "src/lib/payment.ts";
let s = fs.readFileSync(p, "utf8");

const hadCrlf = s.includes("\r\n");
s = s.replace(/\r\n/g, "\n");

let changed = 0;

const re1 =
  /  \/\/ Trace de la demande de paiement, avant tout appel [^\n]*\n  await prisma\.invoice\.create\(\{\n[\s\S]*?status: "PENDING"[\s\S]*?\}\);\n\n  try \{/;
const repl1 =
  "  // Aucune facture n'est créée au clic « Payer » : l'initiation Kkiapay est\n" +
  "  // pilotée par le widget côté navigateur, et Fedapay ne crée la transaction\n" +
  "  // que côté agrégateur. La facture est écrite UNIQUEMENT par le webhook signé\n" +
  "  // (`activateSubscriptionAfterPayment`), une fois le succès (ou l'échec)\n" +
  "  // confirmé — ce qui garantit un historique net, sans lignes PENDING.\n" +
  "  try {";
if (re1.test(s)) {
  s = s.replace(re1, repl1);
  changed++;
  console.log("re1 replaced: true");
} else {
  console.log("re1 NOT matched");
}

if (hadCrlf) {
  s = s.replace(/\n/g, "\r\n");
}
fs.writeFileSync(p, s);
console.log("changed blocks:", changed);



