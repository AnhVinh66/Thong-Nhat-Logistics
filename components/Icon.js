const paths = {
  truck: <><path d="M1 6h13v10H1z" /><path d="M14 9h4l3 3v4h-7z" /><circle cx="5.5" cy="17.5" r="2" /><circle cx="17.5" cy="17.5" r="2" /></>,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></>,
  snow: <><path d="M12 2v20M4.9 6l14.2 12M19.1 6L4.9 18" /><path d="M9 3l3 2 3-2M9 21l3-2 3 2" /></>,
  route: <><circle cx="6" cy="19" r="2.5" /><circle cx="18" cy="5" r="2.5" /><path d="M8.5 19H16a3.5 3.5 0 000-7H8a3.5 3.5 0 010-7h7.5" /></>,
  warehouse: <><path d="M3 21V9l9-5 9 5v12" /><path d="M7 21v-8h10v8M7 17h10" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  price: <><path d="M12 2v20" /><path d="M17 6.5C16 5 14.3 4.5 12 4.5c-2.8 0-4.5 1.3-4.5 3.2 0 4.8 9.500 2.300 9.500 7 0 2-1.800 3.300-5 3.300-2.500 0-4.300-.8-5.300-2.500" /></>,
  phone: <path d="M22 16.9v3a2 2 0 01-2.200 2 19.800 19.800 0 01-8.600-3.100 19.500 19.500 0 01-6-6A19.800 19.800 0 012.100 4.200 2 2 0 014.100 2h3a2 2 0 012 1.700c.1 1 .4 1.900.7 2.800a2 2 0 01-.5 2.100L8.100 9.900a16 16 0 006 6l1.300-1.300a2 2 0 012.100-.4c.9.300 1.800.6 2.800.7a2 2 0 011.700 2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  pin: <><path d="M12 22s7-6.200 7-12a7 7 0 10-14 0c0 5.800 7 12 7 12z" /><circle cx="12" cy="10" r="2.500" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  menu: <path d="M3 6h18M3 12h18M3 18h18" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  users: <><circle cx="9" cy="8" r="3.500" /><path d="M2 21c0-4 3-6 7-6s7 2 7 6" /><path d="M16 4.500a3.500 3.500 0 010 7M18 15c2.500.6 4 2.500 4 6" /></>,
  camera: <><path d="M3 8.5A2.5 2.5 0 015.5 6h1.8l1.6-2.4h6.2L16.7 6h1.8A2.5 2.5 0 0121 8.5v9a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z" /><circle cx="12" cy="13" r="3.8" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="M21 16l-5-5-8 8" /></>,
  grid: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  logout: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2" /></>,
  external: <><path d="M14 3h7v7M21 3l-9 9" /><path d="M19 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h5" /></>,
  alert: <><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4M12 17h.01" /></>,
  wheel: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" /><path d="M12 14.5V21M9.6 11.3L3.4 9.6M14.4 11.3l6.2-1.7" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  trash: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" /><path d="M9 7V4h6v3" /></>,
  dots: <><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  doc: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
  money: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  bank: <><path d="M3 10l9-6 9 6" /><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" /><path d="M3 21h18M2 10h20" /></>,
  out: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M7 12h10M13 9l4 3-4 3" /></>,
  calc:<><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 11h2M14 11h2M8 15h2M14 15h2M8 19h2M14 19h2" /></>,
};

export default function Icon({ name, size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}
