export type StatusBar = { day: string; checks: number; down: number };
export type StatusComponent = { id: string; name: string; detail: string; ok: boolean | null; ms: number | null; error?: string; uptime: number | null; bars: StatusBar[] };
export type StatusSummary = { checkedAt: number | null; since: number | null; interval: number; components: StatusComponent[]; failures: { at: number; component: string; error: string }[] };

/** Select service health without exposing internal payment checks or their incidents. */
export function serviceHealth(summary: StatusSummary): StatusSummary {
  return {
    ...summary,
    components: summary.components.filter(component => component.id !== "payments"),
    failures: summary.failures.filter(failure => failure.component !== "payments"),
  };
}
