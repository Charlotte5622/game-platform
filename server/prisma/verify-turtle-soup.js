const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  // 1. 分类验证
  const cats = await prisma.turtleSoupCategory.findMany({ orderBy: { sortOrder: 'asc' } });
  console.log('=== 分类 (' + cats.length + ') ===');
  for (const c of cats) {
    const count = await prisma.turtleSoupPuzzle.count({ where: { categoryId: c.id, isActive: true } });
    console.log(c.icon + ' ' + c.name + ' [' + c.id + '] ' + c.color + ' -> ' + count + '条');
  }

  // 2. 数据完整性验证
  const all = await prisma.turtleSoupPuzzle.findMany({ where: { isActive: true } });
  console.log('\n=== 数据完整性 (' + all.length + '条) ===');
  
  let issues = [];
  const idSet = new Set();
  for (const p of all) {
    if (idSet.has(p.id)) issues.push('重复ID: ' + p.id);
    idSet.add(p.id);
    if (!p.title || p.title.length < 5) issues.push(p.id + ': 标题过短(' + (p.title||'').length + '字)');
    if (!p.answer || p.answer.length < 10) issues.push(p.id + ': 答案过短(' + (p.answer||'').length + '字)');
    if (!p.keyFacts || p.keyFacts.length < 2) issues.push(p.id + ': keyFacts<2条(' + (p.keyFacts ? p.keyFacts.length : 0) + ')');
    if (!p.categoryId) issues.push(p.id + ': 缺少分类');
    if (!cats.find(c => c.id === p.categoryId)) issues.push(p.id + ': 分类不存在(' + p.categoryId + ')');
  }
  
  if (issues.length === 0) {
    console.log('✅ 所有数据完整，无问题');
  } else {
    console.log('❌ 发现 ' + issues.length + ' 个问题:');
    issues.slice(0, 20).forEach(i => console.log('  - ' + i));
  }

  // 3. 每个分类样本
  console.log('\n=== 每个分类样本 ===');
  for (const cat of cats) {
    const sample = await prisma.turtleSoupPuzzle.findFirst({
      where: { categoryId: cat.id, isActive: true },
      orderBy: { id: 'asc' }
    });
    if (sample) {
      console.log(cat.icon + ' [' + cat.name + ']');
      console.log('  ID: ' + sample.id);
      console.log('  标题: ' + sample.title.slice(0, 80));
      console.log('  答案: ' + sample.answer.slice(0, 80));
      console.log('  关键点: ' + sample.keyFacts.length + '条');
    }
  }

  // 4. 内容安全
  console.log('\n=== 内容安全检查 ===');
  let unsafe = 0;
  for (const p of all) {
    const t = p.title + p.answer;
    // 检查是否有乱码（连续非CJK非ASCII字符超过10个）
    if (/[\x00-\x08\x0e-\x1f]{3,}/.test(t)) {
      console.log('⚠️ ' + p.id + ' 可能含控制字符/乱码');
      unsafe++;
    }
  }
  if (unsafe === 0) console.log('✅ 无乱码/控制字符');

  // 5. 特殊字符检查
  let encodingIssues = 0;
  for (const p of all) {
    if (/\ufffd/.test(p.title + p.answer)) {
      console.log('⚠️ ' + p.id + ' 含替换字符(U+FFFD)');
      encodingIssues++;
    }
  }
  if (encodingIssues === 0) console.log('✅ 无编码问题');

  await prisma.$disconnect();
  console.log('\n========== 测试完成 ==========');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
