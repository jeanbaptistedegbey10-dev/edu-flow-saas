// Script de nettoyage des fausses valeurs KKiaPay en base de données
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FALSE_VALUES = new Set([
  'admin@excellence-formation.com',
  'password123',
]);

const KKIA_PAY_KEYS = [
  'kkiapay.publicKey',
  'kkiapay.privateKey',
  'kkiapay.secret',
  'kkiapay.mode',
  'kkiapay.isActive',
];

async function main() {
  console.log('### NETTOYAGE KKiaPay - Début ###');

  const records = await prisma.systemSettings.findMany({
    where: {
      key: { in: KKIA_PAY_KEYS },
    },
    select: { key: true, value: true, id: true },
  });

  console.log(`Records trouvés : ${records.length}`);
  for (const r of records) {
    console.log(`  - ${r.key} = ${r.value ?? '(empty)'}`);
  }

  const toDelete: string[] = [];
  const toClear: string[] = [];

  for (const r of records) {
    const v = (r.value ?? '').trim();
    if (FALSE_VALUES.has(v)) {
      toDelete.push(r.key);
      console.log(`CANDIDAT SUPPRESSION (fausse valeur) : ${r.key} = ${v}`);
    } else if (v === '') {
      // Si valeur vide : supprimer l'entrée pour que le fallback sur .env fonctionne
      toDelete.push(r.key);
      console.log(`CANDIDAT SUPPRESSION (vide) : ${r.key}`);
    } else {
      // Si valeur présente mais non fausse
    }
  }

  console.log(`\n==> Entrées à SUPPRIMER définitivement : ${toDelete.join(', ') || '(aucune)'}`);

  for (const key of toDelete) {
    await prisma.systemSettings.deleteMany({ where: { key } });
    console.log(`SUPPRIME EN BDD : ${key}`);
  }

  // Vérification finale
  const after = await prisma.systemSettings.findMany({
    where: { key: { in: KKIA_PAY_KEYS } },
    select: { key: true, value: true },
  });

  console.log('\n### État final des clés KKiaPay en BDD ###');
  for (const k of KKIA_PAY_KEYS) {
    const found = after.find((r) => r.key === k);
    console.log(`  ${k} : ${found ? (found.value ?? '(empty)') : '(absent de la BDD)'}`);
  }

  console.log('\n### NETTOYAGE TERMINE ###');
}

main()
  .catch((e) => {
    console.error('ERREUR DE NETTOYAGE :', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
