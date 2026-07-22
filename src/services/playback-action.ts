import type { ProjectAnimationStore } from '../stores/project-context';
import { productTelemetry, type TelemetryClient } from './telemetry';

export function togglePlayback(
  animation: ProjectAnimationStore,
  telemetry: TelemetryClient = productTelemetry,
): void {
  const wasPlaying = animation.isPlaying.value;
  animation.togglePlayback();

  if (!wasPlaying && animation.isPlaying.value) {
    telemetry.record({ name: 'playback_started', dimensions: {} });
  }
}
