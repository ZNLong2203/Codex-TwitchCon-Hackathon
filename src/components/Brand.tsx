import { Rocket } from 'lucide-react';

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-icon">
        <Rocket size={20} strokeWidth={2.4} />
      </span>
      <span>
        RAID<span className="brand-slashes">//</span>RELAY<small>COMMUNITY, IN ORBIT.</small>
      </span>
    </div>
  );
}

export function TwitchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M4 2 1 6v15h6v3l4-3h5l7-7V2H4zm17 11-4 4h-6l-4 3v-3H3V4h18v9zM16 7h2v6h-2V7zm-5 0h2v6h-2V7z" />
    </svg>
  );
}
