/** LLM 解析出的看板筛选意图（中文枚举值） */
export interface Intent {
  carModel: string
  dateRange: string
  granularity: string
  chartType: string
}

/** 当前筛选器的中文值，作为 LLM 解析时未提及/非法字段的默认值 */
export type CurrentFilters = Record<string, string>

/** 一次 LLM 解析的日志记录 */
export interface ParseLogEntry {
  time: string
  userInput: string
  rawContent: string
  parsedIntent: Intent | null
  invalidFields?: string[]
  error?: string
  durationMs: number
  success: boolean
}

/** parseIntent 的返回：解析结果 + 被枚举兜底替代的字段中文名列表 */
export interface ParseResult {
  intent: Intent
  invalidFields: string[]
}

/**
 * 调用 LLM 解析用户自然语言意图（多轮对话：自动携带并维护完整对话历史）
 * @throws {Error} 网络错误、模型不可用或 JSON 解析失败时抛出（PARSE_FAILED 表示解析失败）
 */
export function parseIntent(userInput: string, currentFilters: CurrentFilters): Promise<ParseResult>

/** 清空多轮对话历史，让下一轮从全新对话开始 */
export function clearHistory(): void

/** 获取解析日志（旧 -> 新，最多 10 条），返回副本 */
export function getParseLogs(): ParseLogEntry[]

