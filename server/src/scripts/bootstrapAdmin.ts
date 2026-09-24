import { hashPassword } from "../lib/password";
import { prisma } from "../lib/prisma";

/**
 * Creates the first institution and its System Administrator on a fresh
 * deployment, where self-service registration is (rightly) turned off:
 *
 *   node dist/scripts/bootstrapAdmin.js --institution "Acme College" \
 *     --name "Ada Admin" --email ada@acme.edu --password '<at least 8 chars>'
 *
 * (In development: `npm run bootstrap -- --institution ...`.) Refuses to
 * create a user whose email already exists. Further users are invited from the
 * Users page by this administrator.
 */
function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const institutionName = argument("institution");
  const name = argument("name");
  const email = argument("email")?.trim();
  const password = argument("password") ?? process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!institutionName || !name || !email || !password) {
    console.error(
      'Usage: bootstrapAdmin --institution "<name>" --name "<full name>" --email <email> --password <password>\n' +
        "       (the password may instead be given in the BOOTSTRAP_ADMIN_PASSWORD environment variable)",
    );
    process.exit(2);
  }
  if (password.length < 8) {
    console.error("The password must be at least 8 characters.");
    process.exit(2);
  }
  if (await prisma.user.findUnique({ where: { email } })) {
    console.error(`An account with the email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    const institution = await tx.institution.create({ data: { name: institutionName } });
    return tx.user.create({
      data: { institutionId: institution.id, name, email, passwordHash, role: "SYSTEM_ADMINISTRATOR" },
    });
  });
  console.log(`Created institution "${institutionName}" and System Administrator ${user.email}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
