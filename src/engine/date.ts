import type { GameDate } from './types';

export function monthIndex(d: GameDate): number {
  return (d.year - 1) * 12 + (d.month - 1);
}

export function fromIndex(i: number): GameDate {
  return { year: Math.floor(i / 12) + 1, month: (i % 12) + 1 };
}

export function nextMonth(d: GameDate): GameDate {
  return fromIndex(monthIndex(d) + 1);
}

export function formatDate(d: GameDate): string {
  return `第 ${d.year} 年 ${d.month} 月`;
}

export function formatAge(ageMonths: number): string {
  return `${Math.floor(ageMonths / 12)} 歲`;
}
