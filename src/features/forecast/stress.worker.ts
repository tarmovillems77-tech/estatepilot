import { computeStress, type StressRequest } from '@/domain/finance/stressCompute';

/* Runs the stress test off the main thread so the forecast page stays responsive. */

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ id: number; request: StressRequest }>) => void) | null;
  postMessage(message: unknown): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (event) => {
  const { id, request } = event.data;
  scope.postMessage({ id, result: computeStress(request) });
};
