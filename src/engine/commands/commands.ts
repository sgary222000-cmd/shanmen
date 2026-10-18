import type { ContentPack } from '../../content/registry';
import { RuleError } from '../errors';
import type { GameState, MonthReport, OuterDisciples, ResourceId, Row, ScheduleKind, Station } from '../types';
import { setFurnace } from '../systems/alchemy/alchemy';
import { cancelConstruction, demolish, FIELD, hallLevel, startConstruction, startUpgrade } from '../systems/buildings/buildings';
import { startOpenRegion } from '../systems/regions/regions';
import { setOuterJobs } from '../systems/characters/outer';
import { interruptSeclusion, setSchedule, setSeat, setTakePill } from '../systems/characters/schedule';
import { promoteOuter, resolveRecruitment } from '../systems/events/recruitment';
import { chooseEvent, closeExploration, moveTo, retreat, startExploration } from '../systems/exploration/exploration';
import { buyFood, sell, type Sellable } from '../systems/economy/trade';
import { buyRecipe, marketBuy, marketSell } from '../systems/economy/market';
import { acceptCommission } from '../systems/commissions/commissions';
import { advanceMonth } from '../systems/time/advanceMonth';
import { updateTutorial } from '../systems/tutorial';
import { ensure } from '../errors';

// 玩家指令。畫面只能透過指令改變世界狀態。

export type Command =
  | { type: 'setOuterJobs'; jobs: Partial<OuterDisciples['jobs']> }
  | { type: 'setCrop'; buildingId: string; crop: 'food' | 'herb' }
  | { type: 'build'; defId: string; regionId: string }
  | { type: 'upgrade'; buildingId: string }
  | { type: 'cancelConstruction'; buildingId: string }
  | { type: 'demolish'; buildingId: string }
  | { type: 'openRegion'; regionId: string }
  | { type: 'setSeat'; characterId: string; regionId: string }
  | { type: 'setSchedule'; characterId: string; schedule: ScheduleKind; months?: number }
  | { type: 'interruptSeclusion' }
  | { type: 'setTakePill'; characterId: string; value: boolean }
  | {
      type: 'setFurnace';
      /** 未填為煉丹房 */
      station?: Station;
      index: number;
      alchemistId: string | null;
      recipeId: string | null;
      repeat: boolean;
      /** 庫存保留量；未填表示不變 */
      keep?: number;
    }
  | { type: 'promoteOuter' }
  | { type: 'resolveRecruitment'; eventId: string; candidateId: string | null }
  | { type: 'dismissEvent'; eventId: string }
  | { type: 'startExploration'; realmId: string; teamIds: string[]; rows: Record<string, Row> }
  | { type: 'exploreMove'; nodeId: string }
  | { type: 'exploreChoice'; choiceId: string }
  | { type: 'exploreRetreat' }
  | { type: 'exploreClose' }
  | { type: 'sell'; resource: Sellable; amount: number }
  | { type: 'buyFood'; lingshi: number }
  | { type: 'marketBuy'; resource: ResourceId; lots: number }
  | { type: 'marketSell'; resource: ResourceId; lots: number }
  | { type: 'buyRecipe'; recipeId: string }
  | { type: 'acceptCommission'; commissionId: string; workers?: number; teamIds?: string[]; rows?: Record<string, Row> }
  | { type: 'setStrategy'; useHealPill: boolean; focusLowest: boolean; useTalismans?: boolean }
  | { type: 'markLedgerViewed' }
  | { type: 'skipTutorial' }
  | { type: 'advanceMonth'; expectMonth: number };

export type CommandResult =
  | { ok: true; state: GameState; message?: string; report?: MonthReport }
  | { ok: false; error: string };

/** 執行指令。永遠不修改傳入的 state；失敗時回傳錯誤訊息。 */
export function applyCommand(state: GameState, content: ContentPack, cmd: Command): CommandResult {
  const next = structuredClone(state);
  try {
    let message: string | undefined;
    let report: MonthReport | undefined;
    switch (cmd.type) {
      case 'setOuterJobs':
        setOuterJobs(next, content, cmd.jobs);
        break;
      case 'setCrop': {
        const b = next.buildings.find((x) => x.id === cmd.buildingId);
        ensure(b && b.defId === FIELD, '只有靈田能切換作物');
        b.crop = cmd.crop;
        break;
      }
      case 'build':
        startConstruction(next, content, cmd.defId, cmd.regionId);
        break;
      case 'upgrade':
        startUpgrade(next, content, cmd.buildingId);
        break;
      case 'cancelConstruction':
        cancelConstruction(next, cmd.buildingId);
        break;
      case 'demolish':
        message = demolish(next, content, cmd.buildingId);
        break;
      case 'openRegion':
        startOpenRegion(next, content, cmd.regionId, hallLevel(next));
        break;
      case 'setSeat':
        setSeat(next, content, cmd.characterId, cmd.regionId);
        break;
      case 'setSchedule':
        setSchedule(next, content, cmd.characterId, cmd.schedule, cmd.months);
        break;
      case 'interruptSeclusion':
        message = interruptSeclusion(next);
        break;
      case 'setTakePill':
        setTakePill(next, cmd.characterId, cmd.value);
        break;
      case 'setFurnace':
        setFurnace(next, content, cmd.index, cmd.alchemistId, cmd.recipeId, cmd.repeat, cmd.station ?? 'alchemy', cmd.keep);
        break;
      case 'promoteOuter':
        message = promoteOuter(next, content);
        break;
      case 'resolveRecruitment':
        resolveRecruitment(next, content, cmd.eventId, cmd.candidateId);
        break;
      case 'dismissEvent': {
        const ev = next.events.find((e) => e.id === cmd.eventId);
        ensure(ev, '沒有這個事件');
        ensure(ev.kind === 'notice', '這個事件需要做出選擇');
        next.events = next.events.filter((e) => e.id !== cmd.eventId);
        break;
      }
      case 'startExploration':
        startExploration(next, content, cmd.realmId, cmd.teamIds, cmd.rows);
        break;
      case 'exploreMove':
        moveTo(next, content, cmd.nodeId);
        break;
      case 'exploreChoice':
        chooseEvent(next, content, cmd.choiceId);
        break;
      case 'exploreRetreat':
        retreat(next, content);
        break;
      case 'exploreClose':
        closeExploration(next);
        break;
      case 'sell':
        message = sell(next, content, cmd.resource, cmd.amount);
        break;
      case 'buyFood':
        message = buyFood(next, cmd.lingshi);
        break;
      case 'marketBuy':
        message = marketBuy(next, content, cmd.resource, cmd.lots);
        break;
      case 'marketSell':
        message = marketSell(next, content, cmd.resource, cmd.lots);
        break;
      case 'buyRecipe':
        message = buyRecipe(next, content, cmd.recipeId);
        break;
      case 'acceptCommission': {
        const opts: Parameters<typeof acceptCommission>[3] = {};
        if (cmd.workers !== undefined) opts.workers = cmd.workers;
        if (cmd.teamIds) opts.teamIds = cmd.teamIds;
        if (cmd.rows) opts.rows = cmd.rows;
        message = acceptCommission(next, content, cmd.commissionId, opts);
        break;
      }
      case 'setStrategy':
        next.strategy = {
          useHealPill: cmd.useHealPill,
          useTalismans: cmd.useTalismans ?? next.strategy.useTalismans,
          focusLowest: cmd.focusLowest,
        };
        break;
      case 'markLedgerViewed':
        next.tutorial.viewedLedger = true;
        break;
      case 'skipTutorial':
        next.tutorial.skipped = true;
        break;
      case 'advanceMonth':
        report = advanceMonth(next, content, cmd.expectMonth);
        break;
      default: {
        const never: never = cmd;
        throw new RuleError(`未知的指令：${JSON.stringify(never)}`);
      }
    }
    next.stats.commands += 1;
    updateTutorial(next);
    return { ok: true, state: next, ...(message ? { message } : {}), ...(report ? { report } : {}) };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
