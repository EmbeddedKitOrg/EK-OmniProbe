import type { ChartDataPoint } from "@/lib/chartTypes";
import type { SerialImu3dWidget } from "@/lib/serialControlPanel";

export type Imu6FusionConfig = Pick<
  SerialImu3dWidget,
  | "accelXChannel"
  | "accelYChannel"
  | "accelZChannel"
  | "gyroXChannel"
  | "gyroYChannel"
  | "gyroZChannel"
  | "gyroUnit"
  | "sampleRateHz"
  | "filterAlpha"
  | "gyroBiasX"
  | "gyroBiasY"
  | "gyroBiasZ"
>;

export interface ImuFusionState {
  initialized: boolean;
  roll: number;
  pitch: number;
  yaw: number;
  lastTimestamp: number | null;
}

export function createImuFusionState(): ImuFusionState {
  return { initialized: false, roll: 0, pitch: 0, yaw: 0, lastTimestamp: null };
}

function normalizeAngle(angle: number) {
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}

export function updateImuFusion(
  state: ImuFusionState,
  point: ChartDataPoint,
  config: Imu6FusionConfig
): ImuFusionState {
  const { values } = point;
  const ax = values[config.accelXChannel];
  const ay = values[config.accelYChannel];
  const az = values[config.accelZChannel];
  const gyro = [
    values[config.gyroXChannel] - config.gyroBiasX,
    values[config.gyroYChannel] - config.gyroBiasY,
    values[config.gyroZChannel] - config.gyroBiasZ,
  ];
  if (!gyro.every(Number.isFinite)) return state;

  const accelValid = [ax, ay, az].every(Number.isFinite) && Math.hypot(ax, ay, az) > 1e-9;
  if (!state.initialized && !accelValid) return state;

  const rollFromAccel = accelValid ? (Math.atan2(ay, az) * 180) / Math.PI : state.roll;
  const pitchFromAccel = accelValid ? (Math.atan2(-ax, Math.hypot(ay, az)) * 180) / Math.PI : state.pitch;
  if (!state.initialized) {
    return {
      initialized: true,
      roll: rollFromAccel,
      pitch: pitchFromAccel,
      yaw: 0,
      lastTimestamp: point.timestamp,
    };
  }

  const measuredDt = state.lastTimestamp === null ? 0 : (point.timestamp - state.lastTimestamp) / 1000;
  const dt = measuredDt > 0 && measuredDt <= 0.5 ? measuredDt : 1 / config.sampleRateHz;
  const gyroFactor = config.gyroUnit === "rad" ? 180 / Math.PI : 1;
  const predictedRoll = normalizeAngle(state.roll + gyro[0] * gyroFactor * dt);
  const predictedPitch = normalizeAngle(state.pitch + gyro[1] * gyroFactor * dt);
  const alpha = config.filterAlpha;

  return {
    initialized: true,
    roll: accelValid
      ? normalizeAngle(predictedRoll + (1 - alpha) * normalizeAngle(rollFromAccel - predictedRoll))
      : predictedRoll,
    pitch: accelValid
      ? normalizeAngle(predictedPitch + (1 - alpha) * normalizeAngle(pitchFromAccel - predictedPitch))
      : predictedPitch,
    yaw: normalizeAngle(state.yaw + gyro[2] * gyroFactor * dt),
    lastTimestamp: point.timestamp,
  };
}

export function estimateGyroBias(points: ChartDataPoint[], config: Imu6FusionConfig) {
  const valid = points.filter((point) =>
    [point.values[config.gyroXChannel], point.values[config.gyroYChannel], point.values[config.gyroZChannel]].every(
      Number.isFinite
    )
  );
  if (valid.length === 0) return null;
  const sum = valid.reduce(
    (result, point) => ({
      x: result.x + point.values[config.gyroXChannel],
      y: result.y + point.values[config.gyroYChannel],
      z: result.z + point.values[config.gyroZChannel],
    }),
    { x: 0, y: 0, z: 0 }
  );
  return { x: sum.x / valid.length, y: sum.y / valid.length, z: sum.z / valid.length };
}
