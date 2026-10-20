import type { RuntimeEvent } from "../types/api";
import { formatEventDiagnosis } from "../utils/format";

export interface RecentError {
  at: string | null;
  diagnosis: string;
}

// Runtime emits both names for the same failure; one turn is one error.
export function recentTurnErrors(events: RuntimeEvent[]): RecentError[] {
  const seen = new Set<string>();
  return events
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        event.event === "turn.failed" || event.event === "turn_failed",
    )
    .sort((a, b) => {
      const aTime = Date.parse(a.event.at ?? "");
      const bTime = Date.parse(b.event.at ?? "");
      const aOrder = Number.isFinite(aTime) ? aTime : -Infinity;
      const bOrder = Number.isFinite(bTime) ? bTime : -Infinity;
      return aOrder === bOrder ? b.index - a.index : bOrder - aOrder;
    })
    .filter(({ event }) => {
      if (typeof event.turn_id !== "string" || !event.turn_id) return true;
      if (seen.has(event.turn_id)) return false;
      seen.add(event.turn_id);
      return true;
    })
    .slice(0, 5)
    .map(({ event }) => {
      // Pass only machine identifiers to the existing diagnosis formatter.
      // Never render arbitrary event fields, provider messages or Discord IDs.
      const safe: Record<string, unknown> = { event: "turn_failed" };
      for (const key of ["error_type", "provider", "timeout_phase"]) {
        const value = event[key];
        if (
          typeof value === "string" &&
          /^[A-Za-z][A-Za-z0-9_.:-]{0,99}$/.test(value)
        )
          safe[key] = value;
      }
      return {
        at: event.at && Number.isFinite(Date.parse(event.at)) ? event.at : null,
        diagnosis: formatEventDiagnosis(safe) ?? "TURN FAILED",
      };
    });
}
