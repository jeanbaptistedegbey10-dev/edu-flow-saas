const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const org = await prisma.organization.findFirst({
    where: { name: { startsWith: "Centre Démo Test" } },
    select: { id: true, name: true, slug: true },
    orderBy: { createdAt: "desc" },
  });
  if (!org) {
    console.log("No demo org found");
    await prisma.$disconnect();
    return;
  }
  console.log("ORG:", org);
  const [students, courses, expenses, payments, products, categories, users] =
    await Promise.all([
      prisma.student.count({ where: { organizationId: org.id } }),
      prisma.course.count({ where: { organizationId: org.id } }),
      prisma.expense.count({ where: { organizationId: org.id } }),
      prisma.payment.count({ where: { organizationId: org.id } }),
      prisma.productService.findMany({ where: { organizationId: org.id }, select: { name: true, category: true } }),
      prisma.productCategory.findMany({ where: { organizationId: org.id }, select: { name: true, _count: { select: { products: true } } } }),
      prisma.user.findMany({ where: { organizationId: org.id }, select: { email: true, role: true, firstName: true, lastName: true } }),
    ]);
  console.log("students:", students);
  console.log("courses:", courses);
  console.log("expenses:", expenses);
  console.log("payments:", payments);
  console.log("products:", products);
  console.log("categories:", categories);
  console.log("users:", users);
  await prisma.$disconnect();
})();
