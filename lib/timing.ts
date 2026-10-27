import { AsyncLocalStorage } from "node:async_hooks";
const timings = new AsyncLocalStorage<{
  started: number;
  metrics: Map<string, { ms: number; count: number }>;
}>();
export const timedRequest = <T>(work: () => Promise<T>) =>
  timings.run({ started: performance.now(), metrics: new Map() }, work);
export async function measure<T>(
  name: string,
  work: () => Promise<T>,
): Promise<T> {
  const metrics = timings.getStore()?.metrics;
  if (!metrics) return work();
  const start = performance.now();
  try {
    return await work();
  } finally {
    const prior = metrics.get(name) ?? { ms: 0, count: 0 };
    metrics.set(name, {
      ms: prior.ms + performance.now() - start,
      count: prior.count + 1,
    });
  }
}
export function serverTiming() {
  const context = timings.getStore();
  if (!context) return "";
  return (
    `app;dur=${(performance.now() - context.started).toFixed(1)}, ` +
    [...context.metrics]
      .map(
        ([name, value]) =>
          `${name};dur=${value.ms.toFixed(1)};desc="${value.count} operation${value.count === 1 ? "" : "s"}"`,
      )
      .join(", ")
  );
}
// Hobby logs are short-lived, so record only the requests worth investigating:
// their storage breakdown shows whether Redis, contention or compute was slow.
export function reportSlowRequest(label: string, thresholdMs = 1500) {
  const context = timings.getStore();
  if (!context) return;
  const elapsed = performance.now() - context.started;
  if (elapsed >= thresholdMs)
    console.warn(`Slow ${label} ${elapsed.toFixed(0)}ms: ${serverTiming()}`);
}
