/**
 * 批量导入海龟汤题目（从 JSON 文件）
 * 用法: node prisma/import-turtle-soup.js
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// 分类关键词映射
const CATEGORY_RULES = {
  horror: ['死', '杀', '尸体', '血', '自杀', '谋杀', '毒', '坠', '摔死', '砍', '刺', '枪', '勒', '窒息', '幽灵', '恐怖', '坟墓', '棺材', '饮弹', '毒杀', '杀害', '杀人'],
  humor: ['没想到', '居然', '原来', '结果', '误会', '乌龙', '巧合', '阴差阳错'],
  heartwarming: ['爱', '感动', '感谢', '帮助', '善良', '温暖', '守护', '牺牲', '保护', '亲情', '友情', '爱情', '宠物'],
  mindblown: ['外星', '时间', '穿越', '平行', '虚拟', '游戏', '魔法', '超能力', '基因', '克隆', '机器人', 'ai'],
};

function classify(item) {
  const combined = (item.title + item.answer).toLowerCase();
  const scores = {};
  
  for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
    scores[cat] = keywords.reduce((sum, kw) => sum + (combined.includes(kw) ? 1 : 0), 0);
  }
  
  // 特殊加权
  if (/自杀|饮弹|毒杀|谋杀|杀害|杀人/.test(combined)) scores.horror += 3;
  if (/原来是|其实|结果发现/.test(combined)) scores.humor += 2;
  
  const best = Object.entries(scores).reduce((a, b) => b[1] > a[1] ? b : a);
  return best[1] > 1 ? best[0] : 'mystery';
}

async function main() {
  const jsonPath = path.join(__dirname, '../../data/turtle_soup_import_20260623.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  
  console.log(`读取到 ${data.length} 条题目`);
  
  // 确保分类存在
  const categories = [
    { id: 'mystery', name: '悬疑推理', icon: '🔍', color: '#8e44ad', sortOrder: 0 },
    { id: 'horror', name: '恐怖惊悚', icon: '👻', color: '#c0392b', sortOrder: 1 },
    { id: 'humor', name: '黑色幽默', icon: '🎭', color: '#e67e22', sortOrder: 2 },
    { id: 'heartwarming', name: '温馨感人', icon: '💝', color: '#e91e63', sortOrder: 3 },
    { id: 'mindblown', name: '脑洞大开', icon: '🧠', color: '#00bcd4', sortOrder: 4 },
  ];
  
  for (const cat of categories) {
    await prisma.turtleSoupCategory.upsert({
      where: { id: cat.id },
      update: { name: cat.name, icon: cat.icon, color: cat.color, sortOrder: cat.sortOrder },
      create: cat,
    });
  }
  console.log(`✅ 分类已同步: ${categories.length} 个`);
  
  // 导入题目
  let created = 0, updated = 0, skipped = 0;
  const catCounts = {};
  
  for (const item of data) {
    const categoryId = classify(item);
    catCounts[categoryId] = (catCounts[categoryId] || 0) + 1;
    
    // 清理标题中的编号前缀
    let title = item.title;
    const dotMatch = title.match(/^\d+-\d+\.\s*/);
    if (dotMatch) {
      title = title.slice(dotMatch[0].length);
    }
    
    try {
      const existing = await prisma.turtleSoupPuzzle.findUnique({ where: { id: item.id } });
      
      if (existing) {
        await prisma.turtleSoupPuzzle.update({
          where: { id: item.id },
          data: {
            categoryId,
            title,
            answer: item.answer,
            keyFacts: item.keyFacts,
            isActive: true,
          },
        });
        updated++;
      } else {
        await prisma.turtleSoupPuzzle.create({
          data: {
            id: item.id,
            categoryId,
            title,
            answer: item.answer,
            keyFacts: item.keyFacts,
          },
        });
        created++;
      }
    } catch (err) {
      console.error(`❌ ${item.id}: ${err.message}`);
      skipped++;
    }
  }
  
  console.log(`\n✅ 导入完成:`);
  console.log(`   新增: ${created}, 更新: ${updated}, 跳过: ${skipped}`);
  console.log(`\n分类分布:`);
  for (const [cat, count] of Object.entries(catCounts)) {
    const catInfo = categories.find(c => c.id === cat);
    console.log(`   ${catInfo.icon} ${catInfo.name}: ${count}条`);
  }
  
  // 统计总数
  const total = await prisma.turtleSoupPuzzle.count();
  console.log(`\n📦 数据库总题目数: ${total}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
