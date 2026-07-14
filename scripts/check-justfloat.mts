import assert from "node:assert/strict";
import { parseJustFloatChunk } from "../src/lib/parseJustFloat.ts";

const tail = [0x00, 0x00, 0x80, 0x7f];

function frame(...values: number[]): number[] {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return [...bytes, ...tail];
}

const splitPacket = frame(1.25, -2.5);
const splitAt = splitPacket.length - 2;
const first = parseJustFloatChunk(splitPacket.slice(0, splitAt));
assert.equal(first.frames.length, 0);
const second = parseJustFloatChunk(splitPacket.slice(splitAt), first.pending);
assert.deepEqual(second.frames, [[1.25, -2.5]]);

const joined = parseJustFloatChunk([...frame(3), ...frame(4, 5)]);
assert.deepEqual(joined.frames, [[3], [4, 5]]);
assert.equal(joined.pending.length, 0);

const tenChannels = Array.from({ length: 10 }, (_, index) => index + 0.5);
assert.deepEqual(parseJustFloatChunk(frame(...tenChannels)).frames, [tenChannels]);

const malformed = parseJustFloatChunk([0x01, 0x02, ...tail]);
assert.equal(malformed.frames.length, 0);
assert.equal(malformed.invalidFrames, 1);

console.log("JustFloat 流式解析检查通过");
