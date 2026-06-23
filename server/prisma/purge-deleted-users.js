require('dotenv').config({ path: '../config/.env' });

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: {
      status: 'pending_deletion',
      deletionRequestedAt: { lte: cutoff },
    },
    select: { id: true },
  });

  if (users.length === 0) {
    console.log('[purge] no users to delete');
    return;
  }

  const ids = users.map((user) => user.id);
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`[purge] deleted ${ids.length} users`);
}

main()
  .catch((err) => {
    console.error('[purge] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
