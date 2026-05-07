/**
 * RTT 颜色语义化解析器
 * 支持用户自定义标记语法，如 [red]text[/red] 或 [red]text[/]
 */

export interface ColorTag {
  name: string; // 标记名称，如 "red"
  color?: string; // 文本颜色
  backgroundColor?: string; // 背景色
  fontWeight?: string; // 字体粗细
  fontStyle?: string; // 字体样式
  textDecoration?: string; // 文本装饰
}

export interface ColorParserConfig {
  enabled: boolean; // 是否启用颜色解析
  tagPrefix: string; // 标记前缀，默认 "["
  tagSuffix: string; // 标记后缀，默认 "]"
  closeTag: string; // 关闭标记，默认 "/"
  tags: ColorTag[]; // 自定义标记列表
}

// 默认颜色标记配置
export const DEFAULT_COLOR_TAGS: ColorTag[] = [
  // 基础颜色
  { name: "red", color: "#ef4444" },
  { name: "green", color: "#22c55e" },
  { name: "blue", color: "#3b82f6" },
  { name: "yellow", color: "#eab308" },
  { name: "cyan", color: "#06b6d4" },
  { name: "magenta", color: "#d946ef" },
  { name: "white", color: "#f8fafc" },
  { name: "gray", color: "#94a3b8" },
  { name: "black", color: "#0f172a" },

  // 背景色
  { name: "bg-red", backgroundColor: "#ef4444", color: "#ffffff" },
  { name: "bg-green", backgroundColor: "#22c55e", color: "#ffffff" },
  { name: "bg-blue", backgroundColor: "#3b82f6", color: "#ffffff" },
  { name: "bg-yellow", backgroundColor: "#eab308", color: "#000000" },

  // 样式
  { name: "bold", fontWeight: "bold" },
  { name: "italic", fontStyle: "italic" },
  { name: "underline", textDecoration: "underline" },

  // 语义化标记
  { name: "error", color: "#ef4444", fontWeight: "bold" },
  { name: "warn", color: "#eab308" },
  { name: "info", color: "#3b82f6" },
  { name: "success", color: "#22c55e" },
  { name: "debug", color: "#94a3b8" },
];

export const DEFAULT_PARSER_CONFIG: ColorParserConfig = {
  enabled: true,
  tagPrefix: "[",
  tagSuffix: "]",
  closeTag: "/",
  tags: DEFAULT_COLOR_TAGS,
};

// 解析后的文本片段
export interface TextSegment {
  text: string;
  styles: React.CSSProperties;
}

/**
 * 解析带颜色标记的文本
 * @param text 原始文本
 * @param config 解析配置
 * @returns 解析后的文本片段数组
 */
export function parseColoredText(text: string, config: ColorParserConfig = DEFAULT_PARSER_CONFIG): TextSegment[] {
  if (!config.enabled) {
    return [{ text, styles: {} }];
  }

  const segments: TextSegment[] = [];
  const { tagPrefix, tagSuffix, closeTag, tags } = config;

  // 创建标记名称到样式的映射
  const tagMap = new Map<string, ColorTag>();
  tags.forEach((tag) => tagMap.set(tag.name, tag));

  // 转义正则表达式特殊字符
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = escapeRegex(tagPrefix);
  const suffix = escapeRegex(tagSuffix);

  // 匹配开始标记和结束标记的正则
  // 支持 [tag] 和 [/tag] 或 [/]
  const tagRegex = new RegExp(`${prefix}(/?)(\\w+)${suffix}`, "g");

  let lastIndex = 0;
  let currentStyles: React.CSSProperties = {};
  const styleStack: React.CSSProperties[] = [];

  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const [fullMatch, isClosing, tagName] = match;
    const matchIndex = match.index;

    // 添加标记前的文本
    if (matchIndex > lastIndex) {
      const textBefore = text.substring(lastIndex, matchIndex);
      if (textBefore) {
        segments.push({
          text: textBefore,
          styles: { ...currentStyles },
        });
      }
    }

    if (isClosing === closeTag) {
      // 关闭标记
      if (tagName === "" || styleStack.length > 0) {
        // [/] 或有样式栈时，弹出最近的样式
        currentStyles = styleStack.pop() || {};
      }
    } else {
      // 开始标记
      const tag = tagMap.get(tagName);
      if (tag) {
        // 保存当前样式到栈
        styleStack.push({ ...currentStyles });

        // 应用新样式
        const newStyles: React.CSSProperties = { ...currentStyles };
        if (tag.color) newStyles.color = tag.color;
        if (tag.backgroundColor) newStyles.backgroundColor = tag.backgroundColor;
        if (tag.fontWeight) newStyles.fontWeight = tag.fontWeight;
        if (tag.fontStyle) newStyles.fontStyle = tag.fontStyle;
        if (tag.textDecoration) newStyles.textDecoration = tag.textDecoration;

        currentStyles = newStyles;
      }
    }

    lastIndex = matchIndex + fullMatch.length;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText) {
      segments.push({
        text: remainingText,
        styles: { ...currentStyles },
      });
    }
  }

  // 如果没有任何片段，返回原始文本
  if (segments.length === 0) {
    return [{ text, styles: {} }];
  }

  return segments;
}

/**
 * 保存配置到 localStorage
 */
export function saveColorParserConfig(config: ColorParserConfig) {
  localStorage.setItem("rtt-color-parser-config", JSON.stringify(config));
}

/**
 * 从 localStorage 加载配置
 */
export function loadColorParserConfig(): ColorParserConfig {
  try {
    const saved = localStorage.getItem("rtt-color-parser-config");
    if (saved) {
      const config = JSON.parse(saved);
      // 合并默认配置，确保新增字段有默认值
      return {
        ...DEFAULT_PARSER_CONFIG,
        ...config,
        tags: config.tags || DEFAULT_COLOR_TAGS,
      };
    }
  } catch {
    // 静默处理，使用默认值
  }
  return DEFAULT_PARSER_CONFIG;
}
