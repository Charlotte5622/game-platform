const { CATEGORIES, PUZZLES } = require('../../games/turtle-soup/server/puzzles');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  for (let i = 0; i < CATEGORIES.length; i++) {
    const cat = CATEGORIES[i];
    await prisma.turtleSoupCategory.upsert({
      where: { id: cat.id },
      update: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: i },
      create: { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color, sortOrder: i },
    });
  }

  for (const puzzle of PUZZLES) {
    await prisma.turtleSoupPuzzle.upsert({
      where: { id: puzzle.id },
      update: {
        categoryId: puzzle.category,
        title: puzzle.title,
        answer: puzzle.answer,
        keyFacts: puzzle.keyFacts,
        isActive: true,
      },
      create: {
        id: puzzle.id,
        categoryId: puzzle.category,
        title: puzzle.title,
        answer: puzzle.answer,
        keyFacts: puzzle.keyFacts,
      },
    });
  }

  console.log(`Seeded ${CATEGORIES.length} categories, ${PUZZLES.length} puzzles`);
}

seed().catch(console.error).finally(() => prisma.$disconnect());
