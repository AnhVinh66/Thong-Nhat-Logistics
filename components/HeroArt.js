export default function HeroArt() {
  return (
    <svg className="hero-art" viewBox="0 0 520 380" role="img" aria-label="Xe tải chạy trên đường cao tốc">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d4373" />
          <stop offset="1" stopColor="#13315c" />
        </linearGradient>
      </defs>
      <rect x="10" y="20" width="500" height="340" rx="28" fill="url(#sky)" opacity=".55" />
      <circle cx="410" cy="95" r="42" fill="#f97316" opacity=".9" />
      <path d="M10 250 L110 170 L190 230 L270 150 L380 245 L510 190 V300 H10Z" fill="#0b2545" opacity=".7" />
      <rect x="10" y="286" width="500" height="74" fill="#07182f" />
      <line x1="10" y1="324" x2="510" y2="324" stroke="#ffd2ad" strokeWidth="4" strokeDasharray="30 30" className="road-dash" />
      {/* Container / thùng xe */}
      <rect x="70" y="170" width="230" height="112" rx="8" fill="#fff" />
      <rect x="70" y="170" width="230" height="22" rx="8" fill="#f97316" />
      <text x="185" y="236" textAnchor="middle" fontSize="22" fontWeight="800" fill="#0b2545" fontFamily="sans-serif">THỐNG NHẤT</text>
      <text x="185" y="258" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="6" fill="#c2410c" fontFamily="sans-serif">LOGISTIC</text>
      {/* Cabin */}
      <path d="M304 200 h58 l36 44 v38 h-94z" fill="#f97316" />
      <path d="M316 210 h40 l24 30 h-64z" fill="#cfe3ff" />
      <rect x="64" y="282" width="340" height="10" rx="4" fill="#0b2545" />
      {/* Wheels */}
      {[120, 200, 350].map((x) => (
        <g key={x}>
          <circle cx={x} cy="298" r="24" fill="#111c2e" />
          <circle cx={x} cy="298" r="11" fill="#cfd8e6" />
        </g>
      ))}
      <circle cx="396" cy="262" r="5" fill="#fff6a8" />
    </svg>
  );
}
