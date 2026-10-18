/** 玩家操作不合法時丟出；訊息直接顯示給玩家。 */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

export function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new RuleError(message);
}
