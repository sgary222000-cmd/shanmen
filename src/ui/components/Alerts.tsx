import type { Alert } from '../../engine';

const ICON: Record<Alert['level'], string> = { danger: '⛔', warning: '⚠', info: 'ⓘ' };

export function AlertList({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <p className="muted">目前沒有警報。</p>;
  return (
    <div>
      {alerts.map((a, i) => (
        <div key={i} className={`alert ${a.level}`}>
          <span className="icon" aria-hidden>
            {ICON[a.level]}
          </span>
          <span>{a.text}</span>
        </div>
      ))}
    </div>
  );
}
