/** LLM 解析出的看板筛选意图（中文枚举值） */
export interface Intent {
  carModel: string
  dateRange: string
  granularity: string
  chartType: string
}

/** 当前筛选器的中文值，作为 LLM 解析时未提及字段的默认值 */
export type CurrentFilters = Record<string, string>

/**
 * 调用 LLM 解析用户自然语言意图
 * @throws {Error} 网络错误、模型不可用或 JSON 解析失败时抛出（PARSE_FAILED 表示解析失败）
 */
export function parseIntent(userInput: string, currentFilters: CurrentFilters): Promise<Intent>
