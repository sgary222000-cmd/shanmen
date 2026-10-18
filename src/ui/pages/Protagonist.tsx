import { CharacterPanel } from '../components/CharacterPanel';
import { Art } from '../components/Art';
import { useGame } from '../store';

export function ProtagonistPage() {
  const game = useGame();
  const p = game.protagonist;
  return (
    <div>
      <h2>主角</h2>
      <div className="grid" style={{ gridTemplateColumns: '220px 1fr' }}>
        <Art path={p.gender === 'female' ? 'final/portrait-female.webp' : 'final/portrait-male.webp'} alt={p.name} />
        <CharacterPanel c={p} />
      </div>
      <p className="muted small">
        主角每月只有一項主要行程。查看與下達宗門命令不佔行程；探索、煉丹、授課等親自參與的事才佔用。P0 開放到築基，金丹於 P1 開放。
      </p>
    </div>
  );
}
