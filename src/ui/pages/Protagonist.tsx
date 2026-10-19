import { CharacterSheet } from '../components/Layout';
import { useGame } from '../store';

export function ProtagonistPage() {
  const game = useGame();
  const p = game.protagonist;
  return (
    <div>
      <h2>主角</h2>
      <CharacterSheet c={p} portrait={p.gender === 'female' ? 'final/portrait-female.webp' : 'final/portrait-male.webp'} title={`${game.sectName}掌門`} />
      <p className="muted small" style={{ marginTop: '.8rem' }}>
        主角每月只有一項主要行程。查看與下達宗門命令不佔行程；探索、煉丹、授課等親自參與的事才佔用。P1 開放到金丹；結丹需要功法小成、結丹靈液與足夠靈氣。元嬰於 P2 開放。
      </p>
    </div>
  );
}
