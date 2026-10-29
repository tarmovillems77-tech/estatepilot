import { useEffect, useRef, useState } from 'react';
import {
  computeStress,
  type StressRequest,
  type StressResult,
} from '@/domain/finance/stressCompute';

/**
 * Computes the stress test in a Web Worker, so typing on the page is never blocked by it.
 * Only the latest request's answer is kept; until it arrives the previous result stays on
 * screen and `stale` is true. Where workers are unavailable (tests) it computes directly,
 * after the render. `request` must be memoised: a new object means a new calculation.
 */
export function useStressTest(request: StressRequest): {
  result: StressResult | null;
  stale: boolean;
} {
  const worker = useRef<Worker | null>(null);
  const pending = useRef<{ id: number; request: StressRequest } | null>(null);
  const [state, setState] = useState<{ request: StressRequest; result: StressResult } | null>(null);

  useEffect(() => {
    if (typeof Worker === 'undefined') return;
    const instance = new Worker(new URL('./stress.worker.ts', import.meta.url), {
      type: 'module',
    });
    instance.onmessage = (event: MessageEvent<{ id: number; result: StressResult }>) => {
      const current = pending.current;
      if (current && current.id === event.data.id) {
        setState({ request: current.request, result: event.data.result });
      }
    };
    worker.current = instance;
    return () => {
      instance.terminate();
      worker.current = null;
    };
  }, []);

  useEffect(() => {
    const id = (pending.current?.id ?? 0) + 1;
    pending.current = { id, request };
    if (worker.current) {
      worker.current.postMessage({ id, request });
      return;
    }
    const timer = setTimeout(() => {
      if (pending.current?.id === id) setState({ request, result: computeStress(request) });
    }, 0);
    return () => clearTimeout(timer);
  }, [request]);

  return { result: state?.result ?? null, stale: state?.request !== request };
}
