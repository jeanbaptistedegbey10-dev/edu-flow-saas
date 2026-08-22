# 🚀 SAAS MANAGEMENT CENTER (ERP / CRM FORMATION & VOYAGE)

## 📌 OVERVIEW
SaaS multi-tenant dédié aux centres de formation (langues, cours professionnels) et agences de mobilité internationale (Ausbildung, Studium, Visas).

## 🛠 TECH STACK
- **Framework:** Next.js 14+ (App Router, Server Components & Server Actions)
- **Language:** TypeScript
- **Styling:** Tailwind CSS + Shadcn UI
- **State Management:** Zustand
- **Database:** PostgreSQL (via Supabase)
- **ORM:** Prisma ORM
- **Authentication:** Supabase Auth (ou Auth.js)
- **Deployment:** Vercel (CD/CI via GitHub repo)
- **Icons:** Lucide React

---

## 🗄 DATABASE SCHEMA ARCHITECTURE (Prisma)

### Key Entities:
1. `Organization` (Multi-tenancy: max_organizations limit per subscription plan)
2. `User` (Roles: SUPER_ADMIN, ADMIN_CENTER, SECRETARY, TEACHER)
3. `Student` (Profiles: FORMATION_ONLY, PROCEDURE_ONLY, BOTH)
4. `Course` (Standard, Refinement, Exam Prep) & `Enrollment`
5. `Payment` (Installments, Deductions, Receipts, Discount Tracking)
6. `TravelProcedure` (Pipeline stages: B1/B2, Document Prep, Application, Visa)
7. `Expense` (Category-based outflows: rent, salaries, maintenance)
8. `Payroll` (Employee salaries, bonuses, deductions)
9. `Task` (Internal Kanban tasks: Urgent, Medium, Low)

---

## 🧱 RULES & CODING GUIDELINES FOR AI ASSISTANTS

1. **NO ARCHITECTURE OVERHAUL:** Do not change the routing (App Router), state management (Zustand), or ORM (Prisma). Maintain existing patterns.
2. **MODULAR STRUCTURE:** Keep components small and atomic inside `/components/ui` or `/components/modules/[module-name]`.
3. **NO DIRECT SQL:** Use Prisma client (`lib/prisma.ts`) for all database operations.
4. **TYPE SAFETY:** Every API route, Server Action, and component MUST be strictly typed.
5. **UI & PERFORMANCE:** 
   - Use Skeleton loaders for dynamic data.
   - Do not generate heavy PDFs on page render; handle PDF exports lazily upon user click.
   - Keep page loading state minimal.
6. **MULTI-TENANT ISOLATION:** Always filter database queries by `organizationId`.

---

## 📊 CORE MODULES TO DEVELOP

- [ ] **Module 1: Auth & Multi-Tenant Switcher** (Organization selector)
- [ ] **Module 2: Student Management & Flexible Registration** (Single/Recurring registration fee)
- [ ] **Module 3: Treasury & Accounting** (Income from courses/sales vs Expenses/Salaries + Net Solde)
- [ ] **Module 4: Installment Payment & Receipt Generator** (Remaining balance calculation)
- [ ] **Module 5: Travel Procedure Tracker** (Customizable pipeline stages for Ausbildung/Visas)
- [ ] **Module 6: Pedagogical & Attendance Tracker** (Chapter checklist, Attendance per session)
- [ ] **Module 7: Dynamic Gradebook & PDF Bulletins** (Custom logo, header, HEX color theme)
- [ ] **Module 8: Super Admin Console** (Plan management, custom license/quota overrides)

---

## 🚦 CURRENT DEV STATUS
- **Status:** Initializing project environment.
- **Next Step:** Init Next.js App, set up Prisma schema, configure Supabase connection string.