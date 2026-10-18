import type { ContentPack } from '../../../content/registry';
import { COMMON_EQUIPMENT } from '../../../content/equipment';
import { ensure } from '../../errors';
import type { Character, GameState } from '../../types';
import { findCharacter } from '../characters/characters';

// 法器裝備（企畫書 §11）：每人一個裝備欄。制式法器取自庫存「法器」，獨特法器放在庫房（armory）。

/** 卸下目前的法器，放回庫存或庫房。 */
function unequip(state: GameState, c: Character): void {
  if (!c.equipment) return;
  if (c.equipment === COMMON_EQUIPMENT) state.resources.artifact += 1;
  else state.armory.push(c.equipment);
  c.equipment = null;
}

export function equipItem(state: GameState, content: ContentPack, characterId: string, itemId: string | null): string {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  ensure(!(state.exploration?.status === 'active' && state.exploration.teamIds.includes(c.id)), '探索途中不能更換法器');
  if (itemId === c.equipment) return `${c.name}已裝備這件法器。`;
  if (itemId === null) {
    ensure(c.equipment, `${c.name}沒有裝備法器`);
    unequip(state, c);
    return `${c.name}卸下法器。`;
  }
  const def = content.equipment.get(itemId);
  ensure(def, '沒有這件法器');
  if (itemId === COMMON_EQUIPMENT) ensure(state.resources.artifact >= 1, '庫存沒有法器（由煉器坊製作或坊市購買）');
  else ensure(state.armory.includes(itemId), `庫房裡沒有${def.name}`);
  unequip(state, c);
  if (itemId === COMMON_EQUIPMENT) state.resources.artifact -= 1;
  else state.armory.splice(state.armory.indexOf(itemId), 1);
  c.equipment = itemId;
  return `${c.name}裝備${def.name}（攻擊 +${def.atk}、防禦 +${def.def}、生命 +${def.hp}）。`;
}
