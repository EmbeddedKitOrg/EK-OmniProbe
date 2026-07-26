// 行文本搜索的小写缓存。
//
// 日志/终端行对象在 store 里创建后就不再修改，因此可以安全地按对象缓存其小写形式。
// 没有缓存时，只要搜索框非空，每批新数据都会把整个缓冲区（默认上限 10000 行）
// 重新 toLowerCase 一遍——即每秒最多几十万次字符串分配，而真正新增的只有几行。
//
// 用 WeakMap：行被缓冲区裁剪掉之后，缓存条目会随之被回收，不需要手动清理。
const lowerCaseCache = new WeakMap<object, string>();

function getLowerCaseText(line: { text: string }): string {
  const cached = lowerCaseCache.get(line);
  if (cached !== undefined) return cached;
  const lower = line.text.toLowerCase();
  lowerCaseCache.set(line, lower);
  return lower;
}

/**
 * 判断行文本是否包含查询串（大小写不敏感）。
 * @param lowerCaseQuery 已经转成小写的查询串，由调用方在循环外准备好
 */
export function lineMatchesQuery(line: { text: string }, lowerCaseQuery: string): boolean {
  return getLowerCaseText(line).includes(lowerCaseQuery);
}
