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

export function setVolume(v) { masterVolume = Math.max(0, Math.min(1, v)); }
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
  doudizhu: {
    play_card: soundCardPlay,
    pass: soundPass,
    bid: soundBid,
    bomb: soundBomb,
    rocket: soundRocket,
    win: soundWin,
    lose: soundLose,
    timer_warn: soundTimerWarn,
    alert: soundTimerWarn,
  },
  uno: {
    play_card: soundUnoPlay,
    draw_card: soundUnoDraw,
    uno: soundUnoCall,
    wild4: soundUnoWild4,
    win: soundWin,
    lose: soundLose,
  },
  'chinese-chess': {
    move: soundChessMove,
    capture: soundChessCapture,
    check: soundChessCheck,
    win: soundWin,
    lose: soundLose,
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
