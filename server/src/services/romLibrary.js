const fs = require('fs');
const path = require('path');

const EMULATOR_DIR = path.join(__dirname, '../../../external-games/emulator');
const ROMS_JSON_PATH = path.join(EMULATOR_DIR, 'roms.json');
const ROMS_DIR = path.join(EMULATOR_DIR, 'roms');

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function isSafeRomFile(fileName) {
  return (
    typeof fileName === 'string' &&
    fileName.length > 0 &&
    fileName === path.basename(fileName) &&
    /\.nes$/i.test(fileName)
  );
}

function normalizeCoverPath(cover) {
  if (typeof cover !== 'string' || !cover) {
    return '';
  }

  if (/^\/games\/emulator\/covers\/[a-zA-Z0-9._-]+\.svg$/i.test(cover)) {
    return cover;
  }

  if (/^[a-zA-Z0-9._-]+\.svg$/i.test(cover)) {
    return `/games/emulator/covers/${cover}`;
  }

  return '';
}

function normalizeRom(raw, index) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const file = raw.file || raw.path;
  if (!isSafeRomFile(file)) {
    return null;
  }

  const id = String(raw.id || path.basename(file, path.extname(file))).trim();
  const name = String(raw.name || id).trim();
  const filePath = path.join(ROMS_DIR, file);
  const fileExists = fs.existsSync(filePath);
  const cover = normalizeCoverPath(raw.cover);

  return {
    id,
    name,
    platform: raw.platform || 'nes',
    core: raw.core || 'nes',
    file,
    url: `/games/emulator/roms/${encodeURIComponent(file)}`,
    players: Number(raw.players) || 1,
    genre: raw.genre || '经典',
    difficulty: raw.difficulty || '普通',
    description: raw.description || '',
    cover,
    coverAlt: raw.coverAlt || (cover ? `${name} 游戏封面` : ''),
    tags: Array.isArray(raw.tags) ? raw.tags.filter(Boolean).slice(0, 6) : [],
    controls: Array.isArray(raw.controls) ? raw.controls.filter(Boolean).slice(0, 8) : [],
    license: raw.license || '',
    sourceUrl: raw.sourceUrl || raw.source || '',
    releaseUrl: raw.releaseUrl || '',
    sort: Number.isFinite(raw.sort) ? raw.sort : index,
    available: fileExists,
    size: fileExists ? fs.statSync(filePath).size : 0,
  };
}

function listEmulatorRoms() {
  const data = safeReadJson(ROMS_JSON_PATH) || { roms: [] };
  const roms = (Array.isArray(data.roms) ? data.roms : [])
    .map(normalizeRom)
    .filter(Boolean)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'zh-CN'));

  return {
    roms,
    meta: {
      total: roms.length,
      available: roms.filter((rom) => rom.available).length,
      platform: 'nes',
      updatedAt: data.updatedAt || null,
    },
  };
}

function listRomsForExternalGame(gameId) {
  if (gameId !== 'emulator') {
    return null;
  }
  return listEmulatorRoms();
}

module.exports = {
  listEmulatorRoms,
  listRomsForExternalGame,
};
