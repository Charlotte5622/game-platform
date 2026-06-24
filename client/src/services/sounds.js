/**
 * 游戏音效系统
 *
 * 使用 Web Audio API 程序化生成音效，无需外部音频文件
 * 支持：斗地主、UNO、象棋、海龟汤
 */

let audioCtx = null;
let _resumeBound = false;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // 桌面端：首次用户交互时自动 resume，解决 suspended 状态
    if (!_resumeBound) {
      _resumeBound = true;
      const resume = () => {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      };
      // capture: true 确保在事件到达目标之前就触发 resume
      document.addEventListener('click', resume, { capture: true });
      document.addEventListener('keydown', resume, { capture: true });
      document.addEventListener('mousedown', resume, { capture: true });
      document.addEventListener('touchstart', resume, { capture: true });
      document.addEventListener('pointerdown', resume, { capture: true });
    }
  }
  return audioCtx;
}

/** 播放音量（0-1），可通过 setVolume 调整 */
let masterVolume = 0.5;
let bgmState = null;

function applyBgmVolume() {
  if (!bgmState?.gain || !audioCtx) return;
  const target = bgmState.baseVolume * masterVolume;
  bgmState.gain.gain.cancelScheduledValues(audioCtx.currentTime);
  bgmState.gain.gain.setTargetAtTime(target, audioCtx.currentTime, 0.08);
}

export function setVolume(v) {
  masterVolume = Math.max(0, Math.min(1, v));
  applyBgmVolume();
}
export function getVolume() { return masterVolume; }

/**
 * 基础音调播放
 */
function playTone(freq, duration, type = 'sine', vol = 0.5) {
  const ctx = getCtx();
  const _doPlay = () => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol * masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(_doPlay).catch(() => {});
  } else {
    _doPlay();
  }
}

/**
 * 噪音（用于爆炸等效果）
 */
function playNoise(duration, vol = 0.3) {
  const ctx = getCtx();
  const _doPlay = () => {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol * masterVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  };
  if (ctx.state === 'suspended') {
    ctx.resume().then(_doPlay).catch(() => {});
  } else {
    _doPlay();
  }
}

// ==================== 背景配乐 ====================

const BGM_PATTERNS = {
  doudizhu: {
    stepMs: 420,
    wave: 'triangle',
    baseVolume: 0.07,
    melody: [392, null, 440, 494, 440, 392, 330, null, 392, 440, 523, null, 494, 440, 392, null],
    bass: [196, null, null, null, 220, null, null, null, 196, null, null, null, 165, null, null, null],
  },
  uno: {
    stepMs: 300,
    wave: 'square',
    baseVolume: 0.055,
    melody: [523, 659, 784, null, 659, 587, 659, null, 523, 659, 880, null, 784, 659, 587, null],
    bass: [131, null, 165, null, 196, null, 165, null],
  },
  mahjong: {
    stepMs: 520,
    wave: 'triangle',
    baseVolume: 0.06,
    melody: [330, null, 392, 494, null, 440, 392, null, 330, 392, null, 494, 440, null, 392, null],
    bass: [165, null, null, null, 196, null, null, null],
  },
  'chinese-chess': {
    stepMs: 680,
    wave: 'sine',
    baseVolume: 0.05,
    melody: [294, null, 349, null, 392, 349, 330, null, 247, null, 294, 330, 294, null, null, null],
    bass: [147, null, null, null, 196, null, null, null],
  },
  gomoku: {
    stepMs: 560,
    wave: 'sine',
    baseVolume: 0.05,
    melody: [392, null, 440, null, 392, 330, null, null, 349, null, 392, null, 440, 392, null, null],
    bass: [196, null, null, null, 165, null, null, null],
  },
  'turtle-soup': {
    stepMs: 740,
    wave: 'sine',
    baseVolume: 0.045,
    melody: [220, null, 261, 247, null, 196, null, null, 233, null, 261, null, 220, null, null, null],
    bass: [110, null, null, null, 98, null, null, null],
  },
};

function playBgmTone(freq, duration, type, vol, when = 0) {
  if (!bgmState?.gain || !freq) return;
  const ctx = getCtx();
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
    return; // 会在 resume 后下一个 tick 播放
  }
  const startAt = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.linearRampToValueAtTime(vol, startAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(bgmState.gain);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.03);
}

export function startGameBgm(gameId) {
  const pattern = BGM_PATTERNS[gameId];
  if (!pattern) {
    stopGameBgm();
    return;
  }

  if (bgmState?.gameId === gameId) return;
  stopGameBgm({ fade: false });

  const ctx = getCtx();
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(pattern.baseVolume * masterVolume, ctx.currentTime + 0.7);
  gain.connect(ctx.destination);

  bgmState = {
    gameId,
    gain,
    baseVolume: pattern.baseVolume,
    step: 0,
    timer: null,
  };

  const tick = () => {
    if (!bgmState || bgmState.gameId !== gameId) return;
    const index = bgmState.step;
    const note = pattern.melody[index % pattern.melody.length];
    const bass = pattern.bass?.[index % pattern.bass.length];
    const duration = Math.max(0.16, (pattern.stepMs / 1000) * 0.72);
    playBgmTone(note, duration, pattern.wave, 0.34);
    playBgmTone(bass, duration * 1.4, 'sine', 0.18);
    bgmState.step += 1;
  };

  tick();
  bgmState.timer = setInterval(tick, pattern.stepMs);
}

export function stopGameBgm({ fade = true } = {}) {
  if (!bgmState) return;
  const current = bgmState;
  bgmState = null;
  if (current.timer) clearInterval(current.timer);
  if (!audioCtx || !current.gain) return;

  const now = audioCtx.currentTime;
  current.gain.gain.cancelScheduledValues(now);
  current.gain.gain.setValueAtTime(Math.max(current.gain.gain.value, 0.0001), now);
  current.gain.gain.exponentialRampToValueAtTime(0.0001, now + (fade ? 0.45 : 0.03));
  setTimeout(() => {
    try {
      current.gain.disconnect();
    } catch {}
  }, fade ? 520 : 80);
}

// ==================== 斗地主音效 ====================

/** 出牌 - 清脆的点击声 */
export function soundCardPlay() {
  playTone(800, 0.08, 'square', 0.3);
  setTimeout(() => playTone(1200, 0.05, 'square', 0.2), 30);
}

/** 不出 - 低沉的闷声 */
export function soundPass() {
  playTone(300, 0.15, 'sine', 0.2);
}

/** 叫分 - 上升音调 */
export function soundBid() {
  playTone(500, 0.1, 'sine', 0.3);
  setTimeout(() => playTone(700, 0.1, 'sine', 0.3), 80);
  setTimeout(() => playTone(900, 0.15, 'sine', 0.3), 160);
}

/** 炸弹 - 爆炸声 */
export function soundBomb() {
  playNoise(0.4, 0.5);
  playTone(150, 0.3, 'sawtooth', 0.4);
  setTimeout(() => playTone(80, 0.4, 'sawtooth', 0.3), 100);
}

/** 火箭 - 升天声 */
export function soundRocket() {
  for (let i = 0; i < 8; i++) {
    setTimeout(() => playTone(200 + i * 100, 0.15, 'sawtooth', 0.3), i * 60);
  }
  setTimeout(() => playNoise(0.5, 0.4), 400);
}

/** 胜利 - 欢快旋律 */
export function soundWin() {
  const notes = [523, 659, 784, 1047]; // C E G C
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.2, 'sine', 0.4), i * 150);
  });
}

/** 失败 - 下降音 */
export function soundLose() {
  playTone(400, 0.3, 'sine', 0.3);
  setTimeout(() => playTone(300, 0.3, 'sine', 0.3), 200);
  setTimeout(() => playTone(200, 0.4, 'sine', 0.3), 400);
}

/** 倒计时警告 - 嘀嘀声 */
export function soundTimerWarn() {
  playTone(1000, 0.1, 'square', 0.2);
  setTimeout(() => playTone(1000, 0.1, 'square', 0.2), 200);
}

// ==================== UNO 音效 ====================

/** UNO 出牌 */
export function soundUnoPlay() {
  playTone(600, 0.08, 'triangle', 0.3);
  setTimeout(() => playTone(900, 0.06, 'triangle', 0.2), 40);
}

/** UNO 摸牌 */
export function soundUnoDraw() {
  playTone(400, 0.1, 'sine', 0.2);
}

/** UNO 喊 UNO */
export function soundUnoCall() {
  playTone(800, 0.15, 'square', 0.4);
  setTimeout(() => playTone(1000, 0.15, 'square', 0.4), 100);
  setTimeout(() => playTone(1200, 0.2, 'square', 0.4), 200);
}

/** UNO +4 炸弹 */
export function soundUnoWild4() {
  playNoise(0.3, 0.3);
  playTone(200, 0.2, 'sawtooth', 0.3);
}

// ==================== 象棋音效 ====================

/** 落子 */
export function soundChessMove() {
  playTone(300, 0.05, 'square', 0.3);
  setTimeout(() => playTone(200, 0.08, 'square', 0.2), 30);
}

/** 吃子 */
export function soundChessCapture() {
  playTone(500, 0.08, 'square', 0.3);
  setTimeout(() => playTone(300, 0.1, 'square', 0.3), 50);
  setTimeout(() => playTone(150, 0.15, 'square', 0.2), 100);
}

/** 将军 */
export function soundChessCheck() {
  playTone(800, 0.15, 'square', 0.4);
  setTimeout(() => playTone(1000, 0.15, 'square', 0.4), 150);
}

// ==================== 海龟汤音效 ====================

/** 提问 */
export function soundSoupAsk() {
  playTone(500, 0.1, 'sine', 0.2);
}

/** 回答（是） */
export function soundSoupYes() {
  playTone(600, 0.1, 'sine', 0.3);
  setTimeout(() => playTone(800, 0.15, 'sine', 0.3), 80);
}

/** 回答（不是） */
export function soundSoupNo() {
  playTone(400, 0.15, 'sine', 0.3);
}

/** 猜对了 */
export function soundSoupCorrect() {
  const notes = [523, 659, 784, 1047, 1319];
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, 'sine', 0.4), i * 100);
  });
}

// ==================== 大厅/房间音效 ====================

/** 欢迎/进入大厅 */
export function soundWelcome() {
  const notes = [523, 659, 784]; // C5 E5 G5
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, 'sine', 0.3), i * 120);
  });
  playWav('lobby/welcome.mp3');
}

/** 加入/创建房间 */
export function soundRoomJoin() {
  playTone(600, 0.1, 'triangle', 0.3);
  setTimeout(() => playTone(900, 0.12, 'triangle', 0.3), 80);
}

/** 新玩家加入房间 */
export function soundPlayerJoin() {
  playTone(800, 0.1, 'sine', 0.25);
  setTimeout(() => playTone(1000, 0.12, 'sine', 0.25), 100);
}

/** 玩家离开房间 */
export function soundPlayerLeave() {
  playTone(600, 0.1, 'sine', 0.2);
  setTimeout(() => playTone(400, 0.12, 'sine', 0.2), 80);
}

/** 匹配中脉冲音 */
export function soundMatching() {
  playTone(500, 0.1, 'sine', 0.2);
}

/** 所有玩家就绪 */
export function soundAllReady() {
  playTone(1000, 0.1, 'sine', 0.3);
  setTimeout(() => playTone(1200, 0.15, 'sine', 0.3), 100);
}

/** 游戏开始 */
export function soundGameStart() {
  const notes = [523, 659, 784, 1047]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    setTimeout(() => playTone(f, 0.15, 'sine', 0.4), i * 100);
  });
  setTimeout(() => playWav('common/game_start.mp3'), 400);
}

/** 被踢出房间 */
export function soundKicked() {
  playTone(400, 0.15, 'square', 0.3);
  setTimeout(() => playTone(250, 0.2, 'square', 0.3), 100);
}

// ==================== 通用音效 ====================

/** 按钮点击 */
export function soundClick() {
  playTone(600, 0.05, 'sine', 0.15);
}

/** 错误提示 */
export function soundError() {
  playTone(300, 0.15, 'square', 0.3);
  setTimeout(() => playTone(250, 0.2, 'square', 0.3), 100);
}

/** 通知 */
export function soundNotify() {
  playTone(800, 0.1, 'sine', 0.3);
  setTimeout(() => playTone(1000, 0.15, 'sine', 0.3), 100);
}

/**
 * 音效映射表 - 按游戏ID和事件名索引
 */
export const SOUND_MAP = {
  lobby: {
    welcome: soundWelcome,
    room_join: soundRoomJoin,
    player_join: soundPlayerJoin,
    player_leave: soundPlayerLeave,
    matching: soundMatching,
    all_ready: soundAllReady,
    game_start: soundGameStart,
    kicked: soundKicked,
  },
  doudizhu: {
    play_card: () => { soundCardPlay(); playWav('doudizhu/play_card.mp3'); },
    pass: () => { soundPass(); playWav('doudizhu/pass.mp3'); },
    bid: () => playWav('doudizhu/bid.mp3'),
    bid_grab: () => playWav('doudizhu/bid_grab.mp3'),
    bid_landlord: () => playWav('doudizhu/bid_landlord.mp3'),
    bid_pass: () => playWav('doudizhu/bid_pass.mp3'),
    bomb: () => { soundBomb(); playWav('doudizhu/bomb.mp3'); },
    rocket: () => { soundRocket(); playWav('doudizhu/rocket.mp3'); },
    double: () => playWav('doudizhu/double.mp3'),
    spring: () => playWav('doudizhu/spring.mp3'),
    // 组合牌专属语音
    straight: () => playWav('doudizhu/straight.mp3'),
    pair: () => playWav('doudizhu/pair.mp3'),
    triple_one: () => playWav('doudizhu/triple_one.mp3'),
    triple_pair: () => playWav('doudizhu/triple_pair.mp3'),
    plane: () => playWav('doudizhu/plane.mp3'),
    plane_wing: () => playWav('doudizhu/plane_wing.mp3'),
    four_two: () => playWav('doudizhu/four_two.mp3'),
    straight_pair: () => playWav('doudizhu/straight_pair.mp3'),
    win: () => playWav('win.mp3'),
    lose: () => playWav('lose.mp3'),
    timer_warn: soundTimerWarn,
    alert: soundTimerWarn,
  },
  uno: {
    play_card: () => { soundUnoPlay(); playWav('uno/play_card.mp3'); },
    draw_card: () => { soundUnoDraw(); playWav('uno/draw_card.mp3'); },
    uno: () => { soundUnoCall(); playWav('uno/call.mp3'); },
    skip: () => playWav('uno/skip.mp3'),
    reverse: () => playWav('uno/reverse.mp3'),
    draw2: () => playWav('uno/draw2.mp3'),
    wild4: () => { soundUnoWild4(); playWav('uno/draw4.mp3'); },
    win: () => playWav('win.mp3'),
    lose: () => playWav('lose.mp3'),
  },
  'chinese-chess': {
  move: () => { soundChessMove(); playWav('chinese-chess/move.mp3'); },
  capture: () => { soundChessCapture(); playWav('chinese-chess/capture.mp3'); },
  check: () => { soundChessCheck(); playWav('chinese-chess/check.mp3'); },
  checkmate: () => playWav('chinese-chess/checkmate.mp3'),
  draw_request: () => playWav('chinese-chess/draw_request.mp3'),
  draw_agreed: () => playWav('chinese-chess/draw_agreed.mp3'),
  resign: () => playWav('lose.mp3'),
  win: () => playWav('win.mp3'),
  lose: () => playWav('lose.mp3'),
  },
  'turtle-soup': {
    ask: soundSoupAsk,
    answer_yes: () => { soundSoupYes(); playWav('turtle-soup/yes.mp3'); },
    answer_no: () => { soundSoupNo(); playWav('turtle-soup/no.mp3'); },
    answer_irrelevant: () => playWav('turtle-soup/irrelevant.mp3'),
    answer_uncertain: () => playWav('turtle-soup/uncertain.mp3'),
    correct: soundSoupCorrect,
    win: soundWin,
  },
};

/**
 * 播放指定游戏的指定音效
 */
export function playSound(gameId, eventName) {
  const gameSounds = SOUND_MAP[gameId];
  if (!gameSounds) return;
  const fn = gameSounds[eventName];
  if (fn) fn();
}

/** 音色配置 */
export const VOICE_OPTIONS = [
  { id: 'xiaoxiao', label: '甜妹', icon: '🎀' },
  { id: 'xiaoyi', label: '御姐', icon: '💋' },
  { id: 'yunxi', label: '阳光男孩', icon: '☀️' },
  { id: 'yunyang', label: '稳重男音', icon: '🎵' },
];

export function getVoice() {
  return localStorage.getItem('voice') || 'xiaoxiao';
}

export function setVoice(voiceId) {
  localStorage.setItem('voice', voiceId);
  // 清除音频缓存，让新音色生效
  Object.keys(_audioCache).forEach(k => delete _audioCache[k]);
}

/** 播放 public/sfx/ 目录下的 MP3 文件
 *  支持音色切换：优先加载 voice/{voice}/{filename}，回退到原始路径
 */
const _audioCache = {};
async function playWav(filename) {
  try {
    const ctx = getCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const doPlay = (buffer) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = masterVolume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    };
    if (_audioCache[filename]) {
      doPlay(_audioCache[filename]);
      return;
    }
    // 优先从音色目录加载
    const voice = getVoice();
    let resp = await fetch(`/sfx/voice/${voice}/${filename}`);
    if (!resp.ok) {
      resp = await fetch(`/sfx/${filename}`);
    }
    if (!resp.ok) {
      console.warn(`[sounds] sfx fetch failed: ${filename} → ${resp.status}`);
      return;
    }
    const buf = await resp.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf);
    _audioCache[filename] = decoded;
    doPlay(decoded);
  } catch (e) {
    console.warn('[sounds] playWav error:', filename, e);
  }
}

// 麻将 TTS 语音
SOUND_MAP['mahjong'] = {
  pung: () => playWav('mahjong/pung.mp3'),
  kong: () => playWav('mahjong/kong.mp3'),
  chow: () => playWav('mahjong/chow.mp3'),
  win: () => playWav('mahjong/win.mp3'),
  zimo: () => playWav('mahjong/zimo.mp3'),
  discard: () => playWav('mahjong/discard.mp3'),
  draw: () => playWav('mahjong/draw.mp3'),
};

// 五子棋 TTS 语音
SOUND_MAP['gomoku'] = {
  place: () => playWav('gomoku/place.mp3'),
  win: () => playWav('win.mp3'),
  lose: () => playWav('lose.mp3'),
};

// 互动语音（所有游戏通用）
export const EMOTE_LIST = [
  { id: 'impatient', label: '我等的花都谢了', icon: '🥀' },
  { id: 'encourage', label: '没事，你已经很棒了', icon: '💪' },
  { id: 'taunt', label: '就这，再来', icon: '😏' },
  { id: 'praise', label: '厉害厉害，佩服佩服', icon: '👏' },
  { id: 'lag', label: '网络卡了吗，快点呀', icon: '⏳' },
  { id: 'laugh', label: '哈哈哈', icon: '😂' },
  { id: 'cry', label: '呜呜呜', icon: '😭' },
  { id: 'think', label: '让我想想', icon: '🤔' },
  { id: 'lucky', label: '今天运气真好', icon: '🍀' },
  { id: 'unlucky', label: '手气太差了', icon: '💀' },
  { id: 'gg', label: '好棋好棋', icon: '🏆' },
  { id: 'hurry', label: '快点快点', icon: '💨' },
];

SOUND_MAP['common'] = {
  game_start: () => playWav('common/game_start.mp3'),
  win: () => playWav('common/win.mp3'),
  lose: () => playWav('common/lose.mp3'),
  landlord_decided: () => playWav('common/landlord_decided.mp3'),
  logout_confirm: () => playWav('common/logout_confirm.mp3'),
};

SOUND_MAP['emote'] = {};
EMOTE_LIST.forEach(e => {
  SOUND_MAP['emote'][e.id] = () => playWav(`emotes/${e.id}.mp3`);
});

export function playEmote(emoteId) {
  const gameSounds = SOUND_MAP['emote'];
  const fn = gameSounds?.[emoteId];
  if (fn) fn();
}
