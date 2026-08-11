import { emit } from "@tauri-apps/api/event";
import type { SerialDataEvent, SimulationSerialConfig } from "@/lib/serialTypes";

let simulationTimer: ReturnType<typeof setInterval> | null = null;

const MAX_SIMULATION_CATCH_UP_SECONDS = 1;

const clamp = (value: number, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

export function normalizeSimulationConfig(config: SimulationSerialConfig): SimulationSerialConfig {
  return {
    ...config,
    sampleRateHz: config.preset === "filter-demo" ? 200 : Math.round(clamp(config.sampleRateHz, 1, 200, 50)),
    frequencyHz: clamp(config.frequencyHz, 0.01, 10, 0.25),
    amplitude: clamp(config.amplitude, 0, 10000, 1),
    offset: clamp(config.offset, -10000, 10000, 0),
    noise: clamp(config.noise, 0, 100, 0),
    channelCount: Math.round(clamp(config.channelCount, 1, 8, 2)),
  };
}

const round = (value: number) => Number(value.toFixed(6));
const randomSigned = (random: () => number) => random() * 2 - 1;

function waveformValue(kind: SimulationSerialConfig["waveform"], phase: number, random: () => number) {
  if (kind === "square") return Math.sin(phase) >= 0 ? 1 : -1;
  if (kind === "triangle") return (2 / Math.PI) * Math.asin(Math.sin(phase));
  if (kind === "sawtooth") return 2 * (phase / (2 * Math.PI) - Math.floor(phase / (2 * Math.PI) + 0.5));
  if (kind === "noise") return randomSigned(random);
  if (kind === "constant") return 0;
  return Math.sin(phase);
}

export function createSimulationSample(
  config: SimulationSerialConfig,
  elapsedSeconds: number,
  random: () => number = Math.random
): Record<string, number> {
  const normalized = normalizeSimulationConfig(config);
  const phase = elapsedSeconds * normalized.frequencyHz * 2 * Math.PI;

  if (normalized.preset === "filter-demo") {
    return {
      signal: round(Math.sin(2 * Math.PI * 5 * elapsedSeconds) + 0.35 * Math.sin(2 * Math.PI * 40 * elapsedSeconds)),
    };
  }

  if (normalized.preset === "imu3") {
    return {
      roll: round(30 * Math.sin(phase) + normalized.noise * randomSigned(random)),
      pitch: round(20 * Math.sin(phase * 0.7) + normalized.noise * randomSigned(random)),
      yaw: round(45 * Math.sin(phase * 0.35) + normalized.noise * randomSigned(random)),
    };
  }

  if (normalized.preset === "xy") {
    const x = normalized.xyPattern === "circle" ? Math.cos(phase) : Math.sin(3 * phase);
    const y = normalized.xyPattern === "circle" ? Math.sin(phase) : Math.sin(2 * phase + Math.PI / 2);
    return {
      x: round(normalized.offset + normalized.amplitude * x + normalized.noise * randomSigned(random)),
      y: round(normalized.offset + normalized.amplitude * y + normalized.noise * randomSigned(random)),
    };
  }

  if (normalized.preset === "imu6") {
    const roll = 30 * Math.sin(phase);
    const pitch = 20 * Math.sin(phase * 0.7);
    const rollRad = (roll * Math.PI) / 180;
    const pitchRad = (pitch * Math.PI) / 180;
    const angularSpeed = normalized.frequencyHz * 2 * Math.PI;
    const accelerationNoise = normalized.noise;
    const gyroNoise = normalized.noise * 10;
    return {
      ax: round(-Math.sin(pitchRad) + accelerationNoise * randomSigned(random)),
      ay: round(Math.sin(rollRad) * Math.cos(pitchRad) + accelerationNoise * randomSigned(random)),
      az: round(Math.cos(rollRad) * Math.cos(pitchRad) + accelerationNoise * randomSigned(random)),
      gx: round(30 * angularSpeed * Math.cos(phase) + gyroNoise * randomSigned(random)),
      gy: round(20 * 0.7 * angularSpeed * Math.cos(phase * 0.7) + gyroNoise * randomSigned(random)),
      gz: round(45 * 0.35 * angularSpeed * Math.cos(phase * 0.35) + gyroNoise * randomSigned(random)),
    };
  }

  return Object.fromEntries(
    Array.from({ length: normalized.channelCount }, (_, index) => {
      const value = waveformValue(normalized.waveform, phase + (index * Math.PI) / 2, random);
      return [
        `ch${index + 1}`,
        round(normalized.offset + normalized.amplitude * value + normalized.noise * randomSigned(random)),
      ];
    })
  );
}

export function stopSerialSimulation() {
  if (simulationTimer !== null) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
}

export function resolveSimulationSampleRange(
  elapsedMilliseconds: number,
  sampleRateHz: number,
  emittedSampleCount: number
) {
  const dueSampleCount = Math.max(1, Math.floor((Math.max(elapsedMilliseconds, 0) * sampleRateHz) / 1000) + 1);
  const maxBatchSize = Math.max(1, Math.round(sampleRateHz * MAX_SIMULATION_CATCH_UP_SECONDS));
  return {
    startIndex: Math.max(emittedSampleCount, dueSampleCount - maxBatchSize),
    endIndex: dueSampleCount,
  };
}

export function startSerialSimulation(config: SimulationSerialConfig) {
  stopSerialSimulation();
  const normalized = normalizeSimulationConfig(config);
  const encoder = new TextEncoder();
  const startedAt = performance.now();
  const startedTimestamp = Date.now();
  let emittedSampleCount = 0;
  const pushDueSamples = () => {
    const { startIndex, endIndex } = resolveSimulationSampleRange(
      performance.now() - startedAt,
      normalized.sampleRateHz,
      emittedSampleCount
    );
    const chunks = [];
    for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
      const elapsedSeconds = sampleIndex / normalized.sampleRateHz;
      const sample = createSimulationSample(normalized, elapsedSeconds);
      chunks.push({
        data: Array.from(encoder.encode(`${JSON.stringify(sample)}\n`)),
        timestamp: Math.round(startedTimestamp + elapsedSeconds * 1000),
      });
    }
    emittedSampleCount = endIndex;
    if (chunks.length > 0) {
      void emit<SerialDataEvent>("serial-data", { chunks, direction: "rx" });
    }
  };

  pushDueSamples();
  simulationTimer = setInterval(pushDueSamples, 1000 / normalized.sampleRateHz);
  return normalized;
}
