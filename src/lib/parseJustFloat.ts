const JUSTFLOAT_TAIL = [0x00, 0x00, 0x80, 0x7f] as const;
const MAX_PENDING_BYTES = 64 * 1024;

export interface JustFloatChunkResult {
  frames: number[][];
  pending: number[];
  invalidFrames: number;
}

export function parseJustFloatChunk(data: number[], pending: number[] = []): JustFloatChunkResult {
  const bytes = pending.concat(data);
  const frames: number[][] = [];
  let invalidFrames = 0;
  let frameStart = 0;
  let cursor = 0;

  while (cursor + JUSTFLOAT_TAIL.length <= bytes.length) {
    if (!matchesTail(bytes, cursor)) {
      cursor += 1;
      continue;
    }

    const payloadLength = cursor - frameStart;
    if (payloadLength > 0 && payloadLength % 4 === 0) {
      frames.push(decodeFloat32Le(bytes, frameStart, cursor));
    } else {
      invalidFrames += 1;
    }

    cursor += JUSTFLOAT_TAIL.length;
    frameStart = cursor;
  }

  let nextPending = bytes.slice(frameStart);
  if (nextPending.length > MAX_PENDING_BYTES) {
    nextPending = nextPending.slice(-(JUSTFLOAT_TAIL.length - 1));
    invalidFrames += 1;
  }

  return { frames, pending: nextPending, invalidFrames };
}

function matchesTail(bytes: number[], offset: number): boolean {
  return JUSTFLOAT_TAIL.every((value, index) => bytes[offset + index] === value);
}

function decodeFloat32Le(bytes: number[], start: number, end: number): number[] {
  const payload = Uint8Array.from(bytes.slice(start, end));
  const view = new DataView(payload.buffer);
  const values: number[] = [];

  for (let offset = 0; offset < payload.byteLength; offset += 4) {
    values.push(view.getFloat32(offset, true));
  }

  return values;
}
