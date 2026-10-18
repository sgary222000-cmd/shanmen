import { describe, expect, it } from 'vitest';
import { buildContent, rawContent } from '../../src/content/registry';

describe('內容資料驗證', () => {
  it('正式內容可通過驗證', () => {
    expect(() => buildContent(rawContent)).not.toThrow();
  });

  it('ID 重複會報錯', () => {
    const raw = { ...rawContent, recipes: [...rawContent.recipes, rawContent.recipes[0]] };
    expect(() => buildContent(raw)).toThrow(/ID 重複/);
  });

  it('秘境引用不存在的敵人會報錯', () => {
    const realm = structuredClone(rawContent.secretRealms[0]) as { nodes: { enemies?: string[] }[] };
    const node = realm.nodes.find((n) => n.enemies);
    if (node) node.enemies = ['enemy.not_exist'];
    expect(() => buildContent({ ...rawContent, secretRealms: [realm] })).toThrow(/不存在的敵人/);
  });

  it('秘境節點連到不存在的節點會報錯', () => {
    const realm = structuredClone(rawContent.secretRealms[0]) as { nodes: { next: string[] }[] };
    realm.nodes[0]!.next = ['nowhere'];
    expect(() => buildContent({ ...rawContent, secretRealms: [realm] })).toThrow(/引用不存在/);
  });

  it('格式錯誤（負數費用）會報錯', () => {
    const b = structuredClone(rawContent.buildings[0]) as { levels: { cost: Record<string, number> }[] };
    b.levels[0]!.cost = { stone: -5 };
    expect(() => buildContent({ ...rawContent, buildings: [b, ...rawContent.buildings.slice(1)] })).toThrow();
  });
});
