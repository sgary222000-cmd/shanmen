// 遊戲引擎對外介面。引擎不依賴 React，也不使用 Math.random 或系統時間。
export * from './types';
export { applyCommand, type Command, type CommandResult } from './commands/commands';
export { newGame, STATE_VERSION, type NewGameOptions } from './state/newGame';
export { planMonth, monthsUntilEmpty, type MonthPlan } from './systems/economy/flows';
export { computeAlerts, type Alert } from './systems/alerts';
export { advanceBlockers } from './systems/time/advanceMonth';
export { monthIndex, formatDate, formatAge } from './date';
