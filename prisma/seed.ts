import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Mot de passe commun à tous les comptes de démonstration. */
const DEMO_PASSWORD = "password123";
const demoPasswordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

async function main() {
  console.log("🌱 Seeding database...");

  // --------------------------------------
  // Garde-fou anti-écrasement en production
  // --------------------------------------
  // Le seed supprime TOUTES les données existantes. Exécuté automatiquement
  // pendant un build / un déploiement en production (NODE_ENV=production), il
  // écraserait une base réelle sans le vouloir (« automatic database reset »).
  // On refuse donc tant que la base contient des organisations, sauf demande
  // EXPLICITE via EDUFLOW_SEED_FORCE=1 (reset volontaire d'exploitation).
  if (process.env.NODE_ENV === "production") {
    const existingOrganizations = await prisma.organization.count();

    if (existingOrganizations > 0 && process.env.EDUFLOW_SEED_FORCE !== "1") {
      throw new Error(
        "[seed] Base non vide en production — refus d'écraser les données. " +
          "Définissez EDUFLOW_SEED_FORCE=1 UNIQUEMENT pour un reset volontaire."
      );
    }
  }

  // Clean existing data (in dependency order)
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.productService.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.courseLog.deleteMany();
  await prisma.workflowStage.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.task.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.travelProcedure.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.course.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // --------------------------------------
  // Organizations
  // --------------------------------------
  const org1 = await prisma.organization.create({
    data: {
      name: "Centre de Formation Excellence",
      slug: "excellence-formation",
      email: "contact@excellence-formation.com",
      phone: "+225 07 00 00 00 01",
      address: "Abidjan, Cocody",
    },
  });

  const org2 = await prisma.organization.create({
    data: {
      name: "Agence Mobilité Internationale Horizon",
      slug: "horizon-mobilite",
      email: "info@horizon-mobilite.com",
      phone: "+225 07 00 00 00 02",
      address: "Abidjan, Plateau",
    },
  });

  // --------------------------------------
  // Users
  // --------------------------------------
  const admin1 = await prisma.user.create({
    data: {
      organizationId: org1.id,
      email: "admin@excellence-formation.com",
      passwordHash: demoPasswordHash,
      firstName: "Jean",
      lastName: "Dupont",
      role: "ADMIN",
    },
  });

  const teacher1 = await prisma.user.create({
    data: {
      organizationId: org1.id,
      email: "teacher@excellence-formation.com",
      passwordHash: demoPasswordHash,
      firstName: "Marie",
      lastName: "Kouassi",
      role: "TEACHER",
    },
  });

  const staff1 = await prisma.user.create({
    data: {
      organizationId: org1.id,
      email: "staff@excellence-formation.com",
      passwordHash: demoPasswordHash,
      firstName: "Paul",
      lastName: "N'Guessan",
      role: "STAFF",
    },
  });

  const admin2 = await prisma.user.create({
    data: {
      organizationId: org2.id,
      email: "admin@horizon-mobilite.com",
      passwordHash: demoPasswordHash,
      firstName: "Sophie",
      lastName: "Bamba",
      role: "ADMIN",
    },
  });

    // --------------------------------------
  // Plateforme (back-office Super-Admin)
  // --------------------------------------
  // Organisation « porteuse » du compte Super-Admin : la relation
  // Organization est obligatoire pour tout utilisateur. Cette organisation
  // n'est pas un client — elle héberge uniquement le compte technique
  // d'administration de la plateforme EduFlow (Phase 2).
  const platformOrg = await prisma.organization.create({
    data: {
      name: "EduFlow Platform",
      slug: "eduflow-platform",
      email: "platform@eduflow.app",
    },
  });

  // Super Admin principal — email UNIQUE, compatible connexion Google.
  // Identique à la valeur reçue par la logique RBAC de src/auth.ts
  // (PLATFORM_SUPER_ADMIN_EMAIL) : la première connexion Google avec cet email
  // provisionne/rajuste ce compte en rôle SUPER_ADMIN. L'upsert garantit
  // l'idempotence du seed : aucune erreur P2002 (contrainte email unique)
  // même si un enregistrement avec cet email subsistait avant ce run.
  //
  // NOTE schéma : le modèle Prisma `User` n'expose ni colonne `name` ni
  // colonne `emailVerified`. Le nom « Jean-Baptiste (Super Admin) » est donc
  // réparti sur `firstName`/`lastName`, et l'équivalent fonctionnel de «
  // emailVerified » est le booléen `isActive` (compte opérationnel dès la fin
  // du seed — connexion au back-office à la route /portal-sys-admin-sec).
  const superAdmin = await prisma.user.upsert({
    where: { email: "jeanbaptistedegbey10@gmail.com" },
    update: {
      organizationId: platformOrg.id,
      passwordHash: demoPasswordHash,
      firstName: "Jean-Baptiste",
      lastName: "Degbey",
      role: "SUPER_ADMIN",
      isActive: true,
    },
    create: {
      organizationId: platformOrg.id,
      email: "jeanbaptistedegbey10@gmail.com",
      passwordHash: demoPasswordHash,
      firstName: "Jean-Baptiste",
      lastName: "Degbey",
      role: "SUPER_ADMIN",
      isActive: true,
    },
  });

  // --------------------------------------
  // Students
  // --------------------------------------
  const student1 = await prisma.student.create({
    data: {
      organizationId: org1.id,
      studentCode: "STU-2026-001",
      firstName: "Awa",
      lastName: "Traoré",
      email: "awa.traore@example.com",
      phone: "+225 05 00 00 00 01",
      clientType: "LANGUAGE_AND_TRAVEL",
      totalCost: 400000,
      discount: 25000,
      netAmount: 375000,
      dateOfBirth: new Date("2000-03-15"),
      address: "Abidjan, Yopougon",
      status: "ENROLLED",
    },
  });

  const student2 = await prisma.student.create({
    data: {
      organizationId: org1.id,
      studentCode: "STU-2026-002",
      firstName: "Koffi",
      lastName: "Konan",
      email: "koffi.konan@example.com",
      phone: "+225 05 00 00 00 02",
      clientType: "LANGUAGE_ONLY",
      totalCost: 150000,
      discount: 0,
      netAmount: 150000,
      dateOfBirth: new Date("1998-07-22"),
      address: "Abidjan, Treichville",
      status: "IN_PROGRESS",
    },
  });

  const student3 = await prisma.student.create({
    data: {
      organizationId: org1.id,
      studentCode: "STU-2026-003",
      firstName: "Fatou",
      lastName: "Diallo",
      email: "fatou.diallo@example.com",
      phone: "+225 05 00 00 00 03",
      clientType: "TRAVEL_ONLY",
      dateOfBirth: new Date("2000-11-05"),
      address: "Abidjan, Marcory",
      status: "PROSPECT",
    },
  });

  const student4 = await prisma.student.create({
    data: {
      organizationId: org2.id,
      studentCode: "STU-2026-004",
      firstName: "Yao",
      lastName: "Aka",
      email: "yao.aka@example.com",
      phone: "+225 05 00 00 00 04",
      clientType: "TRAVEL_ONLY",
      totalCost: 200000,
      discount: 0,
      netAmount: 200000,
      dateOfBirth: new Date("1999-01-30"),
      address: "Abidjan, Abobo",
      status: "ENROLLED",
    },
  });

  // --------------------------------------
  // Courses
  // --------------------------------------
  const course1 = await prisma.course.create({
    data: {
      organizationId: org1.id,
      teacherId: teacher1.id,
      title: "Anglais Professionnel",
      code: "ENG-PRO-101",
      description: "Cours d'anglais professionnel pour adultes (niveau B1-B2)",
      price: 150000,
      durationWeeks: 12,
    },
  });

  const course2 = await prisma.course.create({
    data: {
      organizationId: org1.id,
      teacherId: teacher1.id,
      title: "Allemand Intensif",
      code: "GER-INT-201",
      description: "Préparation intensive à l'allemand pour Ausbildung",
      price: 250000,
      durationWeeks: 16,
    },
  });

  const course3 = await prisma.course.create({
    data: {
      organizationId: org1.id,
      teacherId: teacher1.id,
      title: "Préparation DELF B2",
      code: "DELF-B2-301",
      description: "Préparation à l'examen DELF B2",
      price: 120000,
      durationWeeks: 8,
    },
  });

  const course4 = await prisma.course.create({
    data: {
      organizationId: org2.id,
      title: "Préparation TestDaF",
      code: "TDF-401",
      description: "Préparation au TestDaF pour admission universitaire",
      price: 200000,
      durationWeeks: 10,
    },
  });

  // --------------------------------------
  // Classes (cohortes liées aux cours)
  // --------------------------------------
  const class1 = await prisma.class.create({
    data: {
      organizationId: org1.id,
      courseId: course1.id,
      name: "Anglais Professionnel - Groupe A",
      schedule: "Lun-Mer 09:00-12:00",
      tuitionFee: 150000,
    },
  });

  const class2 = await prisma.class.create({
    data: {
      organizationId: org1.id,
      courseId: course2.id,
      name: "Allemand Intensif - Groupe A",
      schedule: "Lun-Ven 14:00-17:00",
      tuitionFee: 250000,
    },
  });

  // --------------------------------------
  // Class Sessions (séances concrètes)
  // --------------------------------------
  const session1 = await prisma.classSession.create({
    data: {
      organizationId: org1.id,
      classId: class1.id,
      subjectName: "Anglais Professionnel",
      chapter: "Module 1: Business Greetings",
      sessionDate: new Date("2026-08-18"),
      startTime: new Date("2026-08-18T09:00:00.000Z"),
      endTime: new Date("2026-08-18T12:00:00.000Z"),
    },
  });

  const session2 = await prisma.classSession.create({
    data: {
      organizationId: org1.id,
      classId: class1.id,
      subjectName: "Anglais Professionnel",
      chapter: "Module 1: Business Greetings",
      sessionDate: new Date("2026-08-20"),
      startTime: new Date("2026-08-20T09:00:00.000Z"),
      endTime: new Date("2026-08-20T12:00:00.000Z"),
    },
  });

  const session3 = await prisma.classSession.create({
    data: {
      organizationId: org2.id,
      classId: class2.id,
      subjectName: "Allemand Intensif",
      chapter: "Module 1: Grundlagen",
      sessionDate: new Date("2026-08-19"),
      startTime: new Date("2026-08-19T14:00:00.000Z"),
      endTime: new Date("2026-08-19T17:00:00.000Z"),
    },
  });

  // --------------------------------------
  // Enrollments
  // --------------------------------------
  await prisma.enrollment.create({
    data: {
      studentId: student1.id,
      courseId: course1.id,
      progress: 0.35,
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student1.id,
      courseId: course2.id,
      progress: 0.1,
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student2.id,
      courseId: course1.id,
      progress: 0.6,
    },
  });

  await prisma.enrollment.create({
    data: {
      studentId: student4.id,
      courseId: course4.id,
      progress: 0.2,
    },
  });

  // --------------------------------------
  // Workflows (Procédures par défaut : Allemagne, Canada, France)
  // --------------------------------------
  const workflowGermany = await prisma.workflow.create({
    data: {
      organizationId: org1.id,
      country: "Allemagne",
      title: "Procédure Allemagne — Ausbildung",
      description: "Accompagnement complet pour Ausbildung et études en Allemagne",
      isDefault: true,
      baseCost: 850000,
      stages: {
        create: [
          {
            organizationId: org1.id,
            title: "Évaluation du dossier",
            order: 0,
            requiredDocuments: [
              "Pièce d'identité",
              "Diplômes",
              "Relevés de notes",
            ],
          },
          {
            organizationId: org1.id,
            title: "Test de langue (B1/B2)",
            order: 1,
            requiredDocuments: ["Certificat de langue B1 ou B2"],
          },
          {
            organizationId: org1.id,
            title: "Candidature aux établissements",
            order: 2,
            requiredDocuments: [
              "CV",
              "Lettre de motivation",
              "Certificat de langue",
              "Diplômes traduits",
            ],
          },
          {
            organizationId: org1.id,
            title: "Admission obtenue",
            order: 3,
            requiredDocuments: ["Lettre d'admission", "Contrat de formation"],
          },
          {
            organizationId: org1.id,
            title: "Demande de visa",
            order: 4,
            requiredDocuments: [
              "Passeport",
              "Lettre d'admission",
              "Preuves de financement",
              "Assurance santé",
            ],
          },
          {
            organizationId: org1.id,
            title: "Visa approuvé",
            order: 5,
            requiredDocuments: ["Visa", "Billet d'avion"],
          },
          {
            organizationId: org1.id,
            title: "Départ & installation",
            order: 6,
            requiredDocuments: ["Contrat de logement", "Assurance"],
          },
        ],
      },
    },
  });

  const workflowCanada = await prisma.workflow.create({
    data: {
      organizationId: org1.id,
      country: "Canada",
      title: "Procédure Canada — Études supérieures",
      description: "Accompagnement pour étudier au Canada",
      isDefault: true,
      baseCost: 950000,
      stages: {
        create: [
          {
            organizationId: org1.id,
            order: 0,
            title: "Évaluation du projet",
            requiredDocuments: ["Pièce d'identité", "Diplômes"],
          },
          {
            organizationId: org1.id,
            order: 1,
            title: "Tests de langue (IELTS/TEF)",
            requiredDocuments: ["Certificat IELTS/TEF"],
          },
          {
            organizationId: org1.id,
            order: 2,
            title: "Candidature universitaire",
            requiredDocuments: ["CV", "Lettre de motivation", "Relevés de notes"],
          },
          {
            organizationId: org1.id,
            order: 3,
            title: "CAQ & Permis d'études",
            requiredDocuments: ["Lettre d'admission", "Preuves financières"],
          },
          {
            organizationId: org1.id,
            order: 4,
            title: "Visa & départ",
            requiredDocuments: ["Passeport", "Visa", "Billet d'avion"],
          },
        ],
      },
    },
  });

  const workflowFrance = await prisma.workflow.create({
    data: {
      organizationId: org1.id,
      country: "France",
      title: "Procédure France — Visa étudiant",
      description: "Accompagnement pour les études en France",
      isDefault: true,
      baseCost: 750000,
      stages: {
        create: [
          {
            organizationId: org1.id,
            order: 0,
            title: "Préparation du dossier",
            requiredDocuments: ["Pièce d'identité", "Diplômes", "CV"],
          },
          {
            organizationId: org1.id,
            order: 1,
            title: "Inscription Campus France",
            requiredDocuments: ["Dossier Campus France", "Certificats de langue"],
          },
          {
            organizationId: org1.id,
            order: 2,
            title: "Entretien Campus France",
            requiredDocuments: ["Convocation à l'entretien"],
          },
          {
            organizationId: org1.id,
            order: 3,
            title: "Demande de visa",
            requiredDocuments: [
              "Passeport",
              "Attestation Campus France",
              "Preuves de financement",
            ],
          },
          {
            organizationId: org1.id,
            order: 4,
            title: "Visa & départ",
            requiredDocuments: ["Visa", "Billet d'avion", "Assurance"],
          },
        ],
      },
    },
  });

  // --------------------------------------
  // Travel Procedures
  // --------------------------------------
  const travel1 = await prisma.travelProcedure.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
      advisorId: staff1.id,
      workflowId: workflowGermany.id,
      destination: "Allemagne",
      targetProgram: "Ausbildung - Soins infirmiers",
      status: "LANGUAGE_TEST",
      totalCost: 850000,
      discount: 50000,
      netAmount: 800000,
      currentStageOrder: 1,
      notes: "Étudiant motivé, bon niveau B1 en allemand",
    },
  });

  await prisma.travelProcedure.create({
    data: {
      organizationId: org2.id,
      studentId: student4.id,
      destination: "Canada",
      targetProgram: "Études supérieures - Informatique",
      status: "ADMISSION_APPLIED",
      totalCost: 950000,
      discount: 50000,
      netAmount: 900000,
      currentStageOrder: 2,
      notes: "Dossier complet envoyé à l'université",
    },
  });

  // --------------------------------------
  // Payments
  // --------------------------------------
  await prisma.payment.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
      travelProcedureId: travel1.id,
      amount: 75000,
      currency: "XOF",
      paymentMethod: "MOBILE_MONEY",
      status: "COMPLETED",
      reference: "PAY-2026-0001",
      description: "Premier versement - Anglais Professionnel",
    },
  });

  await prisma.payment.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
      travelProcedureId: travel1.id,
      amount: 75000,
      currency: "XOF",
      paymentMethod: "CASH",
      status: "COMPLETED",
      reference: "PAY-2026-0002",
      description: "Deuxième versement - Anglais Professionnel",
    },
  });

  await prisma.payment.create({
    data: {
      organizationId: org1.id,
      studentId: student2.id,
      amount: 150000,
      currency: "XOF",
      paymentMethod: "BANK_TRANSFER",
      status: "COMPLETED",
      reference: "PAY-2026-0003",
      description: "Paiement complet - Anglais Professionnel",
    },
  });

  await prisma.payment.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
      travelProcedureId: travel1.id,
      amount: 200000,
      currency: "XOF",
      paymentMethod: "MOBILE_MONEY",
      status: "COMPLETED",
      reference: "PAY-2026-0005",
      description: "Échelonnement 1 - Procédure Allemagne",
    },
  });

  await prisma.payment.create({
    data: {
      organizationId: org2.id,
      studentId: student4.id,
      amount: 100000,
      currency: "XOF",
      paymentMethod: "MOBILE_MONEY",
      status: "PARTIAL",
      reference: "PAY-2026-0004",
      description: "Premier versement - Préparation TestDaF",
    },
  });

  // --------------------------------------
  // Catégories personnalisées du catalogue (POS)
  // --------------------------------------
  const booksCategory = await prisma.productCategory.create({
    data: { organizationId: org1.id, name: "Livres & Fascicules" },
  });
  const servicesCategory = await prisma.productCategory.create({
    data: { organizationId: org1.id, name: "Services Assermentés" },
  });

  // --------------------------------------
  // Product Services (POS)
  // --------------------------------------
  await prisma.productService.create({
    data: {
      organizationId: org1.id,
      name: "Manuel Anglais B1",
      categoryId: booksCategory.id,
      unitPrice: 15000,
      description: "Manuel d'anglais professionnel niveau B1",
    },
  });

  await prisma.productService.create({
    data: {
      organizationId: org1.id,
      name: "Livre Allemand B1",
      categoryId: booksCategory.id,
      unitPrice: 18000,
      description: "Méthode d'allemand niveau B1",
    },
  });

  await prisma.productService.create({
    data: {
      organizationId: org1.id,
      name: "Traduction de documents",
      categoryId: servicesCategory.id,
      unitPrice: 5000,
      description: "Tarif par page traduite (FR/DE/EN)",
    },
  });

  // Article SANS catégorie (apparaît sous le filtre « Sans catégorie » du POS).
  await prisma.productService.create({
    data: {
      organizationId: org1.id,
      name: "Photocopies (page)",
      categoryId: null,
      unitPrice: 100,
      description: "Photocopie noir & blanc par page",
    },
  });

  await prisma.productService.create({
    data: {
      organizationId: org1.id,
      name: "Certificat de langue",
      categoryId: servicesCategory.id,
      unitPrice: 20000,
      description: "Délivrance de certificat de langue",
    },
  });

  // --------------------------------------
  // Sales (POS / Caisse)
  // --------------------------------------
  const sale1 = await prisma.sale.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
      createdById: admin1.id,
      totalAmount: 30000,
      discount: 2000,
      netAmount: 28000,
      status: "COMPLETED",
    },
  });

  const bookProduct = await prisma.productService.findFirstOrThrow({
    where: { organizationId: org1.id, name: "Manuel Anglais B1" },
  });

  const copyProduct = await prisma.productService.findFirstOrThrow({
    where: { organizationId: org1.id, name: "Photocopies (page)" },
  });

  await prisma.saleItem.create({
    data: {
      saleId: sale1.id,
      productServiceId: bookProduct.id,
      quantity: 2,
      unitPrice: 15000,
      subtotal: 30000,
    },
  });

  await prisma.saleItem.create({
    data: {
      saleId: sale1.id,
      productServiceId: copyProduct.id,
      quantity: 10,
      unitPrice: 100,
      subtotal: 1000,
    },
  });

  // --------------------------------------
  // Attendance & CourseLogs (Cahier de texte)
  // --------------------------------------
  await prisma.attendance.createMany({
    data: [
      {
        organizationId: org1.id,
        sessionId: session1.id,
        classId: class1.id,
        studentId: student1.id,
        status: "PRESENT",
        date: new Date("2026-08-18T09:00:00.000Z"),
      },
      {
        organizationId: org1.id,
        sessionId: session1.id,
        classId: class1.id,
        studentId: student2.id,
        status: "PRESENT",
        date: new Date("2026-08-18T09:00:00.000Z"),
      },
      {
        organizationId: org1.id,
        sessionId: session2.id,
        classId: class1.id,
        studentId: student1.id,
        status: "PRESENT",
        date: new Date("2026-08-20T09:00:00.000Z"),
      },
      {
        organizationId: org1.id,
        sessionId: session2.id,
        classId: class1.id,
        studentId: student2.id,
        status: "ABSENT",
        date: new Date("2026-08-20T09:00:00.000Z"),
        notes: "Absence non justifiée",
      },
      {
        organizationId: org2.id,
        sessionId: session3.id,
        classId: class2.id,
        studentId: student3.id,
        status: "EXCUSED",
        date: new Date("2026-08-19T14:00:00.000Z"),
        notes: "Certificat médical fourni",
      },
    ],
  });

  await prisma.courseLog.create({
    data: {
      organizationId: org1.id,
      courseId: course1.id,
      teacherId: teacher1.id,
      date: new Date("2026-08-18T09:00:00.000Z"),
      chapterTitle: "Chapitre 2 : Le present perfect",
      content:
        "Révision du present simple puis introduction du present perfect. Comparaison des deux temps à travers des exercices oraux et écrits.",
      homework: "Exercices pages 32-34 du manuel.",
      notes: "Bonne participation générale.",
    },
  });

  await prisma.courseLog.create({
    data: {
      organizationId: org1.id,
      courseId: course1.id,
      teacherId: teacher1.id,
      date: new Date("2026-08-20T09:00:00.000Z"),
      chapterTitle: "Chapitre 3 : Le conditionnel passé",
      content:
        "Introduction au conditionnel passé : formation, emplois (regret, reproche, hypothèse) et mise en pratique à l'oral.",
      homework: "Exercices pages 45-47 du manuel.",
      notes: "Revoir la prononciation des verbes irréguliers.",
    },
  });

  await prisma.courseLog.create({
    data: {
      organizationId: org1.id,
      courseId: course2.id,
      teacherId: teacher1.id,
      date: new Date("2026-08-19T14:00:00.000Z"),
      chapterTitle: "Unité 4 : Au contact des patients",
      content:
        "Vocabulaire du lexique médical et des interactions avec les patients. Jeux de rôle en binômes.",
      homework: "Apprendre la liste de vocabulaire, préparer un dialogue.",
    },
  });

  // --------------------------------------
  // Expenses
  // --------------------------------------
  await prisma.expense.create({
    data: {
      organizationId: org1.id,
      createdById: admin1.id,
      title: "Loyer local",
      category: "RENT",
      amount: 500000,
      currency: "XOF",
      expenseDate: new Date("2026-08-01"),
      notes: "Loyer mensuel du local de Cocody",
    },
  });

  await prisma.expense.create({
    data: {
      organizationId: org1.id,
      createdById: admin1.id,
      title: "Fournitures de bureau",
      category: "SUPPLIES",
      amount: 25000,
      currency: "XOF",
      expenseDate: new Date("2026-08-10"),
      notes: "Papeterie et fournitures",
    },
  });

  // --------------------------------------
  // Payrolls
  // --------------------------------------
  await prisma.payroll.create({
    data: {
      organizationId: org1.id,
      userId: teacher1.id,
      salaryAmount: 300000,
      bonus: 50000,
      deductions: 0,
      netPaid: 350000,
      payPeriod: "2026-08",
    },
  });

  await prisma.payroll.create({
    data: {
      organizationId: org1.id,
      userId: staff1.id,
      salaryAmount: 200000,
      bonus: 0,
      deductions: 0,
      netPaid: 200000,
      payPeriod: "2026-08",
    },
  });

  // --------------------------------------
  // Tasks
  // --------------------------------------
  await prisma.task.create({
    data: {
      organizationId: org1.id,
      createdById: admin1.id,
      assigneeId: staff1.id,
      title: "Préparer les dossiers d'admission",
      description: "Rassembler les documents pour les candidatures universitaires",
      status: "IN_PROGRESS",
      priority: "HIGH",
      dueDate: new Date("2026-09-15"),
    },
  });

  await prisma.task.create({
    data: {
      organizationId: org1.id,
      createdById: admin1.id,
      assigneeId: teacher1.id,
      title: "Préparer le programme DELF B2",
      description: "Créer le syllabus et les supports de cours",
      status: "TODO",
      priority: "MEDIUM",
      dueDate: new Date("2026-09-01"),
    },
  });

  await prisma.task.create({
    data: {
      organizationId: org2.id,
      createdById: admin2.id,
      title: "Relancer les prospects",
      description: "Contacter les prospects pour la session d'octobre",
      status: "TODO",
      priority: "URGENT",
      dueDate: new Date("2026-08-30"),
    },
  });

  // --------------------------------------
  // Verify — les identifiants doivent réellement fonctionner en base
  // --------------------------------------
  const demoAccounts = [
    { email: "jeanbaptistedegbey10@gmail.com", role: "SUPER_ADMIN", organizationId: platformOrg.id },
    { email: "admin@excellence-formation.com", role: "ADMIN", organizationId: org1.id },
    { email: "teacher@excellence-formation.com", role: "TEACHER", organizationId: org1.id },
    { email: "staff@excellence-formation.com", role: "STAFF", organizationId: org1.id },
    { email: "admin@horizon-mobilite.com", role: "ADMIN", organizationId: org2.id },
  ];

  for (const account of demoAccounts) {
    const user = await prisma.user.findUnique({
      where: { email: account.email },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        organizationId: true,
        passwordHash: true,
        organization: { select: { name: true } },
      },
    });

    if (!user) {
      throw new Error(
        `Vérification seed : le compte ${account.email} est introuvable en base.`
      );
    }

    if (!user.isActive) {
      throw new Error(
        `Vérification seed : le compte ${account.email} n'est pas actif.`
      );
    }

    if (user.organizationId !== account.organizationId) {
      throw new Error(
        `Vérification seed : le compte ${account.email} n'est pas rattaché à la bonne organisation.`
      );
    }

    const passwordOk = await bcrypt.compare(DEMO_PASSWORD, user.passwordHash);

    if (!passwordOk) {
      throw new Error(
        `Vérification seed : le mot de passe du compte ${account.email} ne correspond pas au hash stocké.`
      );
    }

    console.log(
      `   ✔ ${user.email} (${user.role}) → organisation « ${user.organization.name} » : connexion vérifiée.`
    );
  }

  // --------------------------------------
  // Summary
  // --------------------------------------
  console.log("✅ Seed completed successfully!");
  console.log(
    `   Organizations: ${org1.name}, ${org2.name}, ${platformOrg.name} (système)`
  );
  console.log(`   🔑 Comptes de démonstration (mot de passe : ${DEMO_PASSWORD}) :`);
  console.log(
    `      - ${superAdmin.email} (SUPER_ADMIN) — accès Google OAuth / back-office /portal-sys-admin-sec`
  );
  console.log(`      - ${admin1.email} (ADMIN)`);
  console.log(`      - ${teacher1.email} (TEACHER)`);
  console.log(`      - ${staff1.email} (STAFF)`);
  console.log(`      - ${admin2.email} (ADMIN)`);
  console.log(`   Students: ${student1.studentCode}, ${student2.studentCode}, ${student3.studentCode}, ${student4.studentCode}`);
  console.log(`   Workflows: ${workflowGermany.country}, ${workflowCanada.country}, ${workflowFrance.country}`);
  console.log(`   Courses: ${course1.code}, ${course2.code}, ${course3.code}, ${course4.code}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });