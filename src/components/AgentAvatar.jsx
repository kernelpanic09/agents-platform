const avatars = {
  // Atlas - Globe + network nodes
  atlas: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="24" stroke={color} strokeWidth="1.5" opacity="0.3" />
      <ellipse cx="40" cy="40" rx="24" ry="10" stroke={color} strokeWidth="1.5" opacity="0.5" />
      <ellipse cx="40" cy="40" rx="10" ry="24" stroke={color} strokeWidth="1.5" opacity="0.5" />
      <line x1="16" y1="40" x2="64" y2="40" stroke={color} strokeWidth="1" opacity="0.3" />
      <circle cx="40" cy="16" r="3" fill={color} opacity="0.8" />
      <circle cx="64" cy="40" r="3" fill={color} opacity="0.8" />
      <circle cx="40" cy="64" r="3" fill={color} opacity="0.8" />
      <circle cx="24" cy="28" r="2" fill={color} opacity="0.6" />
      <circle cx="56" cy="52" r="2" fill={color} opacity="0.6" />
      <line x1="40" y1="16" x2="64" y2="40" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="64" y1="40" x2="40" y2="64" stroke={color} strokeWidth="0.8" opacity="0.3" />
    </svg>
  ),

  // Sentinel - Eye + radar rings
  sentinel: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="28" stroke={color} strokeWidth="0.8" opacity="0.15" />
      <circle cx="40" cy="40" r="22" stroke={color} strokeWidth="1" opacity="0.25" />
      <circle cx="40" cy="40" r="16" stroke={color} strokeWidth="1.2" opacity="0.35" />
      <path d="M22 40C22 40 30 28 40 28C50 28 58 40 58 40C58 40 50 52 40 52C30 52 22 40 22 40Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" />
      <circle cx="40" cy="40" r="6" fill={color} opacity="0.7" />
      <circle cx="40" cy="40" r="2.5" fill="white" opacity="0.9" />
    </svg>
  ),

  // Vault - Shield + lock
  vault: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 14L60 24V42C60 54 50 62 40 66C30 62 20 54 20 42V24L40 14Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      <rect x="33" y="36" width="14" height="12" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.15" />
      <path d="M35 36V32C35 29.2 37.2 27 40 27C42.8 27 45 29.2 45 32V36" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="40" cy="42" r="2" fill={color} opacity="0.8" />
      <line x1="40" y1="42" x2="40" y2="45" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),

  // Harmony - Sine wave + home
  harmony: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M40 20L56 34V56H46V44H34V56H24V34L40 20Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      <path d="M14 50C18 50 20 38 24 38C28 38 30 50 34 50C38 50 40 38 44 38C48 38 50 50 54 50C58 50 60 38 64 38" stroke={color} strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />
      <path d="M14 60C18 60 20 48 24 48C28 48 30 60 34 60C38 60 40 48 44 48C48 48 50 60 54 60C58 60 60 48 64 48" stroke={color} strokeWidth="1" opacity="0.25" strokeLinecap="round" />
    </svg>
  ),

  // Pixel - Grid + paintbrush
  pixel: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Grid */}
      <rect x="18" y="18" width="12" height="12" rx="2" fill={color} opacity="0.6" />
      <rect x="34" y="18" width="12" height="12" rx="2" fill={color} opacity="0.3" />
      <rect x="50" y="18" width="12" height="12" rx="2" fill={color} opacity="0.15" />
      <rect x="18" y="34" width="12" height="12" rx="2" fill={color} opacity="0.2" />
      <rect x="34" y="34" width="12" height="12" rx="2" fill={color} opacity="0.5" />
      <rect x="50" y="34" width="12" height="12" rx="2" fill={color} opacity="0.35" />
      {/* Paintbrush */}
      <line x1="52" y1="52" x2="64" y2="64" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <path d="M48 56L52 52L56 56L52 60Z" fill={color} opacity="0.7" />
      <circle cx="64" cy="64" r="2" fill={color} opacity="0.5" />
    </svg>
  ),

  // Forge - Anvil + sparks
  forge: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Anvil shape */}
      <path d="M22 50H58L62 44H18L22 50Z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <rect x="28" y="50" width="24" height="6" rx="1" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5" />
      <rect x="32" y="56" width="16" height="4" rx="1" fill={color} fillOpacity="0.1" stroke={color} strokeWidth="1" />
      {/* Hammer */}
      <line x1="40" y1="22" x2="40" y2="40" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <rect x="33" y="18" width="14" height="8" rx="2" fill={color} opacity="0.5" />
      {/* Sparks */}
      <circle cx="28" cy="38" r="1.5" fill={color} opacity="0.7" />
      <circle cx="52" cy="36" r="1" fill={color} opacity="0.5" />
      <circle cx="24" cy="34" r="1" fill={color} opacity="0.4" />
      <circle cx="56" cy="32" r="1.5" fill={color} opacity="0.6" />
      <circle cx="48" cy="30" r="1" fill={color} opacity="0.3" />
    </svg>
  ),

  // Scout - Compass + magnifier
  scout: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="36" cy="36" r="18" stroke={color} strokeWidth="1.5" opacity="0.4" />
      <circle cx="36" cy="36" r="12" stroke={color} strokeWidth="1" opacity="0.2" />
      {/* Compass needle */}
      <path d="M36 24L40 36L36 48L32 36Z" fill={color} opacity="0.3" />
      <path d="M36 24L40 36L36 36Z" fill={color} opacity="0.6" />
      <circle cx="36" cy="36" r="2.5" fill={color} opacity="0.7" />
      {/* Magnifier */}
      <circle cx="54" cy="54" r="9" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      <line x1="60" y1="60" x2="68" y2="68" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),

  // Oracle - Brain + neural net
  oracle: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Brain outline */}
      <path d="M40 20C32 20 26 26 26 32C24 32 20 36 20 42C20 48 24 52 28 52C28 56 32 60 38 60H42C48 60 52 56 52 52C56 52 60 48 60 42C60 36 56 32 54 32C54 26 48 20 40 20Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.06" />
      {/* Neural connections */}
      <circle cx="34" cy="34" r="2.5" fill={color} opacity="0.7" />
      <circle cx="46" cy="34" r="2.5" fill={color} opacity="0.7" />
      <circle cx="40" cy="44" r="2.5" fill={color} opacity="0.7" />
      <circle cx="30" cy="46" r="2" fill={color} opacity="0.5" />
      <circle cx="50" cy="46" r="2" fill={color} opacity="0.5" />
      <circle cx="40" cy="28" r="2" fill={color} opacity="0.5" />
      <line x1="34" y1="34" x2="46" y2="34" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="34" y1="34" x2="40" y2="44" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="46" y1="34" x2="40" y2="44" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="30" y1="46" x2="40" y2="44" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="50" y1="46" x2="40" y2="44" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="40" y1="28" x2="34" y2="34" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="40" y1="28" x2="46" y2="34" stroke={color} strokeWidth="0.8" opacity="0.3" />
    </svg>
  ),

  // Nexus - Play button + film
  nexus: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Film strip */}
      <rect x="18" y="22" width="44" height="36" rx="3" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.06" />
      <rect x="18" y="22" width="6" height="36" fill={color} fillOpacity="0.1" />
      <rect x="56" y="22" width="6" height="36" fill={color} fillOpacity="0.1" />
      {/* Film perforations */}
      <rect x="19" y="26" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="19" y="33" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="19" y="40" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="19" y="47" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="57" y="26" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="57" y="33" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="57" y="40" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      <rect x="57" y="47" width="4" height="3" rx="0.5" fill={color} opacity="0.3" />
      {/* Play button */}
      <path d="M35 32L50 40L35 48Z" fill={color} opacity="0.7" />
    </svg>
  ),

  // Cipher - Key + binary digits
  cipher: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="30" cy="34" r="12" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      <circle cx="30" cy="34" r="5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.2" />
      <line x1="38" y1="42" x2="62" y2="56" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="50" y1="49" x2="50" y2="54" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="56" y1="52" x2="56" y2="57" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <text x="48" y="22" fill={color} fontSize="6" opacity="0.5" fontFamily="monospace">10</text>
      <text x="60" y="30" fill={color} fontSize="5" opacity="0.35" fontFamily="monospace">01</text>
      <text x="54" y="14" fill={color} fontSize="5" opacity="0.25" fontFamily="monospace">11</text>
      <text x="64" y="20" fill={color} fontSize="6" opacity="0.4" fontFamily="monospace">0</text>
    </svg>
  ),

  // Tempo - Pipeline arrows + gear
  tempo: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="40" x2="68" y2="40" stroke={color} strokeWidth="1" opacity="0.3" />
      <circle cx="20" cy="40" r="4" fill={color} opacity="0.6" />
      <circle cx="40" cy="40" r="4" fill={color} opacity="0.8" />
      <circle cx="60" cy="40" r="4" fill={color} opacity="0.6" />
      <path d="M26 40L34 40M34 37L37 40L34 43" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <path d="M46 40L54 40M54 37L57 40L54 43" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx="40" cy="22" r="7" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      <circle cx="40" cy="22" r="3" fill={color} opacity="0.4" />
      <rect x="38.5" y="13" width="3" height="3" rx="0.5" fill={color} opacity="0.5" />
      <rect x="38.5" y="28" width="3" height="3" rx="0.5" fill={color} opacity="0.5" />
      <rect x="31" y="20.5" width="3" height="3" rx="0.5" fill={color} opacity="0.5" />
      <rect x="46" y="20.5" width="3" height="3" rx="0.5" fill={color} opacity="0.5" />
      <circle cx="20" cy="52" r="2" fill={color} opacity="0.7" />
      <circle cx="40" cy="52" r="2" fill={color} opacity="0.5" />
      <circle cx="60" cy="52" r="2" fill={color} opacity="0.3" />
    </svg>
  ),

  // Proxy - Network nodes with routing arrows
  proxy: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="8" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="3" fill={color} opacity="0.7" />
      <circle cx="18" cy="40" r="5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.08" />
      <circle cx="62" cy="26" r="5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.08" />
      <circle cx="62" cy="40" r="5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.08" />
      <circle cx="62" cy="54" r="5" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.08" />
      <path d="M24 40L31 40" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
      <path d="M30 37.5L33 40L30 42.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
      <line x1="48" y1="36" x2="57" y2="28" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="49" y1="40" x2="57" y2="40" stroke={color} strokeWidth="1" opacity="0.5" />
      <line x1="48" y1="44" x2="57" y2="52" stroke={color} strokeWidth="1" opacity="0.5" />
    </svg>
  ),

  // Mirror - Mirrored/reflected shapes
  mirror: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="40" y1="12" x2="40" y2="68" stroke={color} strokeWidth="1.5" opacity="0.4" strokeDasharray="3 3" />
      <rect x="18" y="28" width="16" height="6" rx="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.1" />
      <rect x="18" y="37" width="16" height="6" rx="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.15" />
      <rect x="18" y="46" width="16" height="6" rx="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.1" />
      <circle cx="31" cy="31" r="1.5" fill={color} opacity="0.6" />
      <circle cx="31" cy="40" r="1.5" fill={color} opacity="0.8" />
      <circle cx="31" cy="49" r="1.5" fill={color} opacity="0.6" />
      <rect x="46" y="28" width="16" height="6" rx="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.1" />
      <rect x="46" y="37" width="16" height="6" rx="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.15" />
      <rect x="46" y="46" width="16" height="6" rx="2" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.1" />
      <circle cx="49" cy="31" r="1.5" fill={color} opacity="0.6" />
      <circle cx="49" cy="40" r="1.5" fill={color} opacity="0.8" />
      <circle cx="49" cy="49" r="1.5" fill={color} opacity="0.6" />
      <path d="M36 22L38 20L40 22" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <path d="M40 22L42 20L44 22" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
    </svg>
  ),

  // Patch - Wrench + checkmark
  patch: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M24 56L44 36" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <path d="M44 36C44 36 50 28 56 28C58 28 60 30 60 32C60 38 54 40 50 38L46 42" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <circle cx="56" cy="30" r="4" stroke={color} strokeWidth="1.2" fill={color} fillOpacity="0.1" />
      <path d="M24 56C22 58 20 58 20 56C20 54 22 52 24 52L44 36" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <circle cx="28" cy="28" r="12" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.5" />
      <path d="M22 28L26 32L34 24" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
    </svg>
  ),

  // Relay - Signal waves + lightning bolt
  relay: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M44 16L34 42H42L36 64L54 36H44L52 16Z" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 32C18 32 14 36 14 40C14 44 18 48 18 48" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M24 26C24 26 18 32 18 40C18 48 24 54 24 54" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M62 32C62 32 66 36 66 40C66 44 62 48 62 48" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
      <path d="M56 26C56 26 62 32 62 40C62 48 56 54 56 54" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.3" />
    </svg>
  ),

  // Canvas - 3D cube wireframe
  canvas: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="26" y="34" width="26" height="26" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.06" />
      <path d="M26 34L39 22L65 22L52 34Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" strokeLinejoin="round" />
      <path d="M52 34L65 22L65 48L52 60Z" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" strokeLinejoin="round" />
      <line x1="26" y1="34" x2="39" y2="22" stroke={color} strokeWidth="1.5" opacity="0.6" />
      <line x1="52" y1="34" x2="65" y2="22" stroke={color} strokeWidth="1.5" opacity="0.6" />
      <line x1="52" y1="60" x2="65" y2="48" stroke={color} strokeWidth="1.5" opacity="0.6" />
      <circle cx="26" cy="34" r="2" fill={color} opacity="0.7" />
      <circle cx="52" cy="34" r="2" fill={color} opacity="0.7" />
      <circle cx="65" cy="22" r="2" fill={color} opacity="0.5" />
      <circle cx="39" cy="22" r="2" fill={color} opacity="0.5" />
    </svg>
  ),

  // Dock - Container/whale shape
  dock: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 58C16 54 24 62 30 58C36 54 44 62 50 58C56 54 64 62 70 58" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.4" />
      <path d="M16 48C16 40 22 32 36 30C50 28 60 34 62 42C64 48 60 52 52 52H20C17.8 52 16 50.2 16 48Z" fill={color} fillOpacity="0.12" stroke={color} strokeWidth="1.5" />
      <path d="M16 48L10 40L14 50Z" fill={color} opacity="0.3" stroke={color} strokeWidth="1" strokeLinejoin="round" />
      <rect x="30" y="22" width="10" height="8" rx="1" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1" />
      <rect x="42" y="22" width="10" height="8" rx="1" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1" />
      <rect x="30" y="14" width="10" height="8" rx="1" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1" />
      <circle cx="52" cy="42" r="2.5" fill={color} opacity="0.7" />
      <circle cx="52" cy="42" r="1" fill="white" opacity="0.6" />
    </svg>
  ),

  // Ledger - Stacked database tables
  ledger: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="18" width="52" height="12" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.12" />
      <line x1="14" y1="24" x2="66" y2="24" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="32" y1="18" x2="32" y2="30" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="50" y1="18" x2="50" y2="30" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <rect x="14" y="34" width="52" height="12" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.08" />
      <line x1="14" y1="40" x2="66" y2="40" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="32" y1="34" x2="32" y2="46" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="50" y1="34" x2="50" y2="46" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <rect x="14" y="50" width="52" height="12" rx="2" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.06" />
      <line x1="14" y1="56" x2="66" y2="56" stroke={color} strokeWidth="0.8" opacity="0.4" />
      <line x1="32" y1="50" x2="32" y2="62" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <line x1="50" y1="50" x2="50" y2="62" stroke={color} strokeWidth="0.8" opacity="0.3" />
      <rect x="17" y="26" width="10" height="1.5" rx="0.5" fill={color} opacity="0.5" />
      <rect x="35" y="26" width="8" height="1.5" rx="0.5" fill={color} opacity="0.4" />
      <rect x="17" y="42" width="12" height="1.5" rx="0.5" fill={color} opacity="0.4" />
      <rect x="17" y="58" width="8" height="1.5" rx="0.5" fill={color} opacity="0.3" />
    </svg>
  ),

  // Flux - Git branch merge diagram
  flux: ({ color }) => (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="40" y1="12" x2="40" y2="68" stroke={color} strokeWidth="1.5" opacity="0.5" />
      <path d="M40 28C40 28 36 32 28 36C20 40 20 48 28 50" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <path d="M28 50C36 52 40 52 40 52" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
      <circle cx="40" cy="20" r="4" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <circle cx="40" cy="20" r="2" fill={color} opacity="0.7" />
      <circle cx="40" cy="40" r="4" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <circle cx="40" cy="40" r="2" fill={color} opacity="0.7" />
      <circle cx="40" cy="60" r="4" fill={color} fillOpacity="0.2" stroke={color} strokeWidth="1.5" />
      <circle cx="40" cy="60" r="2" fill={color} opacity="0.7" />
      <circle cx="24" cy="40" r="3.5" fill={color} fillOpacity="0.15" stroke={color} strokeWidth="1.2" />
      <circle cx="24" cy="40" r="1.5" fill={color} opacity="0.6" />
      <path d="M37 50L40 52L37 54" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
      <path d="M54 20C58 20 62 24 62 28C62 32 58 36 54 36" stroke={color} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
      <path d="M54 36L51 33L54 30" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    </svg>
  ),
};

// Default fallback avatar
function DefaultAvatar({ color }) {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="40" cy="40" r="20" stroke={color} strokeWidth="1.5" fill={color} fillOpacity="0.1" />
      <circle cx="40" cy="36" r="6" fill={color} opacity="0.5" />
      <path d="M28 54C28 48 33 44 40 44C47 44 52 48 52 54" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function AgentAvatar({ iconId, color, size = 80 }) {
  const AvatarComponent = avatars[iconId];

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* Glow ring */}
      <div
        className="absolute inset-0 rounded-full avatar-ring"
        style={{
          background: `radial-gradient(circle, ${color}20 0%, transparent 70%)`,
        }}
      />
      {AvatarComponent ? (
        <AvatarComponent color={color} />
      ) : (
        <DefaultAvatar color={color} />
      )}
    </div>
  );
}
