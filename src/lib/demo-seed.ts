import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// --------------------------------------
// Seeding automatique des données de démonstration
// --------------------------------------
//
// À l'inscription d'une nouvelle organisation, ce module crée un jeu de
// données réaliste et cohérent : cours, classes, étudiants, paiements,
// procédures voyage, logements, évaluations, assiduité, dépenses, tâches,
// le catalogue de produits/services de la caisse (POS), ainsi que les
// comptes de démonstration (Secrétaire et Enseignant — l'Administrateur
// fondateur existe déjà au moment de l'appel).
//
// Garanties :
// - Isolation multi-tenant : tout est rattaché à l'organisation fraîchement
//   créée.
// - Unicité globale des emails de comptes démo (`User.email @unique`) : ils
//   sont dérivés du slug de l'organisation (contrainte `@unique` sur
//   `Organization.slug`) ET d'un jeton court dérivé de l'identifiant de
//   l'organisation → jamais de collision P2002 avec une autre organisation.
// - Unicité globale des codes étudiants (`Student.studentCode @unique`) :
//   séquence recalculée DANS la transaction, au moment de l'insertion.
// - Unicité globale des références de paiement (`Payment.reference @unique`) :
//   le jeton d'organisation est embarqué dans chaque référence.
// - Atomicité : l'intégralité du jeu de données est créée au sein d'UNE
//   transaction Prisma (all-or-nothing). Toute collision unique (P2002,
//   course condition entre deux inscriptions concurrentes) annule la
//   transaction et déclenche une relance automatique avec de nouvelles
//   séquences et un nouveau jeton.
// - Tolérance : si l'organisation contient déjà des données (relance après un
//   seed partiel), le seeding est ignoré SANS lever d'exception — l'appelant
//   (`registerAction`) ne doit jamais être bloqué par cette fonction.

/** Mot de passe commun aux comptes de démonstration générés. */
const DEMO_PASSWORD = "demo12345";

/** Tentatives maximales en cas de collision unique (P2002) pendant le seed. */
const DEMO_SEED_MAX_ATTEMPTS = 3;

/**
 * Options de la transaction interactive : le jeu complet représente une
 * centaine d'opérations sur une base distante (Supabase), bien au-delà du
 * timeout par défaut de Prisma (5 s).
 */
const DEMO_SEED_TX_OPTIONS = { maxWait: 20_000, timeout: 120_000 };

/** Prénoms/noms réalistes servant au seeding des étudiants. */
const DEMO_STUDENTS: Array<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}> = [
  {
    firstName: "Awa",
    lastName: "Traoré",
    email: "awa.traore@example.com",
    phone: "+225 05 00 00 00 11",
  },
  {
    firstName: "Yann",
    lastName: "Kouassi",
    email: "yann.kouassi@example.com",
    phone: "+225 05 00 00 00 12",
  },
  {
    firstName: "Fatou",
    lastName: "Diop",
    email: "fatou.diop@example.com",
    phone: "+225 05 00 00 00 13",
  },
  {
    firstName: "Ibrahim",
    lastName: "Diallo",
    email: "ibrahim.diallo@example.com",
    phone: "+225 07 00 00 00 14",
  },
  {
    firstName: "Amina",
    lastName: "N'Diaye",
    email: "amina.ndiaye@example.com",
    phone: "+225 05 00 00 00 15",
  },
  {
    firstName: "Samuel",
    lastName: "Mensah",
    email: "samuel.mensah@example.com",
    phone: "+225 07 00 00 00 16",
  },
];

/** Catalogue de démonstration des catégories personnalisées du POS. */
const DEMO_PRODUCT_CATEGORIES = ["Livres & Fascicules", "Services Assermentés"] as const;

/**
 * Catalogue de démonstration de la caisse (POS) : produits/services vendus
 * au comptoir dès la création de l'organisation, afin que le module Caisse
 * soit immédiatement utilisable (ventes de livres, traductions assermentées,
 * photocopies et services annexes). Certains produits sont volontairement
 * SANS catégorie pour illustrer le filtre « Sans catégorie ».
 */
const DEMO_PRODUCTS: Array<{
  name: string;
  /** Nom de la catégorie personnalisée (null = produit sans catégorie). */
  categoryName: string | null;
  unitPrice: number;
  description: string;
}> = [
  {
    name: "Livre d'apprentissage B1",
    categoryName: "Livres & Fascicules",
    unitPrice: 12_000,
    description: "Manuel d'apprentissage niveau B1 (support pédagogique).",
  },
  {
    name: "Livre d'exercices A1",
    categoryName: "Livres & Fascicules",
    unitPrice: 8_000,
    description: "Cahier d'exercices niveau A1 (support pédagogique).",
  },
  {
    name: "Traduction assermentée de diplôme",
    categoryName: "Services Assermentés",
    unitPrice: 25_000,
    description: "Traduction assermentée d'un diplôme (page incluse).",
  },
  {
    name: "Traduction assermentée de relevé de notes",
    categoryName: "Services Assermentés",
    unitPrice: 20_000,
    description: "Traduction assermentée d'un relevé de notes.",
  },
  // Produits SANS catégorie — illustrent le filtre « Sans catégorie » du POS.
  {
    name: "Lot de photocopies / fascicule",
    categoryName: null,
    unitPrice: 1_500,
    description: "Fascicule photocopié et relié (lot de 20 pages).",
  },
  {
    name: "Photocopie A4 (page)",
    categoryName: null,
    unitPrice: 100,
    description: "Photocopie noir & blanc par page.",
  },
];

/** Équivalent TypeScript de l'enum Prisma DiscountType (évite l'import). */
type DiscountTypeValue = "PERCENTAGE" | "FIXED";

/** Résumé du seeding, retourné à l'appelant pour journalisation. */
export type DemoSeedSummary = {
  /** `true` lorsque le jeu de données a été créé lors de cet appel. */
  seeded: boolean;
  /** Raison du non-seeding éventuel. */
  reason?: "ORG_NOT_FOUND" | "ALREADY_SEEDED";
  counts: {
    students: number;
    courses: number;
    expenses: number;
    payments: number;
    /** Articles du catalogue POS créés. */
    products: number;
    /** Catégories personnalisées créées. */
    categories: number;
    demoAccounts: number;
  };
};

function emptyCounts(): DemoSeedSummary["counts"] {
  return {
    students: 0,
    courses: 0,
    expenses: 0,
    payments: 0,
    products: 0,
    categories: 0,
    demoAccounts: 0,
  };
}

/**
 * Jeton de boîte mail démo : unique au niveau global et propre à
 * l'organisation. Combine le slug (unique via `Organization.slug @unique`) et
 * un fragment de l'identifiant d'organisation : deux organisations ne peuvent
 * donc JAMAIS produire le même email de compte de démonstration. Le numéro de
 * tentative est intégré à partir de la 2e relance pour que chaque tentative
 * reparte sur des identifiants vierges.
 */
function demoMailboxToken(
  slug: string,
  organizationId: string,
  attempt: number
): string {
  const tag = (
    organizationId.replace(/[^a-z0-9]/gi, "").slice(-8) || "org"
  ).toLowerCase();
  return attempt > 1 ? `${slug}-${tag}-r${attempt}` : `${slug}-${tag}`;
}

/** Emails des comptes de démonstration, uniques au niveau global. */
function demoAccountEmails(mailboxToken: string): {
  secretary: string;
  teacher: string;
} {
  return {
    secretary: `secretaire@${mailboxToken}.com`,
    teacher: `enseignant@${mailboxToken}.com`,
  };
}

/** Référence de paiement unique (jeton d'organisation + horodaté + compteur). */
function demoReference(
  prefix: string,
  index: number,
  mailboxToken: string
): string {
  return `${prefix}-DEMO-${mailboxToken}-${Date.now().toString(36).toUpperCase()}-${index}`;
}

/**
 * Génère `count` codes étudiants uniques au format STU-YYYY-NNN, en partant
 * du suffixe numérique maximal déjà présent (toutes organisations confondues,
 * la contrainte `@unique` étant globale). Exécuté DANS la transaction pour
 * refléter l'état le plus récent de la base.
 */
async function generateDemoStudentCodes(
  db: Prisma.TransactionClient,
  count: number
): Promise<string[]> {
  const year = new Date().getFullYear();
  const prefix = `STU-${year}-`;

  const existing = await db.student.findMany({
    where: { studentCode: { startsWith: prefix } },
    select: { studentCode: true },
  });

  let maxNumber = 0;
  for (const { studentCode } of existing) {
    const suffix = Number(studentCode.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > maxNumber) {
      maxNumber = suffix;
    }
  }

  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    maxNumber += 1;
    codes.push(`${prefix}${String(maxNumber).padStart(3, "0")}`);
  }

  return codes;
}

/**
 * Corps du seeding : exécuté au sein d'UNE transaction interactive Prisma
 * (all-or-nothing). Tout est créé via le client transactionnel `tx`.
 */
async function runDemoSeedTransaction(
  tx: Prisma.TransactionClient,
  ctx: {
    organizationId: string;
    createdById: string;
    year: number;
    registrationFee: number;
    mailboxToken: string;
    demoEmails: { secretary: string; teacher: string };
    passwordHash: string;
  }
): Promise<DemoSeedSummary["counts"]> {
  const {
    organizationId,
    createdById,
    year,
    registrationFee,
    mailboxToken,
    demoEmails,
    passwordHash,
  } = ctx;

  // 1. Comptes de démonstration : secrétaire (STAFF) et enseignant (TEACHER).
  //    Emails uniques au niveau global (slug + jeton d'organisation).
  const [secretary, teacher] = await Promise.all([
    tx.user.create({
      data: {
        organizationId,
        email: demoEmails.secretary,
        passwordHash,
        firstName: "Claire",
        lastName: "Okou",
        role: "STAFF",
      },
    }),
    tx.user.create({
      data: {
        organizationId,
        email: demoEmails.teacher,
        passwordHash,
        firstName: "Marc",
        lastName: "Gnamien",
        role: "TEACHER",
      },
    }),
  ]);

  // 2. Rôle personnalisé de démonstration (matrice de permissions) :
  //    « Secrétaire Adjoint », pré-configuré (isSystem) et assigné au compte
  //    secrétaire afin d'alimenter la page Rôles & Permissions dès la création
  //    de l'organisation.
  const secretaryRole = await tx.customRole.create({
    data: {
      organizationId,
      name: "Secrétaire Adjoint",
      description:
        "Assiste la secrétaire : inscriptions, présences et dossiers de voyage.",
      permissions: ["registration", "attendance", "travel"],
      isSystem: true,
    },
  });
  await tx.user.update({
    where: { id: secretary.id },
    data: { customRoleId: secretaryRole.id },
  });

  // 2bis. Deuxième rôle personnalisé de démonstration : « Professeur Principal »
  //       (évaluations + présences), assigné à l'enseignant de démonstration.
  const teacherRole = await tx.customRole.create({
    data: {
      organizationId,
      name: "Professeur Principal",
      description:
        "Encadre les enseignants : évaluations, présences et cours.",
      permissions: ["evaluations", "attendance"],
      isSystem: true,
    },
  });
  await tx.user.update({
    where: { id: teacher.id },
    data: { customRoleId: teacherRole.id },
  });

  // 3. Catalogue : trois formations réalistes.
  const [frenchCourse, englishCourse, germanCourse] = await Promise.all([
    tx.course.create({
      data: {
        organizationId,
        teacherId: teacher.id,
        title: "Français FLE — Niveau A1",
        code: "FR-A1",
        description: "Initiation au français langue étrangère (A1).",
        price: 300000,
        durationWeeks: 12,
      },
    }),
    tx.course.create({
      data: {
        organizationId,
        teacherId: teacher.id,
        title: "Anglais Général — Niveau B1",
        code: "EN-B1",
        description: "Anglais général intermédiaire (B1).",
        price: 350000,
        durationWeeks: 12,
      },
    }),
    tx.course.create({
      data: {
        organizationId,
        teacherId: teacher.id,
        title: "Allemand — Initiation A1",
        code: "DE-A1",
        description: "Préparation linguistique pour l'Allemagne (A1).",
        price: 400000,
        durationWeeks: 10,
      },
    }),
  ]);


  // 4. Cohorte A1 (matin) et B1 (après-midi), frais de scolarité configurés.
  const [frenchClass, englishClass] = await Promise.all([
    tx.class.create({
      data: {
        organizationId,
        courseId: frenchCourse.id,
        teacherId: teacher.id,
        name: `FR-A1 — Matin ${year}`,
        schedule: "08h-11h",
        tuitionFee: frenchCourse.price,
      },
    }),
    tx.class.create({
      data: {
        organizationId,
        courseId: englishCourse.id,
        teacherId: teacher.id,
        name: `EN-B1 — Après-midi ${year}`,
        schedule: "14h-17h",
        tuitionFee: englishCourse.price,
      },
    }),
  ]);

  // 5. Codes étudiants générés DANS la transaction (séquence globale à jour).
  const studentCodes = await generateDemoStudentCodes(
    tx,
    DEMO_STUDENTS.length
  );

  // 6. Étudiants : inscriptions, affectations de classe et paiements.
  const createdStudents: Array<{
    id: string;
    code: string;
    courseId: string;
    totalCost: number;
  }> = [];
  let paymentCount = 0;

  for (let index = 0; index < DEMO_STUDENTS.length; index += 1) {
    const person = DEMO_STUDENTS[index];
    const isFrench = index % 2 === 0;
    const targetClass = isFrench ? frenchClass : englishClass;
    const course = isFrench ? frenchCourse : englishCourse;
    // Premiers élèves inscrits, derniers en cours de formation.
    const status = index < 3 ? "ENROLLED" : "IN_PROGRESS";
    // Un élève illustre une réduction en pourcentage.
    const studentDiscountType: DiscountTypeValue =
      index === 1 ? "PERCENTAGE" : "FIXED";
    const discount = index === 1 ? 10 : 25000;
    const netAmount =
      studentDiscountType === "PERCENTAGE"
        ? targetClass.tuitionFee! * (1 - discount / 100)
        : targetClass.tuitionFee! - discount;

    const student = await tx.student.create({
      data: {
        organizationId,
        studentCode: studentCodes[index],
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        clientType: index < 4 ? "LANGUAGE_AND_TRAVEL" : "LANGUAGE_ONLY",
        totalCost: targetClass.tuitionFee,
        discount,
        discountType: studentDiscountType,
        netAmount,
        status,
        hasPaidRegistrationFee: true,
        currentClassId: targetClass.id,
      },
    });

    createdStudents.push({
      id: student.id,
      code: student.studentCode,
      courseId: course.id,
      totalCost: targetClass.tuitionFee!,
    });

    // Affectation de classe + inscription au cours porteur.
    await tx.classEnrollment.create({
      data: { organizationId, studentId: student.id, classId: targetClass.id },
    });
    await tx.enrollment.create({
      data: {
        studentId: student.id,
        courseId: course.id,
        progress: index < 3 ? 15 : 35,
      },
    });

    // Frais d'inscription encaissés + acompte de scolarité.
    await tx.payment.create({
      data: {
        organizationId,
        studentId: student.id,
        amount: registrationFee,
        paymentMethod: "CASH",
        status: "COMPLETED",
        reference: demoReference("REG", index, mailboxToken),
        description: "Frais d'inscription",
        paidAt: new Date(year, 0, 8 + index),
      },
    });
    await tx.payment.create({
      data: {
        organizationId,
        studentId: student.id,
        amount: Math.round((targetClass.tuitionFee! - discount) / 2),
        paymentMethod: index % 2 === 0 ? "CASH" : "MOBILE_MONEY",
        status: index === 5 ? "PARTIAL" : "COMPLETED",
        reference: demoReference("PAY", index, mailboxToken),
        description: "Acompte scolarité",
        paidAt: new Date(year, 1, Math.min(3 + index, 27)),
      },
    });
    paymentCount += 2;
  }


  // 7. Premier étudiant : dossier de voyage Canada + logement.
  const travellerCanada = createdStudents[0];
  const canadaWorkflow = await tx.workflow.create({
    data: {
      organizationId,
      country: "Canada",
      title: "Études supérieures au Canada",
      description:
        "Programme d'études supérieures avec admission dans un collège canadien.",
      isDefault: true,
      baseCost: 750000,
      stages: {
        create: [
          {
            organizationId,
            title: "Constitution du dossier",
            order: 1,
            requiredDocuments: ["Passeport", "Diplômes", "Relevés de notes"],
          },
          {
            organizationId,
            title: "Test de langue",
            order: 2,
            requiredDocuments: ["Résultat officiel du test"],
          },
          {
            organizationId,
            title: "Demande d'admission",
            order: 3,
            requiredDocuments: ["Lettre d'admission", "Preuve de financement"],
          },
          {
            organizationId,
            title: "Demande de visa",
            order: 4,
            requiredDocuments: ["CAQ", "Visas"],
          },
          {
            organizationId,
            title: "Départ & installation",
            order: 5,
            requiredDocuments: ["Contrat de logement", "Assurance"],
          },
        ],
      },
    },
  });

  const canadaProcedure = await tx.travelProcedure.create({
    data: {
      organizationId,
      studentId: travellerCanada.id,
      advisorId: secretary.id,
      workflowId: canadaWorkflow.id,
      destination: "Canada",
      targetProgram: "College — Sciences informatiques",
      status: "ADMISSION_OBTAINED",
      totalCost: canadaWorkflow.baseCost,
      discount: 0,
      netAmount: canadaWorkflow.baseCost,
      currentStageOrder: 2,
      currentStageDeadline: new Date(year, 6, 15),
      notes:
        "Admission obtenue. Démarrage des démarches CAQ puis demande de visa.",
    },
  });

  await tx.payment.create({
    data: {
      organizationId,
      studentId: travellerCanada.id,
      travelProcedureId: canadaProcedure.id,
      amount: 200000,
      paymentMethod: "BANK_TRANSFER",
      status: "COMPLETED",
      reference: demoReference("TRV", 0, mailboxToken),
      description: "Accompte dossier Canada",
      paidAt: new Date(year, 2, 12),
    },
  });
  paymentCount += 1;

  await tx.housing.create({
    data: {
      organizationId,
      studentId: travellerCanada.id,
      name: "Résidence Leclerc — Toronto",
      address: "24 Avenue Leclerc, Toronto",
      city: "Toronto",
      monthlyRent: 850,
      deposit: 1700,
      contractStart: new Date(year, 8, 1),
      contractEnd: new Date(year + 1, 4, 31),
      notes: "Appartement partagé à 15 min du collège.",
    },
  });

  // 8. Second étudiant : dossier Allemagne (sans logement pour varier).
  const travellerGermany = createdStudents[1];
  const germanyWorkflow = await tx.workflow.create({
    data: {
      organizationId,
      country: "Allemagne",
      title: "Formation professionnelle en Allemagne",
      description:
        "Programme de formation professionnelle reconnu (Ausbildung).",
      baseCost: 950000,
      stages: {
        create: [
          {
            organizationId,
            title: "Constitution du dossier",
            order: 1,
            requiredDocuments: ["Passeport", "CV", "B1 requis"],
          },
          {
            organizationId,
            title: "Certification de langue",
            order: 2,
            requiredDocuments: ["Certificat Goethe B1"],
          },
          {
            organizationId,
            title: "Contrat de formation",
            order: 3,
            requiredDocuments: ["Contrat signé"],
          },
          {
            organizationId,
            title: "Visa & départ",
            order: 4,
            requiredDocuments: ["Visa", "Assurance"],
          },
        ],
      },
    },
  });

  await tx.travelProcedure.create({
    data: {
      organizationId,
      studentId: travellerGermany.id,
      advisorId: secretary.id,
      workflowId: germanyWorkflow.id,
      destination: "Allemagne",
      targetProgram: "Ausbildung — Mécanique industrielle",
      status: "VISA_APPLIED",
      totalCost: germanyWorkflow.baseCost,
      discount: 50000,
      netAmount: germanyWorkflow.baseCost - 50000,
      currentStageOrder: 3,
      currentStageDeadline: new Date(year, 9, 1),
      notes: "Visa déposé au consulat, audition prévue fin de mois.",
    },
  });


  // 9. Évaluations par classe (modules + notes réalistes).
  const evaluationA1 = await tx.evaluation.create({
    data: {
      organizationId,
      classId: frenchClass.id,
      title: "Examen Continu N°1 — FR-A1",
      date: new Date(year, 2, 15),
      modules: {
        create: [
          { name: "Compréhension orale", maxScore: 100, passingScore: 60 },
          { name: "Expression écrite", maxScore: 100, passingScore: 60 },
          { name: "Expression orale", maxScore: 100, passingScore: 60 },
        ],
      },
    },
  });

  const frenchStudents = createdStudents.filter(
    (student) => student.courseId === frenchCourse.id
  );
  const a1Modules = await tx.evaluationModule.findMany({
    where: { evaluationId: evaluationA1.id },
    select: { id: true },
  });
  for (let sIndex = 0; sIndex < frenchStudents.length; sIndex += 1) {
    const student = frenchStudents[sIndex];
    for (let mIndex = 0; mIndex < a1Modules.length; mIndex += 1) {
      await tx.grade.create({
        data: {
          evaluationModuleId: a1Modules[mIndex].id,
          studentId: student.id,
          score: Math.min(100, 55 + ((sIndex + mIndex * 3) % 40)),
        },
      });
    }
  }

  // 10. Assiduité (cours du matin, classes cohérentes).
  for (let sIndex = 0; sIndex < frenchStudents.length; sIndex += 1) {
    const student = frenchStudents[sIndex];
    await tx.attendance.create({
      data: {
        organizationId,
        courseId: frenchCourse.id,
        classId: frenchClass.id,
        studentId: student.id,
        status: sIndex === 2 ? "ABSENT" : "PRESENT",
        date: new Date(year, 2, 10),
        notes: null,
      },
    });
  }

  // 11. Dépenses réalistes du mois courant.
  const today = new Date();
  const currentMonth = today.getMonth();
  await tx.expense.create({
    data: {
      organizationId,
      createdById,
      title: "Loyer des locaux",
      category: "Loyer",
      amount: 150000,
      expenseDate: new Date(today.getFullYear(), currentMonth, 5),
      notes: "Loyer mensuel du centre.",
    },
  });
  await tx.expense.create({
    data: {
      organizationId,
      createdById,
      title: "Fournitures pédagogiques",
      category: "Matériel pédagogique",
      amount: 45000,
      expenseDate: new Date(today.getFullYear(), currentMonth, 8),
      notes: "Manuels et photocopies.",
    },
  });
  await tx.expense.create({
    data: {
      organizationId,
      createdById,
      title: "Salaires enseignants",
      category: "Salaires",
      amount: 250000,
      expenseDate: new Date(today.getFullYear(), currentMonth, 25),
    },
  });

  // 12. Tâches de gestion réalistes.
  await tx.task.create({
    data: {
      organizationId,
      createdById,
      assigneeId: secretary.id,
      title: "Relancer les prospects FR-A1",
      description:
        "Contacter les prospects de la session prochaine pour confirmer leur inscription.",
      status: "TODO",
      priority: "HIGH",
      dueDate: new Date(today.getFullYear(), currentMonth + 1, 5),
    },
  });
  await tx.task.create({
    data: {
      organizationId,
      createdById,
      assigneeId: teacher.id,
      studentId: createdStudents[2].id,
      title: "Plan de rattrapage — Écrit B1",
      description:
        "Préparer un plan de rattrapage écrit pour l'étudiant en difficulté.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      dueDate: new Date(today.getFullYear(), currentMonth, 20),
    },
  });

  // 13. Catalogue de la caisse (POS) : catégories personnalisées puis
  //     produits/services vendus au comptoir (livres, traductions assermentées,
  //     photocopies). Certains produits sont volontairement SANS catégorie.
  //     Sans contrainte d'unicité : aucune collision P2002 possible.
  const demoCategoryIds = new Map<string, string>();
  for (const categoryName of DEMO_PRODUCT_CATEGORIES) {
    const category = await tx.productCategory.create({
      data: { organizationId, name: categoryName },
    });
    demoCategoryIds.set(categoryName, category.id);
  }

  await tx.productService.createMany({
    data: DEMO_PRODUCTS.map((product) => ({
      organizationId,
      name: product.name,
      categoryId: product.categoryName
        ? demoCategoryIds.get(product.categoryName) ?? null
        : null,
      unitPrice: product.unitPrice,
      description: product.description,
      isActive: true,
    })),
  });

  return {
    students: createdStudents.length,
    courses: 3,
    expenses: 3,
    payments: paymentCount,
    products: DEMO_PRODUCTS.length,
    categories: DEMO_PRODUCT_CATEGORIES.length,
    demoAccounts: 2,
  };
}

/**
 * Crée l'ensemble des données de démonstration pour une organisation
 * fraîchement inscrite.
 *
 * Conçu pour être appelé SYNCHRONEment depuis `registerAction`, juste après
 * la création de l'organisation et de l'administrateur fondateur :
 * - la fonction ne lève JAMAIS d'exception pour un cas attendu (organisation
 *   introuvable ou déjà pourvue en données) : elle retourne un résumé
 *   informatif avec `seeded: false` ;
 * - les données sont créées au sein d'une transaction atomique : en cas
 *   d'échec, RIEN n'est persisté (aucune organisation à moitié remplie) ;
 * - les collisions uniques (P2002) déclenchent une relance automatique avec
 *   de nouvelles séquences et un nouveau jeton d'identifiants.
 *
 * @param organizationId Identifiant de l'organisation cible (multi-tenant).
 * @param createdById    Identifiant de l'administrateur fondateur.
 */
export async function seedDemoDataForOrganization(
  organizationId: string,
  createdById: string
): Promise<DemoSeedSummary> {
  const year = new Date().getFullYear();

  // Récupère l'organisation pour ses paramètres par défaut (frais d'inscription).
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true, defaultRegistrationFee: true },
  });

  if (!organization) {
    return { seeded: false, reason: "ORG_NOT_FOUND", counts: emptyCounts() };
  }

  // Garde anti-doublon SANS exception : si l'organisation contient déjà des
  // élèves ou les comptes de démonstration, le seeding est ignoré (retour
  // informatif) au lieu de laisser Prisma lever une erreur de contrainte.
  const firstEmails = demoAccountEmails(
    demoMailboxToken(organization.slug, organizationId, 1)
  );
    const [
    existingDemoAccounts,
    existingStudents,
    existingCourses,
    existingExpenses,
    existingPayments,
    existingProducts,
    existingCategories,
  ] = await Promise.all([
    prisma.user.count({
      where: {
        organizationId,
        email: { in: [firstEmails.secretary, firstEmails.teacher] },
      },
    }),
    prisma.student.count({ where: { organizationId } }),
    prisma.course.count({ where: { organizationId } }),
    prisma.expense.count({ where: { organizationId } }),
    prisma.payment.count({ where: { organizationId } }),
    prisma.productService.count({ where: { organizationId } }),
    prisma.productCategory.count({ where: { organizationId } }),
  ]);

  if (existingDemoAccounts > 0 || existingStudents > 0) {
    return {
      seeded: false,
      reason: "ALREADY_SEEDED",
      counts: {
        students: existingStudents,
        courses: existingCourses,
        expenses: existingExpenses,
        payments: existingPayments,
        products: existingProducts,
        categories: existingCategories,
        demoAccounts: existingDemoAccounts,
      },
    };
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Relance automatique : une collision unique (P2002 — course condition sur
  // les codes étudiants globaux, par exemple) annule la transaction entière
  // puis relance le seeding avec de nouvelles séquences / identifiants.
  let lastError: unknown;
  for (let attempt = 1; attempt <= DEMO_SEED_MAX_ATTEMPTS; attempt += 1) {
    const mailboxToken = demoMailboxToken(
      organization.slug,
      organizationId,
      attempt
    );
    const demoEmails = demoAccountEmails(mailboxToken);

    try {
      const counts = await prisma.$transaction(
        (tx) =>
          runDemoSeedTransaction(tx, {
            organizationId,
            createdById,
            year,
            registrationFee: organization.defaultRegistrationFee,
            mailboxToken,
            demoEmails,
            passwordHash,
          }),
        DEMO_SEED_TX_OPTIONS
      );

      return { seeded: true, counts };
    } catch (error) {
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002";

      if (!isUniqueViolation) {
        throw error;
      }

      lastError = error;
      console.warn(
        `[demo-seed] Collision unique (P2002) détectée — nouvelle tentative (${attempt}/${DEMO_SEED_MAX_ATTEMPTS}).`
      );
    }
  }

  throw lastError;
}







