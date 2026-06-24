#!/bin/bash
# 批量生成 4 种音色的 TTS 语音
# 甜妹: zh-CN-XiaoxiaoNeural | 御姐: zh-CN-XiaoyiNeural
# 阳光男孩: zh-CN-YunxiNeural | 稳重男音: zh-CN-YunyangNeural

BASE="/home/Trui/game-platform/client/public/sfx/voice"

declare -A VOICES=(
  ["xiaoxiao"]="zh-CN-XiaoxiaoNeural"
  ["xiaoyi"]="zh-CN-XiaoyiNeural"
  ["yunxi"]="zh-CN-YunxiNeural"
  ["yunyang"]="zh-CN-YunyangNeural"
)

# 文件路径|文本
declare -a ITEMS=(
  "common/game_start.mp3|游戏开始"
  "common/win.mp3|恭喜你赢了"
  "common/lose.mp3|很遗憾你输了"
  "common/landlord_decided.mp3|地主已确定"
  "common/logout_confirm.mp3|确定要退出登录吗"
  "chinese-chess/move.mp3|落子"
  "chinese-chess/capture.mp3|吃子"
  "chinese-chess/check.mp3|将军"
  "chinese-chess/checkmate.mp3|绝杀"
  "chinese-chess/draw_request.mp3|对方发起求和"
  "chinese-chess/draw_agreed.mp3|双方和棋"
  "doudizhu/play_card.mp3|出牌"
  "doudizhu/pass.mp3|要不起"
  "doudizhu/bid.mp3|叫地主"
  "doudizhu/bid_grab.mp3|抢地主"
  "doudizhu/bid_landlord.mp3|我是地主"
  "doudizhu/bid_pass.mp3|不叫"
  "doudizhu/bomb.mp3|炸弹"
  "doudizhu/rocket.mp3|火箭"
  "doudizhu/double.mp3|加倍"
  "doudizhu/spring.mp3|春天"
  "doudizhu/straight.mp3|顺子"
  "doudizhu/pair.mp3|对子"
  "doudizhu/triple_one.mp3|三带一"
  "doudizhu/triple_pair.mp3|三带二"
  "doudizhu/plane.mp3|飞机"
  "doudizhu/plane_wing.mp3|飞机带翅膀"
  "doudizhu/four_two.mp3|四带二"
  "doudizhu/straight_pair.mp3|连对"
  "uno/play_card.mp3|出牌"
  "uno/draw_card.mp3|摸牌"
  "uno/call.mp3|UNO"
  "uno/skip.mp3|跳过"
  "uno/reverse.mp3|反转"
  "uno/draw2.mp3|加二"
  "uno/draw4.mp3|加四"
  "mahjong/pung.mp3|碰"
  "mahjong/kong.mp3|杠"
  "mahjong/chow.mp3|吃"
  "mahjong/win.mp3|胡了"
  "mahjong/zimo.mp3|自摸"
  "mahjong/discard.mp3|出牌"
  "mahjong/draw.mp3|摸牌"
  "gomoku/place.mp3|落子"
  "turtle-soup/yes.mp3|是的"
  "turtle-soup/no.mp3|不是"
  "turtle-soup/irrelevant.mp3|不相关"
  "turtle-soup/uncertain.mp3|不确定"
  "lobby/welcome.mp3|欢迎来到游戏大厅"
  "emotes/impatient.mp3|我等的花都谢了"
  "emotes/encourage.mp3|没事你已经很棒了"
  "emotes/taunt.mp3|就这再来"
  "emotes/praise.mp3|厉害厉害佩服佩服"
  "emotes/lag.mp3|网络卡了吗快点呀"
  "emotes/laugh.mp3|哈哈哈"
  "emotes/cry.mp3|呜呜呜"
  "emotes/think.mp3|让我想想"
  "emotes/lucky.mp3|今天运气真好"
  "emotes/unlucky.mp3|手气太差了"
  "emotes/gg.mp3|好棋好棋"
  "emotes/hurry.mp3|快点快点"
)

TOTAL=${#ITEMS[@]}
COUNT=0

for voice_name in "${!VOICES[@]}"; do
  voice_id="${VOICES[$voice_name]}"
  echo "=== 生成音色: $voice_name ($voice_id) ==="
  
  for item in "${ITEMS[@]}"; do
    IFS='|' read -r filepath text <<< "$item"
    dir="$BASE/$voice_name/$(dirname "$filepath")"
    mkdir -p "$dir"
    outfile="$BASE/$voice_name/$filepath"
    
    if [ -f "$outfile" ]; then
      COUNT=$((COUNT + 1))
      continue
    fi
    
    edge-tts --voice "$voice_id" --text "$text" --write-media "$outfile" 2>/dev/null
    if [ $? -eq 0 ]; then
      COUNT=$((COUNT + 1))
      echo "  [$COUNT/$((TOTAL * 4))] $voice_name/$filepath"
    else
      echo "  [FAIL] $voice_name/$filepath"
    fi
  done
done

echo ""
echo "=== 完成: $COUNT/$((TOTAL * 4)) 文件 ==="
