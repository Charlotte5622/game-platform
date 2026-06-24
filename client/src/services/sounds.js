/**
 * 游戏音效系统
 *
 * 使用 Web Audio API 程序化生成音效，无需外部音频文件
 * 支持：斗地主、UNO、象棋、海龟汤
 */

let audioCtx = null;

function getCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // 恢复被浏览器挂起的上下文（手机端切后台回来）
  if (audioCtx.state === 'suspended') audioCtx.resume();
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
}

/**
 * 噪音（用于爆炸等效果）
 */
function playNoise(duration, vol = 0.3) {
  const ctx = getCtx();
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
    win: () => { soundWin(); playWav('win.mp3'); },
    lose: () => { soundLose(); playWav('lose.mp3'); },
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
    win: () => { soundWin(); playWav('win.mp3'); },
    lose: () => { soundLose(); playWav('lose.mp3'); },
  },
  'chinese-chess': {
    move: () => { soundChessMove(); playWav('chinese-chess/move.mp3'); },
    capture: () => { soundChessCapture(); playWav('chinese-chess/capture.mp3'); },
    check: () => { soundChessCheck(); playWav('chinese-chess/check.mp3'); },
    checkmate: () => playWav('chinese-chess/checkmate.mp3'),
    win: () => { soundWin(); playWav('win.mp3'); },
    lose: () => { soundLose(); playWav('lose.mp3'); },
  },
  'turtle-soup': {
    ask: soundSoupAsk,
    answer_yes: soundSoupYes,
    answer_no: soundSoupNo,
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

/**
 * 播放 public/sfx/ 目录下的 MP3 文件
 * 用于 Edge TTS 生成的中文语音
 */
const _audioCache = {};
function playWav(filename) {
  try {
    const ctx = getCtx();
    if (_audioCache[filename]) {
      const src = ctx.createBufferSource();
      src.buffer = _audioCache[filename];
      const gain = ctx.createGain();
      gain.gain.value = masterVolume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      return;
    }
    fetch(`/sfx/${filename}`)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => {
        _audioCache[filename] = decoded;
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        const gain = ctx.createGain();
        gain.gain.value = masterVolume;
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start();
      })
      .catch(() => {});
  } catch {}
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
  win: () => { soundWin(); playWav('win.mp3'); },
  lose: () => { soundLose(); playWav('lose.mp3'); },
};
