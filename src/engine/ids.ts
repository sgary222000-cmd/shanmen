import type { GameState } from './types';

export function newId(state: GameState, prefix: string): string {
  const id = `${prefix}${state.nextId}`;
  state.nextId += 1;
  return id;
}
