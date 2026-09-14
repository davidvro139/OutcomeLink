import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Synthetic demo data (Mountain West Technical College, spec §61) lands here
 * once core CRUD and the accreditation engine exist to generate realistic,
 * rule-consistent records against. Left empty until then.
 */
async function main() {
  console.log("No seed data yet — see docs/TODO.md stage 8.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
