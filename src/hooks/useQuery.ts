import { useCallback, useEffect, useEffectEvent, useState } from 'react';

import { dataEvents, type DataTopic } from '@/services/events';
import { ownerStore } from '@/services/ownerStore';
import { toAppError, type AppError } from '@/utils/errors';

export interface QueryState<T> {
  data: T | undefined;
  error: AppError | null;
  /** True until the result for the current dependencies has arrived. */
  loading: boolean;
  reload: () => void;
}

interface Settled<T> {
  deps: readonly unknown[];
  tick: number;
  data: T | undefined;
  error: AppError | null;
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Runs an async read and re-runs it when its dependencies change, when the
 * data owner changes, or when one of `entities` is modified (local write or
 * sync). Results of superseded runs are discarded. During a background
 * refresh the previous data stays visible (no flicker).
 */
export function useQuery<T>(
  fn: () => Promise<T>,
  deps: readonly unknown[],
  entities: readonly DataTopic[] | 'all' = 'all',
): QueryState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const [tick, setTick] = useState(0);
  const run = useEffectEvent(fn);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    const snapshot = deps;
    run()
      .then((data) => {
        if (!cancelled) setSettled({ deps: snapshot, tick, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setSettled({ deps: snapshot, tick, data: undefined, error: toAppError(e, 'database') });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const entitiesKey = entities === 'all' ? 'all' : entities.join(',');
  useEffect(() => {
    const watched = entitiesKey === 'all' ? null : new Set(entitiesKey.split(','));
    const unsubData = dataEvents.subscribe((changed) => {
      if (!watched || changed.some((e) => watched.has(e))) reload();
    });
    const unsubOwner = ownerStore.subscribe(reload);
    return () => {
      unsubData();
      unsubOwner();
    };
  }, [entitiesKey, reload]);

  const sameInputs = settled !== null && sameDeps(settled.deps, deps);
  return {
    data: sameInputs ? settled.data : undefined,
    error: sameInputs ? settled.error : null,
    loading: !(sameInputs && settled.tick === tick),
    reload,
  };
}
