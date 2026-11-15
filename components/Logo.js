export default function Logo({ light = false }) {
  return (
    <span className={`logo ${light ? 'logo-light' : ''}`}>
      <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="10" fill="#F97316" />
        <path d="M7 14h15v12H7z" fill="#0B2545" />
        <path d="M22 17h6l5 5v4H22z" fill="#fff" />
        <circle cx="13" cy="28" r="3" fill="#fff" stroke="#0B2545" strokeWidth="2" />
        <circle cx="28" cy="28" r="3" fill="#fff" stroke="#0B2545" strokeWidth="2" />
      </svg>
      <span className="logo-text">
        <strong>THỐNG NHẤT</strong>
        <small>LOGISTIC</small>
      </span>
    </span>
  );
}
