import { FIELD_LABELS, FILTER_ENUMS, SYSTEM_PROMPT } from '../prompts/parseIntent'

// 模型 ID 可通过 .env 的 VITE_ARK_MODEL 覆盖；如报"模型不存在"，
// 通常是需要在火山方舟控制台获取带版本后缀的完整模型 ID（如 deepseek-v4-pro-250715）
const LLM_MODEL = import.meta.env.VITE_ARK_MODEL || 'deepseek-v4-pro'

// ---------- 解析日志（最近 10 条） ----------
const MAX_LOGS = 10
const parseLogs = []

/** 获取解析日志（旧 -> 新），返回副本防止外部直接改动 */
export function getParseLogs() {
  return parseLogs.slice()
}

function addParseLog(entry) {
  parseLogs.push(entry)
  if (parseLogs.length > MAX_LOGS) parseLogs.shift()
  // 暂时输出到 console，后续可接入后端日志存储
  console.log(
    `[LLM 解析日志] ${entry.success ? '成功' : '失败'} · 耗时 ${entry.durationMs}ms`,
    entry,
  )
}

// 从 LLM 返回文本中提取 JSON，依次尝试四种策略：
// 1. 纯 JSON 字符串 -> 直接 JSON.parse
// 2. markdown 代码块包裹（```json ... ```）-> 去掉围栏后解析
// 3. 夹杂解释文字 -> 正则取第一个 { 到最后一个 } 之间的内容
// 4. 以上全失败 -> 再试无嵌套的最小对象，仍失败返回 null
function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const candidates = [cleaned]
  const greedy = cleaned.match(/\{[\s\S]*\}/) // 贪婪：第一个 { 到最后一个 }
  if (greedy) candidates.push(greedy[0])
  const lazy = cleaned.match(/\{[^{}]*\}/) // 非贪婪：无嵌套的最小对象
  if (lazy) candidates.push(lazy[0])
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      // 只要纯对象，数组和原始值都算解析失败
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null
}

// 校验并兜底：字段缺失或值不在枚举范围内（如 carModel 返回了"车型C"），
// 用当前筛选器的值替代，并记录被兜底的字段中文名供上层提示用户
function validateIntent(intent, currentFilters) {
  const validated = {}
  const invalidFields = []
  for (const [field, enumValues] of Object.entries(FILTER_ENUMS)) {
    const value = intent[field]
    if (typeof value === 'string' && enumValues.includes(value)) {
      validated[field] = value
    } else {
      validated[field] = currentFilters[field]
      invalidFields.push(FIELD_LABELS[field])
    }
  }
  return { intent: validated, invalidFields }
}

// ---------- 多轮对话历史 ----------
// 记录所有用户输入和 LLM 返回，采用 OpenAI 的 messages 格式
// （不含 system 消息，system 每次请求时单独放在最前面）
const conversationHistory = []

/** 清空多轮对话历史，让下一轮从全新对话开始 */
export function clearHistory() {
  conversationHistory.length = 0
}

/**
 * 调用 LLM 解析用户自然语言意图（支持多轮对话，自动携带完整历史）
 * @param {string} userInput 用户输入的自然语言
 * @param {object} currentFilters 当前筛选器的中文值 { carModel, dateRange, granularity, chartType }
 * @returns {Promise<{intent: object, invalidFields: string[]}>}
 *   intent：解析后的筛选条件（中文枚举值，非法值已用 currentFilters 兜底）
 *   invalidFields：被兜底替代的字段中文名列表（如 ['车型']），供上层提示用户
 * @throws {Error} 网络错误或 JSON 解析失败时抛出，message 可直接展示给用户
 */
export async function parseIntent(userInput, currentFilters) {
  const startTime = Date.now()
  const userContent = `用户输入：${userInput}\n当前筛选器的值：${JSON.stringify(currentFilters)}`
  const logBase = {
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    userInput,
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    // 完整历史一起传给 LLM，让它能理解"那车型B呢？"这类追问
    ...conversationHistory,
    { role: 'user', content: userContent },
  ]

  let resp
  try {
    resp = await fetch('/llm/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature: 0,
        // 火山方舟的 DeepSeek 模型支持 JSON 输出模式，约束模型只吐合法 JSON
        response_format: { type: 'json_object' },
      }),
    })
  } catch (e) {
    addParseLog({
      ...logBase,
      rawContent: '',
      parsedIntent: null,
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - startTime,
      success: false,
    })
    throw new Error('无法连接 AI 服务，请检查网络或代理配置')
  }

  if (!resp.ok) {
    let detail = ''
    try {
      detail = (await resp.json())?.error?.message ?? ''
    } catch {
      // 忽略响应体解析失败
    }
    addParseLog({
      ...logBase,
      rawContent: '',
      parsedIntent: null,
      error: `HTTP ${resp.status}：${detail}`,
      durationMs: Date.now() - startTime,
      success: false,
    })
    if (resp.status === 404 || /model|模型/i.test(detail)) {
      throw new Error(
        `AI 模型不可用（${LLM_MODEL}），请在火山方舟控制台确认完整模型 ID（例如 deepseek-v4-pro-250715），并更新 .env 中的 VITE_ARK_MODEL`,
      )
    }
    throw new Error(`AI 服务返回错误（${resp.status}）${detail ? `：${detail}` : ''}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  const durationMs = Date.now() - startTime

  const parsed = extractJson(content)
  if (!parsed) {
    // 按需求要求：全部提取策略都失败时，让上层展示友好提示
    addParseLog({
      ...logBase,
      rawContent: content,
      parsedIntent: null,
      error: 'JSON 提取失败（纯 JSON / 代码块 / 正则提取均未成功）',
      durationMs,
      success: false,
    })
    throw new Error('PARSE_FAILED')
  }

  const { intent, invalidFields } = validateIntent(parsed, currentFilters)

  addParseLog({
    ...logBase,
    rawContent: content,
    parsedIntent: intent,
    invalidFields,
    durationMs,
    success: true,
  })

  // 解析成功才写入历史，避免把失败轮次带进后续上下文
  conversationHistory.push({ role: 'user', content: userContent })
  conversationHistory.push({ role: 'assistant', content: JSON.stringify(intent) })

  return { intent, invalidFields }
}
