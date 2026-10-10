// ui/execute/ScanLimitBanner.jsx — shown when one or more replications hit the
// per-replication C-event scan cap (2× the plan's limit, see RA7 in
// engine/run-admission.js) and stopped before the end of the run.
import { useTheme } from "../shared/ThemeContext.jsx";

/**
 * @param {{ count: number, total: number, cap: number|null|undefined }} props
 */
export function ScanLimitBanner({ count, total, cap }) {
  const { C, FONT } = useTheme();
  if (!(count > 0)) return null;
  return (
    <div style={{ background: C.danger + '18', border: `1px solid ${C.danger}44`, borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.danger, fontFamily: FONT }}>
        {total > 1
          ? `${count} of ${total} replications hit the C-event scan limit and stopped early.`
          : 'This run hit the C-event scan limit and stopped before reaching its intended duration or termination condition.'}
      </div>
      <div style={{ fontSize: 11, color: C.danger, fontFamily: FONT, marginTop: 4, opacity: 0.8 }}>
        The limit is {Number(cap || 0).toLocaleString()} scans per replication (2× your plan's limit). Results reflect a partial run — shorten the run, reduce arrivals, or merge C-events that share a queue.
      </div>
    </div>
  );
}
