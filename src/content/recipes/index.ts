import type { RecipeDef } from '../schema';

export const recipes: RecipeDef[] = [
  {
    id: 'recipe.qi_pill',
    name: '聚氣丹',
    description: '服用後當月修為增加。每人每月限服一顆。',
    inputs: { herb: 3, lingshi: 2 },
    outputs: { pill_qi: 2 },
    baseSuccessBp: 7000,
    knownAtStart: true,
  },
  {
    id: 'recipe.heal_pill',
    name: '回春丹',
    description: '戰鬥中可依策略服用回復生命；療傷時服用可縮短傷期。',
    inputs: { herb: 2, lingshi: 1 },
    outputs: { pill_heal: 2 },
    baseSuccessBp: 7500,
    knownAtStart: true,
  },
  {
    id: 'recipe.foundation_pill',
    name: '築基丹',
    description: '煉氣圓滿突破築基所需。丹方需從秘境取得。',
    inputs: { herb: 10, lingshi: 30 },
    outputs: { pill_foundation: 1 },
    baseSuccessBp: 4000,
    knownAtStart: false,
  },
];
