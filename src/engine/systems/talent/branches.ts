import { balance } from '../../../content/balance';
import type { ContentPack } from '../../../content/registry';
import { ensure } from '../../errors';
import type { GameState } from '../../types';
import { effectsOf, hasLineage, isOperating, LIBRARY } from '../buildings/buildings';
import { marketOpen } from '../economy/market';
import { ANY_SCRIPTURE, ITEM_NAMES, scriptureItem } from './items';


// 傳承分支（企畫書 §10）：藏經閣 2 級 ＋ 該傳承典籍 ＋ 技藝達標的內門主持人。
// 取得該傳承的專屬建築與基礎配方，但沒有主傳承的特色加成。

export function branchBlocked(state: GameState, content: ContentPack, lineageId: string, hostId: string | null): string | undefined {
  const lineage = content.lineages.get(lineageId);
  if (!lineage) return '沒有這個傳承';
  if (hasLineage(state, lineageId)) return `已經擁有${lineage.name}傳承`;
  const lib = state.buildings.find((b) => b.defId === LIBRARY && isOperating(b));
  if (!lib || !effectsOf(content, lib)?.allowBranches) return '需要藏經閣 2 級';
  if (!state.items.includes(scriptureItem(lineageId)) && !state.items.includes(ANY_SCRIPTURE))
    return `需要${ITEM_NAMES[scriptureItem(lineageId)] ?? '典籍'}（坊市購買或秘境取得）`;
  if (!hostId) return '需要一名內門弟子主持';
  const host = state.disciples.find((d) => d.id === hostId);
  if (!host) return '主持人必須是內門弟子';
  if (state.branches.some((b) => b.hostId === hostId)) return `${host.name}已主持其他分支`;
  const need = balance.branch.skillRequired;
  if (host.skills[lineage.branchSkill] < need) return `主持人的相應技藝需達 ${need}（${host.name}目前 ${host.skills[lineage.branchSkill]}）`;
  return undefined;
}

export function openBranch(state: GameState, content: ContentPack, lineageId: string, hostId: string): string {
  const blocked = branchBlocked(state, content, lineageId, hostId);
  ensure(!blocked, blocked ?? '');
  const lineage = content.lineages.get(lineageId);
  ensure(lineage, '沒有這個傳承');
  if (!state.items.includes(scriptureItem(lineageId))) state.items = state.items.filter((i) => i !== ANY_SCRIPTURE);
  state.branches.push({ lineageId, hostId });
  const learned = lineage.start.recipes.filter((r) => !state.recipes.includes(r));
  state.recipes.push(...learned);
  const host = state.disciples.find((d) => d.id === hostId);
  const recipes = learned.map((r) => content.recipes.get(r)?.name ?? r);
  return `開設${lineage.name}分支，由${host?.name ?? ''}主持。${recipes.length ? `習得配方：${recipes.join('、')}。` : ''}可建造${lineage.name}專屬建築。`;
}

export function scriptureBlocked(state: GameState, content: ContentPack, lineageId: string): string | undefined {
  const B = balance.branch;
  if (!content.lineages.has(lineageId)) return '沒有這個傳承';
  if (lineageId === state.lineage) return '這是本宗主傳承';
  if (state.items.includes(scriptureItem(lineageId))) return '已經有這部典籍';
  if (!marketOpen(state, content)) return '尚未建成坊市（山門區）';
  if (state.reputation < B.scriptureReputation) return `聲望需達 ${B.scriptureReputation} 才有人願意出售典籍`;
  if (state.resources.lingshi < B.scripturePrice) return `靈石不足（需要 ${B.scripturePrice}）`;
  return undefined;
}

export function buyScripture(state: GameState, content: ContentPack, lineageId: string): string {
  const blocked = scriptureBlocked(state, content, lineageId);
  ensure(!blocked, blocked ?? '');
  state.resources.lingshi -= balance.branch.scripturePrice;
  state.items.push(scriptureItem(lineageId));
  return `以靈石 ${balance.branch.scripturePrice} 購得${ITEM_NAMES[scriptureItem(lineageId)] ?? '典籍'}。`;
}

