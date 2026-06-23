
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

(async () => {
  const cats = await prisma.turtleSoupCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  const puzzles = await prisma.turtleSoupPuzzle.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    include: { category: true }
  });

  let lines = [];
  lines.push('/**');
  lines.push(' * 海龟汤谜题库 (自动生成)');
  lines.push(' * 总计: ' + puzzles.length + ' 道题');
  lines.push(' */');
  lines.push('');
  lines.push('const CATEGORIES = [');
  for (const c of cats) {
    lines.push("  { id: '" + c.id + "', name: '" + c.name + "', icon: '" + c.icon + "', color: '" + c.color + "', sortOrder: " + c.sortOrder + " },");
  }
  lines.push('];');
  lines.push('');
  lines.push('const PUZZLES = [');
  
  let currentCat = '';
  for (const p of puzzles) {
    if (p.categoryId !== currentCat) {
      currentCat = p.categoryId;
      const catName = cats.find(c => c.id === currentCat)?.name || currentCat;
      lines.push('  // ==================== ' + catName + ' ====================');
    }
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    lines.push('  {');
    lines.push("    id: '" + p.id + "',");
    lines.push("    category: '" + p.categoryId + "',");
    lines.push("    title: '" + esc(p.title) + "',");
    lines.push("    answer: '" + esc(p.answer) + "',");
    lines.push('    keyFacts: [');
    for (const k of p.keyFacts) {
      lines.push("      '" + esc(k) + "',");
    }
    lines.push('    ],');
    lines.push('  },');
  }
  lines.push('];');
  lines.push('');
  lines.push('module.exports = { CATEGORIES, PUZZLES };');
  lines.push('');

  const content = lines.join('\n');
  fs.writeFileSync('/home/Trui/game-platform/games/turtle-soup/server/puzzles.js', content, 'utf-8');
  console.log('✅ puzzles.js 已更新: ' + puzzles.length + ' 道题, ' + cats.length + ' 个分类');
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
