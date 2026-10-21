import type { ContentPack } from '../../../content/registry';
import { balance } from '../../../content/balance';
import { COMMON_EQUIPMENT } from '../../../content/equipment';
import { ensure } from '../../errors';
import type { Character, GameState, GearSlot, ResourceId } from '../../types';
import { RESOURCE_NAMES } from '../../resources';
import { findCharacter } from '../characters/characters';
import { GEAR_SLOTS, gearDesc, gearName, newGear, SLOT_NAMES } from './gear';

// 法器裝備（企畫書 §11）：每人三格（兵器、護具、飾品，0.11.0）。法器放在庫房（armory），每件有品質；
// 庫存「法器」是未鑑定的制式兵器，裝備時變成一件凡品制式法器。

/** 卸下某一格，放回庫房。 */
export function unequipSlot(state: GameState, c: Character, slot: GearSlot): void {
  const it = c.gear?.[slot];
  if (!it) return;
  state.armory.push(it);
  delete c.gear[slot];
}

/** 人物離開宗門（坐化、叛離）時，三格法器都收回庫房。 */
export function returnAllGear(state: GameState, c: Character): void {
  for (const slot of GEAR_SLOTS) unequipSlot(state, c, slot);
}

/**
 * 裝備法器。itemId 可以是庫房裡那件的 ID、法器種類 ID（取庫房第一件），或制式法器（取自庫存）；
 * null 表示卸下 slot 那一格。
 */
export function equipItem(state: GameState, content: ContentPack, characterId: string, itemId: string | null, slot?: GearSlot): string {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  ensure(!(state.exploration?.status === 'active' && state.exploration.teamIds.includes(c.id)), '探索途中不能更換法器');
  c.gear ??= {};
  if (itemId === null) {
    const s = slot ?? GEAR_SLOTS.find((x) => c.gear[x]);
    ensure(s && c.gear[s], `${c.name}沒有裝備${s ? SLOT_NAMES[s] : '法器'}`);
    const name = gearName(content, c.gear[s]);
    unequipSlot(state, c, s);
    return `${c.name}卸下${name}。`;
  }
  let idx = state.armory.findIndex((x) => x.id === itemId);
  if (idx < 0) idx = state.armory.findIndex((x) => x.defId === itemId);
  let item = idx >= 0 ? state.armory[idx] : undefined;
  if (!item) {
    ensure(itemId === COMMON_EQUIPMENT, '庫房裡沒有這件法器');
    ensure(state.resources.artifact >= 1, '庫存沒有法器（由煉器坊製作或坊市購買）');
    state.resources.artifact -= 1;
    item = newGear(state, COMMON_EQUIPMENT, 'common');
  } else state.armory.splice(idx, 1);
  const def = content.equipment.get(item.defId);
  ensure(def, '沒有這件法器');
  unequipSlot(state, c, def.slot);
  c.gear[def.slot] = item;
  return `${c.name}裝備${gearName(content, item)}（${gearDesc(content, item)}）。`;
}

/** 服用永久屬性丹：每人每種最多 permMax 顆。 */
export function takePermPill(state: GameState, characterId: string, pill: ResourceId): string {
  const c = findCharacter(state, characterId);
  ensure(c, '找不到這個人物');
  const bonus = balance.attributes.permPills[pill];
  ensure(bonus, '這不是永久屬性丹');
  const taken = c.permPills?.[pill] ?? 0;
  ensure(taken < balance.attributes.permMax, `${c.name}已服滿 ${balance.attributes.permMax} 顆${RESOURCE_NAMES[pill]}`);
  ensure(state.resources[pill] >= 1, `庫存沒有${RESOURCE_NAMES[pill]}`);
  state.resources[pill] -= 1;
  c.permPills = { ...(c.permPills ?? {}), [pill]: taken + 1 };
  const what = bonus.agi ? `敏捷 +${bonus.agi}` : bonus.critPct ? `暴擊 +${bonus.critPct}%` : `閃避 +${bonus.dodgePct ?? 0}%`;
  return `${c.name}服下${RESOURCE_NAMES[pill]}，${what}（已服 ${taken + 1}/${balance.attributes.permMax}）。`;
}
