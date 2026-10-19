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

/** 頁首橫幅：插圖裁成長條，左側壓暗放頁名。 */
export function Banner({ path, title, subtitle }: { path: string; title: string; subtitle?: string }) {
  const url = artUrl(path);
  return (
    <div className="banner">
      {url && <img src={url} alt="" />}
      <div className="t">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}
