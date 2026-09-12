import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Seeding des données de démonstration — couverture 100 % des modules
// ---------------------------------------------------------------------------
// Crée un jeu de données réaliste cohérent pour TOUTES les modules :
//   - Trésorerie : solde de caisse initial + journal pré-rempli (paiements,
//     ventes POS, dépenses du mois courant) ;
//   - Pédagogie : 3 cours, 3 classes/cohortes, 6 étudiants profils complets
//     (dont paiements antérieurs « legacy » + indicateur de journal) ;
//   - Assiduité : séances PASSÉES avec statuts PRÉSENT / ABSENT / LATE /
//     EXCUSÉ pour tous les étudiants ;
//   - Voyages : 3 dossiers (Canada, Allemagne, France) avec workflows
//     (Consulat, Campus France, Blocage de fonds…) et documents ;
//   - Évaluations & notes, dépenses, tâches ;
//   - Caisse POS : catalogue produits/services + 4 reçus de vente comptoir.
//
// Garanties :
//   - Isolation multi-tenant : tout dépend de l'organisation cible.
//   - Unicité globale des emails démo, codes étudiants et références de
//     paiement (jeton dérivé du slug + id d'organisation).
//   - Atomicité : une seule transaction Prisma interactive (all-or-nothing).
//   - Performance : créations par lots (createMany) + Promise.all pour
//     minimiser les allers-retours réseau → exécution < 3 s, sous le budget
//     des Serverless Vercel (10 s).
//   - Tolérance : si l'organisation est déjà pourvue, retour `ALREADY_SEEDED`
//     sans exception (l'appelant n'est jamais bloqué).

/** Mot de passe commun aux comptes de démonstration générés. */
const DEMO_PASSWORD = "demo12345";

/** Tentatives maximales en cas de collision unique (P2002) pendant le seed. */
const DEMO_SEED_MAX_ATTEMPTS = 3;

/**
 * Options de la transaction interactive — optimisées pour rester sous le
 * budget temps des Serverless (corps du seeding < 3 s sur base distante).
 */
const DEMO_SEED_TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

/** Solde de caisse initial injecté dans le journal de trésorerie (FCFA). */
const DEMO_INITIAL_CASH_BALANCE = 500_000;

/** Nombre de séances de présence passées générées par classe. */
const ATTENDANCE_SESSIONS_PER_CLASS = 6;

/** Équivalents TypeScript des enums Prisma utilisés dans ce module. */
type StudentStatusValue =
  | "PROSPECT"
  | "ENROLLED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "SUSPENDED"
  | "DROPPED_OUT";
type DiscountTypeValue = "PERCENTAGE" | "FIXED";
type AttendanceStatusValue = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

/** Prénoms/noms réalistes servant au seeding des étudiants. */
const DEMO_STUDENTS: Array<{
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  address: string;
}> = [
  {
    firstName: "Awa",
    lastName: "Traoré",
    email: "awa.traore@example.com",
    phone: "+225 05 00 00 00 11",
    dateOfBirth: "2001-04-15",
    address: "Cocody Angré, Abidjan",
  },
  {
    firstName: "Yann",
    lastName: "Kouassi",
    email: "yann.kouassi@example.com",
    phone: "+225 05 00 00 00 12",
    dateOfBirth: "2000-08-22",
    address: "Marcory Zone 4, Abidjan",
  },
  {
    firstName: "Fatou",
    lastName: "Diop",
    email: "fatou.diop@example.com",
    phone: "+225 05 00 00 00 13",
    dateOfBirth: "2002-01-09",
    address: "Plateau, Abidjan",
  },
  {
    firstName: "Ibrahim",
    lastName: "Diallo",
    email: "ibrahim.diallo@example.com",
    phone: "+225 07 00 00 00 14",
    dateOfBirth: "1999-11-30",
    address: "Yopougon Niangon, Abidjan",
  },
  {
    firstName: "Amina",
    lastName: "N'Diaye",
    email: "amina.ndiaye@example.com",
    phone: "+225 05 00 00 00 15",
    dateOfBirth: "2001-06-17",
    address: "Treichville, Abidjan",
  },
  {
    firstName: "Samuel",
    lastName: "Mensah",
    email: "samuel.mensah@example.com",
    phone: "+225 07 00 00 00 16",
    dateOfBirth: "2003-02-05",
    address: "Cocody Riviera, Abidjan",
  },
];

/** Catalogue de démonstration des catégories personnalisées du POS. */
const DEMO_PRODUCT_CATEGORIES = [
  "Livres & Fascicules",
  "Services Assermentés",
] as const;

/**
 * Catalogue de démonstration de la caisse (POS) : produits/services vendus au
 * comptoir (livres, traductions assermentées, photocopies et services annexes).
 * Certains produits sont volontairement SANS catégorie (filtre « Sans catégorie »).
 */
const DEMO_PRODUCTS: Array<{
  name: string;
  categoryName: (typeof DEMO_PRODUCT_CATEGORIES)[number] | null;
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

/** Montants « legacy » (paiements antérieurs hors système) par étudiant. */
const DEMO_LEGACY_PAYMENTS = new Map<
  number,
  { amount: number; inCashJournal: boolean }
>([
  [0, { amount: 100_000, inCashJournal: true }],
  [1, { amount: 50_000, inCashJournal: false }],
  [3, { amount: 75_000, inCashJournal: true }],
]);

/**
 * Reçus de vente comptoir (POS) générés — les produits sont référencés par
 * leur nom exact du catalogue `DEMO_PRODUCTS`.
 */
const DEMO_SALES: Array<{
  studentIndex: number | null;
  guestName?: string;
  guestPhone?: string;
  paymentMethod: "CASH" | "MOBILE_MONEY";
  items: Array<{ productName: string; quantity: number }>;
}> = [
  {
    studentIndex: 1,
    paymentMethod: "CASH",
    items: [
      { productName: "Livre d'apprentissage B1", quantity: 1 },
      { productName: "Photocopie A4 (page)", quantity: 10 },
    ],
  },
  {
    studentIndex: null,
    guestName: "Client de passage (M. Koffi)",
    guestPhone: "+225 07 00 00 00 99",
    paymentMethod: "MOBILE_MONEY",
    items: [{ productName: "Traduction assermentée de diplôme", quantity: 1 }],
  },
  {
    studentIndex: 3,
    paymentMethod: "CASH",
    items: [{ productName: "Livre d'exercices A1", quantity: 2 }],
  },
  {
    studentIndex: null,
    guestName: "Client de passage (Mme Adjoua)",
    guestPhone: "+225 05 00 00 00 88",
    paymentMethod: "CASH",
    items: [
      { productName: "Traduction assermentée de relevé de notes", quantity: 1 },
      { productName: "Lot de photocopies / fascicule", quantity: 3 },
    ],
  },
];

/** Résumé du seeding, retourné à l'appelant pour journalisation. */
export type DemoSeedSummary = {
  /** `true` lorsque le jeu de données a été créé lors de cet appel. */
  seeded: boolean;
  /** Raison du non-seeding éventuel. */
  reason?: "ORG_NOT_FOUND" | "ALREADY_SEEDED";
  counts: {
    students: number;
    classes: number;
    courses: number;
    /** Séances de cours réelles (ClassSession) créées. */
    classSessions: number;
    attendances: number;
    travelProcedures: number;
    documents: number;
    expenses: number;
    payments: number;
    sales: number;
    evaluations: number;
    tasks: number;
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
    classes: 0,
    courses: 0,
    classSessions: 0,
    attendances: 0,
    travelProcedures: 0,
    documents: 0,
    expenses: 0,
    payments: 0,
    sales: 0,
    evaluations: 0,
    tasks: 0,
    products: 0,
    categories: 0,
    demoAccounts: 0,
  };
}/**
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
 * la contrainte `@unique` étant globale). Exécuté DANS la transaction.
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
 * Génère les dates des séances passées : `count` journées espacées de ~3 jours,
 * remontant à partir d'aujourd'hui (la plus ancienne en premier). Chaque date
 * est normalisée à MINUIT UTC — même convention que les séances créées par
 * l'application (`parseAttendanceDay`), requise par la contrainte unique
 * `[classId, sessionDate]` et par les requêtes bornées à une journée.
 */
function pastSessionDates(dayOffsetStart: number, count: number): Date[] {
  const dates: Date[] = [];
  const now = new Date();
  const todayUtcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  for (let i = count - 1; i >= 0; i -= 1) {
    dates.push(
      new Date(todayUtcMidnight - (dayOffsetStart + i * 3) * 24 * 60 * 60 * 1000)
    );
  }
  return dates;
}

/** Horodatage UTC « jour de séance + heure » (ex : 09:00, 14:20…). */
function utcAt(sessionDate: Date, hours: number, minutes = 0): Date {
  return new Date(
    Date.UTC(
      sessionDate.getUTCFullYear(),
      sessionDate.getUTCMonth(),
      sessionDate.getUTCDate(),
      hours,
      minutes,
      0,
      0
    )
  );
}

/**
 * Corps du seeding : exécuté au sein d'UNE transaction interactive Prisma
 * (all-or-nothing). Chaque sous-étape minimise les allers-retours réseau.
 */
async function runDemoSeedTransaction(
  tx: Prisma.TransactionClient,
  ctx: {
    organizationId: string;
    createdById: string;
    year: number;
    registrationFee: number;
    initialCashBalance: number;
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
    initialCashBalance,
    mailboxToken,
    demoEmails,
    passwordHash,
  } = ctx;

  // 0. Trésorerie — solde de départ : pré-rempli uniquement si l'organisation
  //    n'a pas déjà configuré son propre solde d'ouverture.
  if (initialCashBalance === 0) {
    await tx.organization.update({
      where: { id: organizationId },
      data: { initialCashBalance: DEMO_INITIAL_CASH_BALANCE },
    });
  }

  // 1. Comptes de démonstration : secrétaire (STAFF) et enseignant (TEACHER).
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

  // 2. Rôles personnalisés de démonstration (matrice de permissions).
  const [secretaryRole, teacherRole] = await Promise.all([
    tx.customRole.create({
      data: {
        organizationId,
        name: "Secrétaire Adjoint",
        description:
          "Assiste la secrétaire : inscriptions, présences et dossiers de voyage.",
        permissions: ["registration", "attendance", "travel"],
        isSystem: true,
      },
    }),
    tx.customRole.create({
      data: {
        organizationId,
        name: "Professeur Principal",
        description:
          "Encadre les enseignants : évaluations, présences et cours.",
        permissions: ["evaluations", "attendance"],
        isSystem: true,
      },
    }),
  ]);
  await Promise.all([
    tx.user.update({
      where: { id: secretary.id },
      data: { customRoleId: secretaryRole.id },
    }),
    tx.user.update({
      where: { id: teacher.id },
      data: { customRoleId: teacherRole.id },
    }),
  ]);

  // 3. Catalogue pédagogique : TROIS cours.
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
        title: "Anglais Intensive — Niveau B1",
        code: "EN-B1",
        description: "Anglais général intensif (B1).",
        price: 350000,
        durationWeeks: 12,
      },
    }),
    tx.course.create({
      data: {
        organizationId,
        teacherId: teacher.id,
        title: "Allemand B1 — Visa",
        code: "DE-B1",
        description: "Préparation linguistique B1 pour l'Allemagne (visa).",
        price: 400000,
        durationWeeks: 10,
      },
    }),
  ]);

  // 4. TROIS classes / cohortes.
  const [frenchClass, englishClass, germanClass] = await Promise.all([
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
    tx.class.create({
      data: {
        organizationId,
        courseId: germanCourse.id,
        teacherId: teacher.id,
        name: "Allemand B1 — Visa Allemagne 2026",
        schedule: "18h-21h",
        tuitionFee: germanCourse.price,
      },
    }),
  ]);
  // 5. Codes étudiants générés DANS la transaction (séquence globale à jour).
  const studentCodes = await generateDemoStudentCodes(
    tx,
    DEMO_STUDENTS.length
  );

  // 6. Étudiants (6 profils complets) — création parallèle.
  const createdStudents = await Promise.all(
    DEMO_STUDENTS.map(async (person, index) => {
      const isFrench = index % 2 === 0;
      const targetClass =
        index >= 4 ? germanClass : isFrench ? frenchClass : englishClass;
      const course =
        targetClass === germanClass
          ? germanCourse
          : isFrench
            ? frenchCourse
            : englishCourse;
      // Premiers élèves inscrits, derniers en cours de formation.
      const status: StudentStatusValue =
        index < 3 ? "ENROLLED" : "IN_PROGRESS";
      const studentDiscountType: DiscountTypeValue =
        index === 1 ? "PERCENTAGE" : "FIXED";
      const discount = index === 1 ? 10 : 25000;
      const netAmount =
        studentDiscountType === "PERCENTAGE"
          ? Math.round(targetClass.tuitionFee! * (1 - discount / 100))
          : targetClass.tuitionFee! - discount;
      const legacy = DEMO_LEGACY_PAYMENTS.get(index);

      const student = await tx.student.create({
        data: {
          organizationId,
          studentCode: studentCodes[index],
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          clientType: index === 2 ? "LANGUAGE_ONLY" : "LANGUAGE_AND_TRAVEL",
          totalCost: targetClass.tuitionFee,
          discount,
          discountType: studentDiscountType,
          netAmount,
          // Paiements antérieurs hors système + indicateur de journal.
          legacyPaidAmount: legacy?.amount ?? 0,
          legacyAmountInCashJournal: legacy?.inCashJournal ?? false,
          dateOfBirth: new Date(person.dateOfBirth),
          address: person.address,
          status,
          hasPaidRegistrationFee: true,
          currentClassId: targetClass.id,
        },
      });

      return {
        id: student.id,
        code: student.studentCode,
        courseId: course.id,
        classId: targetClass.id,
        netAmount,
      };
    })
  );

  // 7. Inscriptions cours + affectations de classe + recettes (lots).
  await Promise.all([
    tx.classEnrollment.createMany({
      data: createdStudents.map((student) => ({
        organizationId,
        studentId: student.id,
        classId: student.classId,
      })),
    }),
    tx.enrollment.createMany({
      data: createdStudents.map((student, index) => ({
        studentId: student.id,
        courseId: student.courseId,
        progress: index < 3 ? 15 : 35,
      })),
    }),
  ]);

  // Recettes : frais d'inscription + acomptes de scolarité (mois courant pour
  // alimenter le journal de caisse) + paiements antérieurs « legacy ».
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const studentPaymentRows: Prisma.PaymentCreateManyInput[] = [];
  createdStudents.forEach((student, index) => {
    studentPaymentRows.push({
      organizationId,
      studentId: student.id,
      amount: registrationFee,
      paymentMethod: "CASH",
      status: "COMPLETED",
      reference: demoReference("REG", index, mailboxToken),
      description: "Frais d'inscription",
      paidAt: new Date(year, 0, 8 + index),
    });
    studentPaymentRows.push({
      organizationId,
      studentId: student.id,
      amount: Math.round(student.netAmount / 2),
      paymentMethod: index % 2 === 0 ? "CASH" : "MOBILE_MONEY",
      status: index === 5 ? "PARTIAL" : "COMPLETED",
      reference: demoReference("PAY", index, mailboxToken),
      description: "Acompte scolarité",
      paidAt: new Date(currentYear, currentMonth, Math.min(1 + index, 22)),
    });
    const legacy = DEMO_LEGACY_PAYMENTS.get(index);
    if (legacy?.inCashJournal) {
      studentPaymentRows.push({
        organizationId,
        studentId: student.id,
        amount: legacy.amount,
        paymentMethod: "CASH",
        status: "COMPLETED",
        reference: `LEGACY-${student.code}`,
        description:
          "Paiements antérieurs hors système (avant adoption du logiciel)",
        paidAt: new Date(year, 0, 20),
      });
    }
  });
  let paymentCount = studentPaymentRows.length;
  if (studentPaymentRows.length > 0) {
    await tx.payment.createMany({ data: studentPaymentRows });
  }
  // 8. Séances de cours (ClassSession) + assiduité : ATTENDANCE_SESSIONS_PER_CLASS
  //    séances PASSÉES par classe (créneau horaire réel de la classe), puis
  //    présences rattachées à CHAQUE séance avec statuts variés (PRESENT /
  //    ABSENT / LATE / EXCUSED) — une ligne par étudiant et par séance.
  //    ⚠️ `Attendance.sessionId` référence STRICTEMENT `ClassSession.id`
  //    (contrainte unique [sessionId, studentId]) : tout autre identifiant
  //    (ex : courseId) déclenche une erreur Prisma P2002.
  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  const attendanceKeys = new Set<string>();
  const classGroups: Array<{
    classId: string;
    subjectName: string;
    chapters: string[];
    startHour: number;
    endHour: number;
    studentIds: string[];
    dayOffset: number;
  }> = [
    {
      classId: frenchClass.id,
      subjectName: "Français FLE",
      chapters: [
        "Alphabet & prononciation",
        "Se présenter",
        "Les articles définis et indéfinis",
        "Les verbes du 1er groupe au présent",
        "La négation simple",
        "Les nombres et l'heure",
      ],
      startHour: 8,
      endHour: 11,
      studentIds: createdStudents
        .filter((s) => s.classId === frenchClass.id)
        .map((s) => s.id),
      dayOffset: 21,
    },
    {
      classId: englishClass.id,
      subjectName: "Anglais Intensif",
      chapters: [
        "Unit 1: Business Greetings",
        "Unit 2: Making Phone Calls",
        "Unit 3: Emails & Reports",
        "Unit 4: Meetings & Presentations",
        "Unit 5: Negotiations",
        "Unit 6: Job Interviews",
      ],
      startHour: 14,
      endHour: 17,
      studentIds: createdStudents
        .filter((s) => s.classId === englishClass.id)
        .map((s) => s.id),
      dayOffset: 20,
    },
    {
      classId: germanClass.id,
      subjectName: "Allemand B1",
      chapters: [
        "Modul 1: Grundlagen",
        "Modul 2: Sich vorstellen",
        "Modul 3: Alltag & Beruf",
        "Modul 4: Einkaufen",
        "Modul 5: Reisen",
        "Modul 6: Prüfungstraining",
      ],
      startHour: 18,
      endHour: 21,
      studentIds: createdStudents
        .filter((s) => s.classId === germanClass.id)
        .map((s) => s.id),
      dayOffset: 18,
    },
  ];

  let classSessionCount = 0;
  for (const group of classGroups) {
    const dates = pastSessionDates(
      group.dayOffset,
      ATTENDANCE_SESSIONS_PER_CLASS
    );

    // 8.a Création des SÉANCES réelles (une par date, créneau horaire de la
    //     classe) — leurs identifiants servent de FK aux présences.
    //     Promise.all préserve l'ordre des résultats (= ordre des dates).
    const createdSessions = await Promise.all(
      dates.map((sessionDate, sessionIndex) =>
        tx.classSession.create({
          data: {
            organizationId,
            classId: group.classId,
            subjectName: group.subjectName,
            chapter: group.chapters[sessionIndex % group.chapters.length],
            sessionDate,
            startTime: utcAt(sessionDate, group.startHour),
            endTime: utcAt(sessionDate, group.endHour),
          },
          select: { id: true, sessionDate: true },
        })
      )
    );
    classSessionCount += createdSessions.length;

    // 8.b Présences rattachées aux séances ci-dessus — dédoublonnées sur la
    //     clé unique composite [sessionId, studentId] avant createMany.
    for (const studentId of group.studentIds) {
      createdSessions.forEach((session, sessionIndex) => {
        let status: AttendanceStatusValue = "PRESENT";
        if (sessionIndex === 2 && studentId === group.studentIds[0]) {
          status = "ABSENT";
        } else if (sessionIndex === 4 && studentId === group.studentIds[1]) {
          status = "LATE";
        } else if (sessionIndex === 3 && studentId === group.studentIds[2]) {
          status = "EXCUSED";
        }
        const dedupeKey = `${session.id}-${studentId}`;
        if (attendanceKeys.has(dedupeKey)) {
          return;
        }
        attendanceKeys.add(dedupeKey);
        attendanceRows.push({
          organizationId,
          sessionId: session.id,
          classId: group.classId,
          studentId,
          status,
          arrivalTime:
            status === "LATE" ? utcAt(session.sessionDate, group.startHour, 20) : null,
          // Journée dénormalisée = sessionDate (minuit UTC), même convention
          // que les enregistrements créés par les Server Actions.
          date: session.sessionDate,
          notes: status === "PRESENT" ? null : "Voir justificatif.",
        });
      });
    }
  }
  if (attendanceRows.length > 0) {
    await tx.attendance.createMany({
      data: attendanceRows,
      skipDuplicates: true,
    });
  }

  // 9. Workflows de voyage : Canada, Allemagne, France (Campus France).
  const [canadaWorkflow, germanyWorkflow, franceWorkflow] = await Promise.all([
    tx.workflow.create({
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
    }),
    tx.workflow.create({
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
    }),
    tx.workflow.create({
      data: {
        organizationId,
        country: "France",
        title: "Études supérieures en France",
        description:
          "Campus France (DAP verte) puis demande de visa au consulat.",
        baseCost: 850000,
        stages: {
          create: [
            {
              organizationId,
              title: "Constitution du dossier",
              order: 1,
              requiredDocuments: ["Passeport", "Diplômes"],
            },
            {
              organizationId,
              title: "Campus France (DAP)",
              order: 2,
              requiredDocuments: ["Dossier Campus France validé"],
            },
            {
              organizationId,
              title: "Blocage de fonds (Blocked Account)",
              order: 3,
              requiredDocuments: ["Attestation de blocage de fonds"],
            },
            {
              organizationId,
              title: "Consulat & visa",
              order: 4,
              requiredDocuments: ["Visa long séjour"],
            },
            {
              organizationId,
              title: "Départ",
              order: 5,
              requiredDocuments: ["Billet d'avion", "Logement"],
            },
          ],
        },
      },
    }),
  ]);
  // 10. TROIS dossiers de voyage (étudiants 0, 1 et 3).
  const canadaStudent = createdStudents[0];
  const germanyStudent = createdStudents[1];
  const franceStudent = createdStudents[3];

  const [canadaProcedure, germanyProcedure, franceProcedure] =
    await Promise.all([
      tx.travelProcedure.create({
        data: {
          organizationId,
          studentId: canadaStudent.id,
          advisorId: secretary.id,
          workflowId: canadaWorkflow.id,
          destination: "Canada",
          targetProgram: "Collège — Sciences informatiques",
          status: "ADMISSION_OBTAINED",
          totalCost: canadaWorkflow.baseCost,
          discount: 0,
          netAmount: canadaWorkflow.baseCost,
          currentStageOrder: 2,
          currentStageDeadline: new Date(year, 6, 15),
          notes:
            "Admission obtenue. Démarrage des démarches CAQ puis demande de visa.",
        },
      }),
      tx.travelProcedure.create({
        data: {
          organizationId,
          studentId: germanyStudent.id,
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
      }),
      tx.travelProcedure.create({
        data: {
          organizationId,
          studentId: franceStudent.id,
          advisorId: secretary.id,
          workflowId: franceWorkflow.id,
          destination: "France",
          targetProgram: "Licence — Droit",
          status: "VISA_APPLIED",
          totalCost: franceWorkflow.baseCost,
          discount: 0,
          netAmount: franceWorkflow.baseCost,
          currentStageOrder: 3,
          currentStageDeadline: new Date(year, 10, 1),
          notes:
            "Campus France validé, blocage de fonds effectué, consulat en attente.",
        },
      }),
    ]);

  // Paiements voyage (recettes récentes → journal de trésorerie).
  await tx.payment.createMany({
    data: [
      {
        organizationId,
        studentId: canadaStudent.id,
        travelProcedureId: canadaProcedure.id,
        amount: 200000,
        paymentMethod: "BANK_TRANSFER",
        status: "COMPLETED",
        reference: demoReference("TRV", 0, mailboxToken),
        description: "Accompte dossier Canada",
        paidAt: new Date(year, 2, 12),
      },
      {
        organizationId,
        studentId: germanyStudent.id,
        travelProcedureId: germanyProcedure.id,
        amount: 150000,
        paymentMethod: "MOBILE_MONEY",
        status: "COMPLETED",
        reference: demoReference("TRV", 1, mailboxToken),
        description: "Accompte dossier Allemagne",
        paidAt: new Date(currentYear, currentMonth, 4),
      },
      {
        organizationId,
        studentId: franceStudent.id,
        travelProcedureId: franceProcedure.id,
        amount: 100000,
        paymentMethod: "BANK_TRANSFER",
        status: "COMPLETED",
        reference: demoReference("TRV", 2, mailboxToken),
        description: "Accompte dossier France",
        paidAt: new Date(currentYear, currentMonth, 6),
      },
    ],
  });
  paymentCount += 3;

  // 11. Documents de voyage (pièces jointes) puis logements.
  await tx.document.createMany({
    data: [
      {
        organizationId,
        title: "Passeport — Awa Traoré",
        type: "PASSPORT",
        fileUrl: "https://drive.demo.eduflow.app/canada/passeport-awa.pdf",
        studentId: canadaStudent.id,
        travelProcedureId: canadaProcedure.id,
      },
      {
        organizationId,
        title: "Lettre d'admission — Collège Toronto",
        type: "DIPLOMA",
        fileUrl: "https://drive.demo.eduflow.app/canada/admission.pdf",
        studentId: canadaStudent.id,
        travelProcedureId: canadaProcedure.id,
      },
      {
        organizationId,
        title: "Certificat Goethe B1",
        type: "DIPLOMA",
        fileUrl: "https://drive.demo.eduflow.app/allemagne/goethe-b1.pdf",
        studentId: germanyStudent.id,
        travelProcedureId: germanyProcedure.id,
      },
      {
        organizationId,
        title: "Attestation de blocage de fonds",
        type: "OTHER",
        fileUrl: "https://drive.demo.eduflow.app/france/blocage-fonds.pdf",
        studentId: franceStudent.id,
        travelProcedureId: franceProcedure.id,
      },
    ],
  });

  await Promise.all([
    tx.housing.create({
      data: {
        organizationId,
        studentId: canadaStudent.id,
        name: "Résidence Leclerc — Toronto",
        address: "24 Avenue Leclerc, Toronto",
        city: "Toronto",
        monthlyRent: 850,
        deposit: 1700,
        contractStart: new Date(year, 8, 1),
        contractEnd: new Date(year + 1, 4, 31),
        notes: "Appartement partagé à 15 min du collège.",
      },
    }),
    tx.housing.create({
      data: {
        organizationId,
        studentId: franceStudent.id,
        name: "Cité universitaire — Paris",
        address: "17 Boulevard Jourdan, Paris",
        city: "Paris",
        monthlyRent: 78000,
        deposit: 156000,
        contractStart: new Date(year, 8, 15),
        contractEnd: new Date(year + 1, 5, 30),
        notes: "Chambre individuelle proche du campus.",
      },
    }),
  ]);
  // 12. Évaluations internes & notes (une session par classe linguistique).
  const [evaluationA1, evaluationB1] = await Promise.all([
    tx.evaluation.create({
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
    }),
    tx.evaluation.create({
      data: {
        organizationId,
        classId: englishClass.id,
        title: "Examen Continu N°1 — EN-B1",
        date: new Date(year, 2, 18),
        modules: {
          create: [
            { name: "Listening", maxScore: 100, passingScore: 60 },
            { name: "Writing", maxScore: 100, passingScore: 60 },
            { name: "Speaking", maxScore: 100, passingScore: 60 },
          ],
        },
      },
    }),
  ]);

  const [a1Modules, b1Modules] = await Promise.all([
    tx.evaluationModule.findMany({
      where: { evaluationId: evaluationA1.id },
      select: { id: true },
    }),
    tx.evaluationModule.findMany({
      where: { evaluationId: evaluationB1.id },
      select: { id: true },
    }),
  ]);

  const gradeRows: Prisma.GradeCreateManyInput[] = [];
  const a1Students = createdStudents.filter(
    (student) => student.classId === frenchClass.id
  );
  const b1Students = createdStudents.filter(
    (student) => student.classId === englishClass.id
  );

  a1Students.forEach((student, sIndex) => {
    a1Modules.forEach((module, mIndex) => {
      gradeRows.push({
        evaluationModuleId: module.id,
        studentId: student.id,
        score: Math.min(100, 55 + ((sIndex + mIndex * 3) % 40)),
      });
    });
  });
  b1Students.forEach((student, sIndex) => {
    b1Modules.forEach((module, mIndex) => {
      gradeRows.push({
        evaluationModuleId: module.id,
        studentId: student.id,
        score: Math.min(100, 58 + ((sIndex * 2 + mIndex * 4) % 38)),
      });
    });
  });
  if (gradeRows.length > 0) {
    await tx.grade.createMany({ data: gradeRows });
  }

  // 13. Dépenses opérationnelles (mois courant) — loyer + internet compris.
  await tx.expense.createMany({
    data: [
      {
        organizationId,
        createdById,
        title: "Loyer des locaux",
        category: "Loyer",
        amount: 150000,
        expenseDate: new Date(currentYear, currentMonth, 5),
        notes: "Loyer mensuel du centre.",
      },
      {
        organizationId,
        createdById,
        title: "Fournitures pédagogiques",
        category: "Matériel pédagogique",
        amount: 45000,
        expenseDate: new Date(currentYear, currentMonth, 8),
        notes: "Manuels et photocopies.",
      },
      {
        organizationId,
        createdById,
        title: "Internet & téléphonie",
        category: "Frais généraux",
        amount: 20000,
        expenseDate: new Date(currentYear, currentMonth, 15),
        notes: "Abonnement fibre + forfait mobile.",
      },
      {
        organizationId,
        createdById,
        title: "Salaires enseignants",
        category: "Salaires",
        amount: 250000,
        expenseDate: new Date(currentYear, currentMonth, 25),
        notes: null,
      },
    ],
  });

  // 14. Tâches de gestion réalistes.
  await tx.task.createMany({
    data: [
      {
        organizationId,
        createdById,
        assigneeId: secretary.id,
        title: "Relancer les prospects FR-A1",
        description:
          "Contacter les prospects de la session prochaine pour confirmer leur inscription.",
        status: "TODO",
        priority: "HIGH",
        dueDate: new Date(currentYear, currentMonth + 1, 5),
      },
      {
        organizationId,
        createdById,
        assigneeId: teacher.id,
        studentId: createdStudents[2].id,
        title: "Plan de rattrapage — Écrit B1",
        description:
          "Préparer un plan de rattrapage écrit pour l'étudiant en difficulté.",
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        dueDate: new Date(currentYear, currentMonth, 20),
      },
    ],
  });
  // 15. Catalogue de la caisse (POS) : catégories puis produits/services.
  const categoryRows = await Promise.all(
    DEMO_PRODUCT_CATEGORIES.map(async (categoryName) => {
      const category = await tx.productCategory.create({
        data: { organizationId, name: categoryName },
      });
      return { id: category.id, name: categoryName } as const;
    })
  );
  const categoryIdByName = new Map(
    categoryRows.map((category) => [category.name, category.id])
  );
  await tx.productService.createMany({
    data: DEMO_PRODUCTS.map((product) => ({
      organizationId,
      name: product.name,
      categoryId: product.categoryName
        ? categoryIdByName.get(product.categoryName) ?? null
        : null,
      unitPrice: product.unitPrice,
      description: product.description,
      isActive: true,
    })),
  });

  // On relit les produits créés pour référencer leurs prix dans les reçus POS.
  const seededProducts = await tx.productService.findMany({
    where: { organizationId },
    select: { id: true, name: true, unitPrice: true },
  });
  const productByName = new Map(
    seededProducts.map((product) => [product.name, product])
  );

  // 16. Reçus de vente comptoir (POS) — 4 ventes récentes (mois courant).
  await Promise.all(
    DEMO_SALES.map(async (draft, index) => {
      const items = draft.items.map((item) => {
        const product = productByName.get(item.productName);
        if (!product) {
          throw new Error(
            `[demo-seed] Produit POS introuvable : ${item.productName}`
          );
        }
        return {
          productServiceId: product.id,
          quantity: item.quantity,
          unitPrice: product.unitPrice,
          subtotal: product.unitPrice * item.quantity,
        };
      });
      const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);

      return tx.sale.create({
        data: {
          organizationId,
          studentId:
            draft.studentIndex != null
              ? createdStudents[draft.studentIndex].id
              : null,
          createdById,
          totalAmount,
          discount: 0,
          netAmount: totalAmount,
          paymentMethod: draft.paymentMethod,
          status: "COMPLETED",
          guestName: draft.guestName ?? null,
          guestPhone: draft.guestPhone ?? null,
          createdAt: new Date(
            currentYear,
            currentMonth,
            Math.min(2 + index, 24)
          ),
          items: { create: items },
        },
      });
    })
  );

  return {
    students: createdStudents.length,
    classes: 3,
    courses: 3,
    classSessions: classSessionCount,
    attendances: attendanceRows.length,
    travelProcedures: 3,
    documents: 4,
    expenses: 4,
    payments: paymentCount,
    sales: DEMO_SALES.length,
    evaluations: 2,
    tasks: 2,
    products: DEMO_PRODUCTS.length,
    categories: DEMO_PRODUCT_CATEGORIES.length,
    demoAccounts: 2,
  };
}
/**
 * Crée l'ensemble des données de démonstration pour une organisation.
 *
 * Conçu pour être appelé au moment de l'onboarding (Google OAuth) ainsi que
 * depuis l'action de ré-injection du tableau de bord :
 * - aucune exception pour un cas attendu (organisation introuvable ou déjà
 *   pourvue) : retour d'un résumé informatif avec `seeded: false` ;
 * - les données sont créées au sein d'une transaction atomique ;
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

  // Récupère l'organisation pour ses paramètres par défaut (frais d'inscription)
  // et son solde de caisse initial (trésorerie).
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      slug: true,
      defaultRegistrationFee: true,
      initialCashBalance: true,
    },
  });

  if (!organization) {
    return { seeded: false, reason: "ORG_NOT_FOUND", counts: emptyCounts() };
  }

  // Garde anti-doublon SANS exception : si l'organisation contient déjà des
  // élèves, des classes, des séances de cours (ClassSession), des présences
  // (Attendance) ou les comptes de démonstration, le seeding est ignoré
  // (retour informatif) au lieu de laisser Prisma lever une erreur de
  // contrainte unique (P2002).
  const firstEmails = demoAccountEmails(
    demoMailboxToken(organization.slug, organizationId, 1)
  );
  const [
    existingDemoAccounts,
    existingStudents,
    existingClasses,
    existingCourses,
    existingClassSessions,
    existingAttendances,
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
    prisma.class.count({ where: { organizationId } }),
    prisma.course.count({ where: { organizationId } }),
    prisma.classSession.count({ where: { organizationId } }),
    prisma.attendance.count({ where: { organizationId } }),
    prisma.expense.count({ where: { organizationId } }),
    prisma.payment.count({ where: { organizationId } }),
    prisma.productService.count({ where: { organizationId } }),
    prisma.productCategory.count({ where: { organizationId } }),
  ]);

  if (
    existingDemoAccounts > 0 ||
    existingStudents > 0 ||
    existingClasses > 0 ||
    existingClassSessions > 0 ||
    existingAttendances > 0
  ) {
    return {
      seeded: false,
      reason: "ALREADY_SEEDED",
      counts: {
        students: existingStudents,
        classes: existingClasses,
        courses: existingCourses,
        classSessions: existingClassSessions,
        attendances: existingAttendances,
        travelProcedures: 0,
        documents: 0,
        expenses: existingExpenses,
        payments: existingPayments,
        sales: 0,
        evaluations: 0,
        tasks: 0,
        products: existingProducts,
        categories: existingCategories,
        demoAccounts: existingDemoAccounts,
      },
    };
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Relance automatique : une collision unique (P2002) annule la transaction
  // entière puis relance le seeding avec de nouvelles séquences / identifiants.
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
            initialCashBalance: organization.initialCashBalance,
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