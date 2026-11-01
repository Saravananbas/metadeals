export type DependencyProbe = () => Promise<unknown>;
export type HealthDependencies = Record<"database" | "redis", DependencyProbe>;

/** Pure orchestration: adapters are injected, enabling real failure-path tests. */
export async function checkReadiness(dependencies: HealthDependencies) {
  const entries = Object.entries(dependencies);
  const results = await Promise.allSettled(entries.map(([, probe]) => probe()));
  const checks = Object.fromEntries(entries.map(([name], index) => [
    name, results[index].status === "fulfilled" ? "up" : "down",
  ]));
  const ready = results.every((result) => result.status === "fulfilled");
  return { ready, status: ready ? "ready" : "unavailable", checks };
}
