// parseWithRegex 现在会缓存编译好的正则。带 g / y 标志的正则是有状态的
// （保留 lastIndex），如果复用时不复位，从第二行起就会从上次匹配位置继续找，
// 表现为「第一行能解析、后面全部失败」。这里专门守住这个回归。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const server = await createServer({ root, logLevel: "silent", server: { middlewareMode: true } });

try {
  const { parseWithRegex } = await server.ssrLoadModule("/src/lib/parseChartData.ts");

  const pattern = "x=(?<x>-?\\d+(?:\\.\\d+)?),y=(?<y>-?\\d+(?:\\.\\d+)?)";
  const lines = ["x=1,y=2", "x=3.5,y=-4", "x=10,y=20", "x=-7,y=8.25"];
  const expected = [
    { x: 1, y: 2 },
    { x: 3.5, y: -4 },
    { x: 10, y: 20 },
    { x: -7, y: 8.25 },
  ];

  // 无标志：连续多行都应稳定解析
  lines.forEach((text, index) => {
    const result = parseWithRegex(text, pattern, undefined, undefined, 1000 + index);
    assert.equal(result.success, true, `无标志第 ${index} 行应解析成功`);
    assert.deepEqual(result.dataPoint.values, expected[index], `无标志第 ${index} 行数值不对`);
  });

  // g 标志：这是缓存后最容易出错的一档
  lines.forEach((text, index) => {
    const result = parseWithRegex(text, pattern, "g", undefined, 2000 + index);
    assert.equal(result.success, true, `g 标志第 ${index} 行应解析成功（lastIndex 未复位会从这里开始失败）`);
    assert.deepEqual(result.dataPoint.values, expected[index], `g 标志第 ${index} 行数值不对`);
  });

  // y 标志同样有状态
  lines.forEach((text, index) => {
    const result = parseWithRegex(text, pattern, "y", undefined, 3000 + index);
    assert.equal(result.success, true, `y 标志第 ${index} 行应解析成功`);
  });

  // 同一 pattern 换标志必须视作不同缓存项（大小写敏感性会变）
  assert.equal(parseWithRegex("X=5,Y=6", "x=(?<x>\\d+),y=(?<y>\\d+)", undefined).success, false);
  assert.equal(parseWithRegex("X=5,Y=6", "x=(?<x>\\d+),y=(?<y>\\d+)", "i").success, true);

  // 非法表达式不应污染缓存：报错后换成合法表达式仍要能用
  const bad = parseWithRegex("x=1,y=2", "x=(?<x>\\d+", undefined);
  assert.equal(bad.success, false, "非法正则应返回失败而不是抛出");
  assert.equal(parseWithRegex("x=1,y=2", pattern, undefined).success, true, "非法正则之后仍应能正常解析");

  // 超过缓存上限后仍然正确（触发 clear 分支）
  for (let i = 0; i < 40; i += 1) {
    const result = parseWithRegex(`v${i}=${i}`, `v${i}=(?<v>\\d+)`, undefined);
    assert.equal(result.success, true, `第 ${i} 个不同 pattern 应解析成功`);
  }
  assert.deepEqual(parseWithRegex("x=1,y=2", pattern, "g").dataPoint.values, { x: 1, y: 2 }, "缓存清空后应重新编译并正确");

  console.log("正则解析缓存检查通过");
} finally {
  await server.close();
}
