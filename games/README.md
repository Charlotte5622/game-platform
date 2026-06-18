# 🎮 游戏目录

每个游戏一个独立文件夹，包含完整的游戏代码。

## 📁 结构

```
games/
├── game-template/      # 🎯 游戏模板（新游戏从这里复制）
├── tic-tac-toe/       # ✅ 井字棋（示例）
├── chess/             # ♟️ 象棋（示例）
└── your-game/         # 🎮 你的游戏
```

## 🎯 单个游戏结构

```
my-game/
├── README.md          # 游戏说明、规则
├── game.json          # 游戏元数据（名称、描述、玩家数）
├── server/            # 游戏逻辑（服务端）
│   ├── index.js       # 入口
│   └── game.js        # 核心逻辑
├── client/            # 游戏前端（UI）
│   ├── index.html
│   ├── style.css
│   └── game.js
└── assets/            # 图片、音效等资源
```

## 📝 game.json 示例

```json
{
  "id": "tic-tac-toe",
  "name": "井字棋",
  "description": "经典双人对战游戏",
  "minPlayers": 2,
  "maxPlayers": 2,
  "thumbnail": "assets/thumbnail.png"
}
```
