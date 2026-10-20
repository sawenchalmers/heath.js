import React from 'react';
import { updatedAt, version } from 'virtual:build-info';
import butterflyIcon from '../../../icons/butterfly_heath_short.png';

/** Where the butterfly links to. Points at the GitHub repository until Heath has its own website. */
const HEATH_HOMEPAGE_URL = 'https://github.com/sawenchalmers/heath.js';

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
    <div className="flex select-none items-center gap-2 text-[11px] text-slate-400">
      <span title={import.meta.env.DEV ? `Dev server · code last changed ${timestamp}` : `Built ${timestamp}`}>
        heath.js v. {version}
        {import.meta.env.DEV && <span className="tabular-nums"> · dev · updated {timestamp}</span>}
      </span>
      <a
        href={HEATH_HOMEPAGE_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="heath.js on GitHub"
        className="group rounded-md p-1 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <img
          src={butterflyIcon}
          alt="heath.js on GitHub"
          className="h-6 w-auto transition-transform duration-150 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      </a>
    </div>
  );
};
