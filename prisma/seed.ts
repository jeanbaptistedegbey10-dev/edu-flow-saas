import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Mot de passe commun à tous les comptes de démonstration. */
const DEMO_PASSWORD = "password123";
const demoPasswordHash = bcrypt.hashSync(DEMO_PASSWORD, 10);

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data (in dependency order)
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
  // Payments
  // --------------------------------------
  await prisma.payment.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
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
  // Travel Procedures
  // --------------------------------------
  await prisma.travelProcedure.create({
    data: {
      organizationId: org1.id,
      studentId: student1.id,
      advisorId: staff1.id,
      destination: "Allemagne",
      targetProgram: "Ausbildung - Soins infirmiers",
      status: "LANGUAGE_TEST",
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
      notes: "Dossier complet envoyé à l'université",
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

  console.log("✅ Seed completed successfully!");
  console.log(`   Organizations: ${org1.name}, ${org2.name}`);
  console.log(`   🔑 Comptes de démonstration (mot de passe : ${DEMO_PASSWORD}) :`);
  console.log(`      - ${admin1.email} (ADMIN)`);
  console.log(`      - ${teacher1.email} (TEACHER)`);
  console.log(`      - ${staff1.email} (STAFF)`);
  console.log(`      - ${admin2.email} (ADMIN)`);
  console.log(`   Students: ${student1.studentCode}, ${student2.studentCode}, ${student3.studentCode}, ${student4.studentCode}`);
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