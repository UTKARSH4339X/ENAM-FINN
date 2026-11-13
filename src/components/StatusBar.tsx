"use client";

export function StatusBar() {
  return (
    <div className="status-bar" aria-hidden>
      <span className="status-time">9:41</span>
      <div className="status-island" />
      <div className="status-right">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.6" />
          <rect x="4.5" y="4.5" width="3" height="6.5" rx="0.6" />
          <rect x="9" y="2" width="3" height="9" rx="0.6" />
          <rect x="13.5" y="0" width="3" height="11" rx="0.6" opacity="0.35" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 3.2c1.7 0 3.2.6 4.4 1.6l1.1-1.3A8.1 8.1 0 0 0 8 1.4 8.1 8.1 0 0 0 2.5 3.5l1.1 1.3A6.3 6.3 0 0 1 8 3.2Z" />
          <path d="M8 6.2c1 0 1.9.3 2.6.9l1.2-1.3A5.2 5.2 0 0 0 8 4.4 5.2 5.2 0 0 0 4.2 5.8l1.2 1.3A3.7 3.7 0 0 1 8 6.2Z" />
          <circle cx="8" cy="10" r="1.3" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="2.2" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="1.2" fill="currentColor" />
          <path d="M23 4v4a1.8 1.8 0 0 0 0-4Z" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
    </div>
  );
}
