const { PrismaClient } = require('@prisma/client');

// 单例 PrismaClient - 避免多实例连接池泄漏
const prisma = new PrismaClient();

module.exports = prisma;
