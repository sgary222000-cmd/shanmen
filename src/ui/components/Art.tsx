import { artUrl, isPlaceholder } from '../art';

export function Art({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const url = artUrl(path);
  return (
    <span className={`art ${className ?? ''}`}>
      {url ? <img src={url} alt={alt} loading="lazy" /> : <span className="muted">（缺圖：{alt}）</span>}
      {isPlaceholder(path) && <span className="ph">臨時素材</span>}
    </span>
  );
}
