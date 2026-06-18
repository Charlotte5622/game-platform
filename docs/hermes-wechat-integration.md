# Hermes + 微信 + 游戏平台 集成方案

## 🏗️ 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         用户端                               │
├─────────────────────────────────────────────────────────────┤
│   微信 App  │  Telegram  │  Web 浏览器  │  CLI 终端        │
└──────┬──────────┬──────────────┬───────────────┬────────────┘
       │          │              │               │
       ▼          ▼              ▼               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Hermes Gateway (消息网关)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ WeChat      │  │ Telegram    │  │ WebSocket   │         │
│  │ Adapter     │  │ Adapter     │  │ Adapter     │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│                   Hermes Agent Core                         │
│              (AI 智能体 + 技能系统)                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    游戏平台 API                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│  │ 房间    │  │ 匹配    │  │ 游戏    │  │ 用户    │       │
│  │ 管理    │  │ 系统    │  │ 状态    │  │ 数据    │       │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    游戏服务器                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                     │
│  │ 五子棋  │  │ 象棋    │  │ UNO     │  │ ...             │
│  └─────────┘  └─────────┘  └─────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Hermes 的角色

Hermes 作为**智能中间层**，负责：

### 1. 自然语言理解
```
用户: "帮我开一局五子棋"
Hermes: → 调用 create_room(game="gobang", players=2)
       → 返回房间链接/邀请码
```

### 2. 消息路由
```
微信消息 → WeChat Adapter → Hermes → Game API → 响应 → 微信
```

### 3. 状态同步
```
游戏状态变化 → Hermes → 推送到所有玩家的微信/Telegram
```

## 📱 微信接入方案

### 方案 A：Wechaty（推荐）

[Wechaty](https://github.com/wechaty/wechaty) 是最成熟的微信机器人 SDK。

```python
# hermes_wechat_adapter.py

from wechaty import Wechaty, Contact, Message
from hermes.gateway import BaseAdapter

class WechatAdapter(BaseAdapter):
    """Hermes 微信适配器"""

    def __init__(self, config):
        super().__init__(config)
        self.bot = Wechaty(config)

    async def on_message(self, msg: Message):
        """收到微信消息"""
        if msg.is_text():
            # 转发给 Hermes Agent
            user_id = msg.talker().contact_id
            text = msg.text()

            response = await self.hermes.process(
                user_id=user_id,
                platform="wechat",
                message=text
            )

            # 回复微信
            await msg.say(response)

    async def send_message(self, user_id: str, content: str):
        """发送微信消息"""
        contact = await self.bot.Contact.find(user_id)
        await contact.say(content)
```

### 方案 B：企业微信 Webhook

如果用企业微信，可以用 webhook 方式更稳定：

```python
import requests

class WeComAdapter(BaseAdapter):
    """企业微信适配器"""

    def __init__(self, corp_id, agent_id, secret):
        self.corp_id = corp_id
        self.agent_id = agent_id
        self.secret = secret
        self.token = self._get_token()

    async def send_message(self, user_id: str, content: str):
        url = f"https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token={self.token}"
        data = {
            "touser": user_id,
            "msgtype": "text",
            "agentid": self.agent_id,
            "text": {"content": content}
        }
        requests.post(url, json=data)
```

## 🎮 游戏平台 API 设计

Hermes 需要调用的游戏平台 API：

```yaml
# 游戏房间
POST /api/rooms          # 创建房间
GET  /api/rooms/{id}     # 获取房间信息
POST /api/rooms/{id}/join  # 加入房间

# 游戏状态
GET  /api/games/{id}/state   # 获取游戏状态
POST /api/games/{id}/action  # 执行游戏动作

# 用户
GET  /api/users/{id}/stats   # 用户统计
GET  /api/users/{id}/history # 游戏历史

# 匹配
POST /api/matchmaking        # 加入匹配队列
```

## 🔧 实现步骤

### Step 1: 安装 Hermes
```bash
# 克隆仓库
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent

# 安装依赖
pip install -e .

# 初始化
hermes setup
```

### Step 2: 创建微信适配器
```bash
# 在 Hermes 项目中创建适配器
mkdir -p ~/.hermes/adapters/wechat
```

### Step 3: 配置 Hermes
```yaml
# ~/.hermes/config.yaml
gateway:
  adapters:
    - name: wechat
      enabled: true
      config:
        puppet: wechaty-puppet-padlocal  # 或其他 puppet
        token: YOUR_WECHATY_TOKEN

    - name: telegram
      enabled: true
      config:
        token: YOUR_TELEGRAM_BOT_TOKEN

tools:
  - name: game_platform
    type: api
    base_url: http://localhost:8080
    endpoints:
      - create_room
      - join_room
      - get_state
```

### Step 4: 创建游戏技能
```python
# ~/.hermes/skills/game_manager.py

from hermes.skills import BaseSkill

class GameManagerSkill(BaseSkill):
    """游戏管理技能"""

    name = "game_manager"
    description = "管理游戏房间、匹配、状态查询"

    async def create_room(self, game_type: str, players: int = 2):
        """创建游戏房间"""
        response = await self.api.post("/rooms", {
            "game": game_type,
            "max_players": players
        })
        return f"房间已创建！房间号：{response['room_id']}"

    async def join_room(self, room_id: str):
        """加入游戏房间"""
        response = await self.api.post(f"/rooms/{room_id}/join")
        return f"已加入房间 {room_id}，等待其他玩家..."

    async def check_status(self, room_id: str):
        """查看游戏状态"""
        state = await self.api.get(f"/games/{room_id}/state")
        return self._format_state(state)
```

## 💬 使用示例

配置完成后，用户可以通过微信自然语言控制：

```
用户: 帮我开一局五子棋
Hermes: 好的！房间已创建，房间号是 ABC123
       邀请链接：http://your-server/game/ABC123
       告诉朋友房间号即可加入！

用户: 查看当前游戏
Hermes: 你有 1 个进行中的游戏：
       - 五子棋 vs 小明（轮到你了）
       点击进入：http://your-server/game/ABC123

用户: 我今天战绩如何
Hermes: 今日战绩：
       - 五子棋：5胜3负
       - 象棋：2胜1平
       胜率：62.5%
```

## ⚠️ 注意事项

1. **微信限制**：微信 Web 协议已基本不可用，建议用：
   - Padlocal（付费，稳定）
   - Windows Hook（免费，但需要 Windows）
   - 企业微信（推荐，官方支持）

2. **安全性**：
   - 游戏平台 API 需要鉴权
   - 防止刷分/作弊
   - 消息内容过滤

3. **性能**：
   - WebSocket 长连接保活
   - 消息队列缓冲
   - 游戏状态缓存
