/**
 * 游戏组件注册表
 *
 * 每个游戏在此注册其 React 组件
 * 新增游戏时只需：
 * 1. 在 games/ 目录下创建游戏
 * 2. 在此文件中 import 并注册
 */

// 导入游戏组件
import DoudizhuGame from '../../../games/doudizhu/client/DoudizhuGame';
import MahjongGame from '../../../games/mahjong/client/MahjongGame';
import ChineseChessGame from '../../../games/chinese-chess/client/ChineseChessGame';
import UnoGame from '../../../games/uno/client/UnoGame';
import TurtleSoupGame from '../../../games/turtle-soup/client/TurtleSoupGame';
import GomokuGame from '../../../games/gomoku/client/GomokuGame';

// 游戏注册表: gameId -> React Component
const gameComponents = {
  'doudizhu': DoudizhuGame,
  'mahjong': MahjongGame,
  'chinese-chess': ChineseChessGame,
  'uno': UnoGame,
  'turtle-soup': TurtleSoupGame,
  'gomoku': GomokuGame,
};

/**
 * 注册游戏组件
 */
export function registerGame(gameId, component) {
  gameComponents[gameId] = component;
}

/**
 * 获取游戏组件
 */
export function getGameComponent(gameId) {
  return gameComponents[gameId] || null;
}

/**
 * 获取所有已注册游戏 ID
 */
export function getRegisteredGameIds() {
  return Object.keys(gameComponents);
}
