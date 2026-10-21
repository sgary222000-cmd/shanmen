import type { TechniqueDef } from '../schema';

// 四傳承的主修功法（企畫書 §5「大突破需要功法領悟」）。20 層的領悟度門檻與每層屬性在 balance.technique。

export const techniques: TechniqueDef[] = [
  {
    id: 'technique.sword',
    name: '青冥劍經',
    lineage: 'lineage.sword',
    description: '以劍養氣、以氣御劍。領悟越深，劍氣越凌厲。',
    tierText: ['初窺劍意', '劍氣成形', '人劍合一', '劍心通明', '萬劍歸宗'],
  },
  {
    id: 'technique.alchemy',
    name: '丹鼎長生訣',
    lineage: 'lineage.alchemy',
    description: '以身為爐、以氣為火，修煉與煉丹互為表裡。',
    tierText: ['爐火初生', '丹火內蘊', '鼎成九轉', '金身不壞', '長生久視'],
  },
  {
    id: 'technique.beast',
    name: '萬靈御獸訣',
    lineage: 'lineage.beast',
    description: '通曉萬靈之語，人獸心意相通。',
    tierText: ['靈犀初通', '心意相連', '萬靈俯首', '身化百獸', '天地同息'],
  },
  {
    id: 'technique.talisman',
    name: '太乙符籙真解',
    lineage: 'lineage.talisman',
    description: '以神念勾連天地靈紋，符成陣起。',
    tierText: ['識得靈紋', '符隨念動', '陣法天成', '身入陣圖', '言出法隨'],
  },
];
