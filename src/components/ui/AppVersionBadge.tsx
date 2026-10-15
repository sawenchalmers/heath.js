import React from 'react';
import { updatedAt, version } from 'virtual:build-info';
import butterflyIcon from '../../../icons/butterfly_heath_short.png';

/** Format an ISO timestamp as local time, "YYYY-MM-DD HH:MM:SS". */
const formatLocalTimestamp = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

/** The Heath butterfly with the app version. On the dev server it also shows when the code last changed. */
export const AppVersionBadge: React.FC = () => {
  const timestamp = formatLocalTimestamp(updatedAt);
  return (
    <div
      className="flex select-none items-center gap-2 text-[11px] text-slate-400"
      title={import.meta.env.DEV ? `Dev server · code last changed ${timestamp}` : `Built ${timestamp}`}
    >
      <span>
        heath.js v. {version}
        {import.meta.env.DEV && <span className="tabular-nums"> · dev · updated {timestamp}</span>}
      </span>
      <img src={butterflyIcon} alt="Heath" className="h-6 w-auto" />
    </div>
  );
};
