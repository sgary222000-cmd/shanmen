import { RESOURCE_IDS, RESOURCE_NAMES } from '../../engine/resources';
import type { Resources } from '../../engine';

export function ResList({ value, signed }: { value: Partial<Resources>; signed?: boolean }) {
  const ids = RESOURCE_IDS.filter((id) => value[id]);
  if (!ids.length) return <span className="muted">無</span>;
  return (
    <span>
      {ids.map((id, i) => {
        const v = value[id] ?? 0;
        return (
          <span key={id} className={signed ? (v > 0 ? 'pos' : 'neg') : ''}>
            {i > 0 && '、'}
            {RESOURCE_NAMES[id]} {signed && v > 0 ? '+' : ''}
            {v}
          </span>
        );
      })}
    </span>
  );
}
