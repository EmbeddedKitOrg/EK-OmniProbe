// src/lib/storage.ts
// localStorage 读写封装，统一错误处理

/** 从 localStorage 读取 JSON 数据，解析失败时返回默认值。
 *  返回值为 defaultValue 与解析结果的浅合并，保证缺失字段使用默认值填充。
 */
export function loadFromStorage<T extends object>(key: string, defaultValue: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      return { ...defaultValue, ...JSON.parse(saved) } as T;
    }
  } catch {
    // 静默处理，使用默认值
  }
  return defaultValue;
}

/** 将数据序列化为 JSON 存入 localStorage，失败时静默忽略 */
export function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 静默处理
  }
}

/** 从 localStorage 读取枚举字符串，不在白名单时返回默认值 */
export function loadStringFromStorage<T extends string>(
  key: string,
  allowedValues: readonly T[],
  defaultValue: T
): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved && (allowedValues as readonly string[]).includes(saved)) {
      return saved as T;
    }
  } catch {
    // 静默处理
  }
  return defaultValue;
}

/** 从 localStorage 读取数值，并通过校验函数验证，失败时返回默认值 */
export function loadNumberFromStorage(
  key: string,
  defaultValue: number,
  validate: (n: number) => boolean = () => true
): number {
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      const n = parseFloat(saved);
      if (!isNaN(n) && validate(n)) {
        return n;
      }
    }
  } catch {
    // 静默处理
  }
  return defaultValue;
}

/** 将数值存入 localStorage，以字符串形式保存，失败时静默忽略 */
export function saveNumberToStorage(key: string, value: number): void {
  try {
    localStorage.setItem(key, value.toString());
  } catch {
    // 静默处理
  }
}

/** 将字符串直接存入 localStorage，失败时静默忽略 */
export function saveStringToStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 静默处理
  }
}
