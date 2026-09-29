import { SYSTEM_PROMPT } from '../prompts/parseIntent'

// 模型 ID 可通过 .env 的 VITE_ARK_MODEL 覆盖；如报"模型不存在"，
// 通常是需要在火山方舟控制台获取带版本后缀的完整模型 ID（如 deepseek-v4-pro-250715）
const LLM_MODEL = import.meta.env.VITE_ARK_MODEL || 'deepseek-v4-pro'

// 从 LLM 返回文本中提取 JSON（兜底：去掉 markdown 代码块、抓取第一个 {...} 片段）
function extractJson(text) {
  const cleaned = text.replace(/```(?:json)?/g, '').trim()
  const candidates = []
  const braceMatch = cleaned.match(/\{[\s\S]*\}/)
  if (braceMatch) candidates.push(braceMatch[0])
  candidates.push(cleaned)
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null
}

/**
 * 调用 LLM 解析用户自然语言意图
 * @param {string} userInput 用户输入的自然语言
 * @param {object} currentFilters 当前筛选器的中文值 { carModel, dateRange, granularity, chartType }
 * @returns {Promise<object>} 解析后的筛选条件 { carModel, dateRange, granularity, chartType }（中文枚举值）
 * @throws {Error} 网络错误或 JSON 解析失败时抛出，message 可直接展示给用户
 */
export async function parseIntent(userInput, currentFilters) {
  const userContent = `用户输入：${userInput}\n当前筛选器的值：${JSON.stringify(currentFilters)}`

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
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        // 火山方舟的 DeepSeek 模型支持 JSON 输出模式，约束模型只吐合法 JSON
        response_format: { type: 'json_object' },
      }),
    })
  } catch {
    throw new Error('无法连接 AI 服务，请检查网络或代理配置')
  }

  if (!resp.ok) {
    let detail = ''
    try {
      detail = (await resp.json())?.error?.message ?? ''
    } catch {
      // 忽略响应体解析失败
    }
    if (resp.status === 404 || /model|模型/i.test(detail)) {
      throw new Error(
        `AI 模型不可用（${LLM_MODEL}），请在火山方舟控制台确认完整模型 ID（例如 deepseek-v4-pro-250715），并更新 .env 中的 VITE_ARK_MODEL`,
      )
    }
    throw new Error(`AI 服务返回错误（${resp.status}）${detail ? `：${detail}` : ''}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content ?? ''

  const intent = extractJson(content)
  if (!intent || typeof intent !== 'object') {
    // 按需求要求：直接解析和正则提取都失败时，让上层展示友好提示
    throw new Error('PARSE_FAILED')
  }

  return intent
}
