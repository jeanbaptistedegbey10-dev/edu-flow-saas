import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      role: true,
      isActive: true,
      passwordHash: true,
      firstName: true,
      lastName: true,
    },
  });

  if (users.length === 0) {
    console.log("❌ Aucun utilisateur en base. Le seed n'a probablement pas été exécuté.");
    return;
  }

  console.log(`👥 ${users.length} utilisateur(s) trouvé(s) :\n`);

  for (const user of users) {
    const match = await bcrypt.compare("password123", user.passwordHash);
    const hashPrefix = user.passwordHash.slice(0, 7);
    console.log(
      `   ${user.email} (${user.role}) | actif: ${user.isActive} | hash: ${hashPrefix}... | "password123" valide: ${match ? "✅" : "❌"}`
    );
  }
}

main()
  .catch((e) => {
    console.error("❌ Erreur de diagnostic:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });