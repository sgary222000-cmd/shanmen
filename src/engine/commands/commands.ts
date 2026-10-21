import type { ContentPack } from '../../content/registry';
import { RuleError } from '../errors';
import type { AutoAssign, BeastTask, GameState, MonthReport, OuterDisciples, PositionId, ResourceId, Row, ScheduleKind, Station, TreatyKind } from '../types';
import { breakTreaty, resolveAid, signTreaty, type AidChoice } from '../systems/world/diplomacy';
import { contestSite, declareWar, evacuate, makePeace, repairBuilding, resolveVictory, setWarTeam, type VictoryChoice } from '../systems/world/war';
import { setPosition } from '../systems/talent/positions';
import { equipItem } from '../systems/talent/equipment';
import { buyScripture, openBranch } from '../systems/talent/branches';
import { ascendGuardian, hatchBeast, raiseGuardian, setBeast } from '../systems/beasts/beasts';
import { startDispatch } from '../systems/exploration/dispatch';
import { runTrial } from '../systems/exploration/trial';
import { setAuto, type AutoKind } from '../systems/exploration/autoAssign';
import { giftSect, sectTrade } from '../systems/world/sects';
import { enterTournament } from '../systems/world/tournament';
import { bidAuction } from '../systems/world/auction';
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
import { resolveSuccession, setHeir, takeLongevityPill } from '../systems/characters/lifespan';
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
  | { type: 'setAutoBreakthrough'; value: boolean }
  | { type: 'setAuto'; kind: AutoKind; config: AutoAssign[AutoKind] | null }
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
  | { type: 'signTreaty'; sectId: string; kind: TreatyKind }
  | { type: 'breakTreaty'; sectId: string }
  | { type: 'resolveAid'; eventId: string; choice: AidChoice }
  | { type: 'contestSite'; siteId: string }
  | { type: 'declareWar'; sectId: string }
  | { type: 'makePeace'; warId: string }
  | { type: 'evacuate'; warId: string }
  | { type: 'setWarTeam'; warId: string; teamIds: string[] }
  | { type: 'resolveVictory'; eventId: string; choice: VictoryChoice }
  | { type: 'repairBuilding'; buildingId: string }
  | { type: 'runTrial'; teamIds: string[]; tier: string }
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
  | { type: 'setPosition'; position: PositionId; characterId: string | null }
  | { type: 'equip'; characterId: string; itemId: string | null }
  | { type: 'openBranch'; lineageId: string; hostId: string }
  | { type: 'buyScripture'; lineageId: string }
  | { type: 'hatchBeast' }
  | { type: 'setBeast'; beastId: string; ownerId: string | null; task: BeastTask }
  | { type: 'ascendGuardian'; beastId: string }
  | { type: 'raiseGuardian' }
  | { type: 'dispatch'; realmId: string; teamIds: string[] }
  | { type: 'giftSect'; sectId: string; lingshi: number }
  | { type: 'sectTrade'; sectId: string; lots: number }
  | { type: 'enterTournament'; teamIds: string[] }
  | { type: 'bidAuction'; amount: number }
  | { type: 'setHeir'; characterId: string | null }
  | { type: 'takeLongevityPill'; characterId: string }
  | { type: 'resolveSuccession'; eventId: string; characterId: string }
  | { type: 'markLedgerViewed' }
  | { type: 'skipTutorial' }
  | { type: 'advanceMonth'; expectMonth: number };

export type CommandResult =
  | { ok: true; state: GameState; message?: string; report?: MonthReport }
  | { ok: false; error: string };

/** 執行指令。永遠不修改傳入的 state；失敗時回傳錯誤訊息。 */
const LOGGED_COMMANDS = new Set<Command['type']>([
  'sell',
  'buyFood',
  'marketBuy',
  'marketSell',
  'buyRecipe',
  'acceptCommission',
  'buyScripture',
  'dispatch',
  'giftSect',
  'sectTrade',
  'enterTournament',
  'promoteOuter',
  'takeLongevityPill',
  'signTreaty',
  'breakTreaty',
  'resolveAid',
  'contestSite',
  'declareWar',
  'makePeace',
  'evacuate',
  'resolveVictory',
  'repairBuilding',
  'runTrial',
]);

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
      case 'setAuto':
        message = setAuto(next, content, cmd.kind, cmd.config);
        break;
      case 'setAutoBreakthrough':
        next.autoBreakthrough = cmd.value;
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
      case 'signTreaty':
        message = signTreaty(next, content, cmd.sectId, cmd.kind);
        break;
      case 'breakTreaty':
        message = breakTreaty(next, content, cmd.sectId);
        break;
      case 'resolveAid':
        message = resolveAid(next, content, cmd.eventId, cmd.choice);
        break;
      case 'contestSite':
        message = contestSite(next, content, cmd.siteId);
        break;
      case 'declareWar':
        message = declareWar(next, content, cmd.sectId);
        break;
      case 'makePeace':
        message = makePeace(next, content, cmd.warId);
        break;
      case 'evacuate':
        message = evacuate(next, cmd.warId);
        break;
      case 'setWarTeam':
        message = setWarTeam(next, cmd.warId, cmd.teamIds);
        break;
      case 'resolveVictory':
        message = resolveVictory(next, content, cmd.eventId, cmd.choice);
        break;
      case 'repairBuilding':
        message = repairBuilding(next, content, cmd.buildingId);
        break;
      case 'runTrial':
        message = runTrial(next, content, cmd.teamIds, cmd.tier);
        break;
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
      case 'setPosition':
        message = setPosition(next, cmd.position, cmd.characterId);
        break;
      case 'equip':
        message = equipItem(next, content, cmd.characterId, cmd.itemId);
        break;
      case 'openBranch':
        message = openBranch(next, content, cmd.lineageId, cmd.hostId);
        break;
      case 'buyScripture':
        message = buyScripture(next, content, cmd.lineageId);
        break;
      case 'hatchBeast':
        message = hatchBeast(next, content);
        break;
      case 'setBeast':
        message = setBeast(next, cmd.beastId, cmd.ownerId, cmd.task);
        break;
      case 'ascendGuardian':
        message = ascendGuardian(next, content, cmd.beastId);
        break;
      case 'raiseGuardian':
        message = raiseGuardian(next, content);
        break;
      case 'dispatch':
        message = startDispatch(next, content, cmd.realmId, cmd.teamIds);
        break;
      case 'giftSect':
        message = giftSect(next, content, cmd.sectId, cmd.lingshi);
        break;
      case 'sectTrade':
        message = sectTrade(next, content, cmd.sectId, cmd.lots);
        break;
      case 'enterTournament':
        message = enterTournament(next, content, cmd.teamIds);
        break;
      case 'bidAuction':
        message = bidAuction(next, cmd.amount);
        break;
      case 'setHeir':
        message = setHeir(next, cmd.characterId);
        break;
      case 'takeLongevityPill':
        message = takeLongevityPill(next, cmd.characterId);
        break;
      case 'resolveSuccession':
        message = resolveSuccession(next, cmd.eventId, cmd.characterId);
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
    // 月中有收支或結果的指令，記進本月事務，月底寫進月報
    if (message && LOGGED_COMMANDS.has(cmd.type)) (next.monthLog ??= []).push(message);
    next.stats.commands += 1;
    updateTutorial(next);
    return { ok: true, state: next, ...(message ? { message } : {}), ...(report ? { report } : {}) };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    throw e;
  }
}
