#!/bin/bash
# 开发环境启动脚本

set -e

echo "🎮 联机游戏平台 - 开发环境启动"
echo "================================"

# 检查是否已复制配置文件
if [ ! -f config/.env ]; then
  echo "📋 复制配置文件..."
  cp config/example.env config/.env
fi

# 检查 Docker 是否可用
if command -v docker &> /dev/null; then
  echo "🐳 使用 Docker Compose 启动..."
  docker-compose up -d db redis
  echo "⏳ 等待数据库就绪..."
  sleep 3

  echo "📦 安装后端依赖..."
  cd server && npm install && cd ..

  echo "📦 安装前端依赖..."
  cd client && npm install && cd ..

  echo "🗄️ 初始化数据库..."
  cd server && npx prisma db push && cd ..

  echo "🚀 启动后端服务..."
  cd server && npm run dev &
  SERVER_PID=$!

  echo "🚀 启动前端服务..."
  cd client && npm run dev &
  CLIENT_PID=$!

  echo ""
  echo "✅ 启动完成！"
  echo "   前端: http://localhost:3000"
  echo "   后端: http://localhost:8080"
  echo ""
  echo "按 Ctrl+C 停止所有服务"

  # 等待子进程
  trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null; docker-compose stop db redis" EXIT
  wait
else
  echo "❌ 请先安装 Docker 和 Docker Compose"
  echo "   https://docs.docker.com/get-docker/"
  exit 1
fi
