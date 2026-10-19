// 資源小圖示（純 SVG，不需外部圖檔）。顏色固定，放在深色上方橫列也看得清楚。
const ICONS: Record<string, JSX.Element> = {
  lingshi: (
    <>
      <path d="M12 2l7 7-7 13L5 9z" fill="#7fd1c0" stroke="#d8fff5" strokeWidth=".8" />
      <path d="M5 9h14M12 2l-3 7 3 13 3-13z" fill="none" stroke="#2c8a78" strokeWidth=".8" />
    </>
  ),
  food: (
    <>
      <path d="M12 21V8" stroke="#e6c46a" strokeWidth="1.4" />
      {[5, 9, 13].map((y) => (
        <g key={y} fill="#f0d27e" stroke="#a8842f" strokeWidth=".6">
          <ellipse cx="9.3" cy={y + 1} rx="2.2" ry="1.3" transform={`rotate(-35 9.3 ${y + 1})`} />
          <ellipse cx="14.7" cy={y + 1} rx="2.2" ry="1.3" transform={`rotate(35 14.7 ${y + 1})`} />
        </g>
      ))}
    </>
  ),
  stone: <path d="M3 18l3-8 5-4 6 2 4 7-3 4H5z" fill="#b9b3a6" stroke="#eee8da" strokeWidth=".9" />,
  wood: (
    <>
      <rect x="3" y="8" width="16" height="8" rx="1.5" fill="#a9774a" stroke="#e7c8a2" strokeWidth=".8" />
      <ellipse cx="19" cy="12" rx="2.6" ry="4" fill="#e2b98a" stroke="#7a5230" strokeWidth=".8" />
      <path d="M19 10.5a1.5 1.5 0 1 1 0 3" fill="none" stroke="#7a5230" strokeWidth=".7" />
    </>
  ),
  herb: (
    <>
      <path d="M12 21c0-6 0-9 4-14" stroke="#7fc58c" strokeWidth="1.3" fill="none" />
      <path d="M12 14c-5 0-7-4-7-7 4 0 7 3 7 7zM13.5 11c3 0 6-2 6-6-3 0-6 2-6 6z" fill="#86cf8f" stroke="#d9f5dc" strokeWidth=".6" />
    </>
  ),
  pill: (
    <>
      <path d="M12 4c2 0 3 1.4 3 3 2.6 1 4 3.2 4 6a7 7 0 0 1-14 0c0-2.8 1.4-5 4-6 0-1.6 1-3 3-3z" fill="#d98a4e" stroke="#f9dcb8" strokeWidth=".8" />
      <circle cx="10" cy="13" r="1.6" fill="#ffe7c4" opacity=".8" />
    </>
  ),
  reputation: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" fill="#b8402f" stroke="#ffdcc8" strokeWidth=".9" />
      <path d="M8 9h8M12 7v10M8.5 13h7M9 17h6" stroke="#ffe9da" strokeWidth="1.2" />
    </>
  ),
};

export function ResIcon({ id }: { id: keyof typeof ICONS | string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[id] ?? null}
    </svg>
  );
}
