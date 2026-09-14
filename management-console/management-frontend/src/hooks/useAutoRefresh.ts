import { useCallback, useEffect, useState } from 'react'

/**
 * A `tick` that increments on a fixed interval and on-demand via `refresh()`.
 * Include `tick` in a data-fetching effect's dependency array to have that
 * effect re-run automatically every `intervalMs`, and immediately whenever
 * `refresh()` is called (e.g. from a manual refresh button).
 */
export function useAutoRefresh(intervalMs: number) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return { tick, refresh }
}
