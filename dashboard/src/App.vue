<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import { clearHistory, getParseLogs, parseIntent } from './utils/llm'
import type { ParseLogEntry } from './utils/llm'

// ---------- 筛选器 ----------
const modelOptions = [
  { label: '全部车型', value: 'all' },
  { label: '车型A', value: 'modelA' },
  { label: '车型B', value: 'modelB' },
]
const periodOptions = [
  { label: '上周', value: 'lastWeek' },
  { label: '上月', value: 'lastMonth' },
  { label: '上季度', value: 'lastQuarter' },
]
const granularityOptions = [
  { label: '按天', value: 'day' },
  { label: '按周', value: 'week' },
  { label: '按月', value: 'month' },
]
const chartTypeOptions = [
  { label: '柱状图', value: 'bar' },
  { label: '折线图', value: 'line' },
]

const filters = reactive({
  model: 'all',
  period: 'lastWeek',
  granularity: 'day',
  chartType: 'bar',
})

// ---------- 筛选器值 -> 后端枚举映射 ----------
const modelLabel: Record<string, string> = {
  all: '全部车型',
  modelA: '车型A',
  modelB: '车型B',
}
const periodLabel: Record<string, string> = {
  lastWeek: '上周',
  lastMonth: '上月',
  lastQuarter: '上季度',
}
const granularityLabel: Record<string, string> = {
  day: '按天',
  week: '按周',
  month: '按月',
}

// ---------- 图表数据（来自后端接口） ----------
const chartData = ref<{ categories: string[]; values: number[]; title: string }>({
  categories: [],
  values: [],
  title: '',
})
const loading = ref(false)
const loadError = ref('')

async function fetchData() {
  loading.value = true
  loadError.value = ''
  try {
    const resp = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carModel: modelLabel[filters.model],
        dateRange: periodLabel[filters.period],
        granularity: granularityLabel[filters.granularity],
      }),
    })
    if (!resp.ok) {
      throw new Error(`接口返回状态码 ${resp.status}`)
    }
    const data = await resp.json()
    chartData.value = {
      categories: data.categories ?? [],
      values: data.values ?? [],
      title: data.title ?? '',
    }
    renderChart()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : '网络异常'
    ElMessage.error('数据加载失败，请确认后端服务已启动（http://localhost:8000）')
  } finally {
    loading.value = false
  }
}

// ---------- ECharts ----------
const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

function renderChart() {
  if (!chart) return
  const { title, categories, values } = chartData.value
  chart.setOption(
    {
      title: { text: title, left: 'left', textStyle: { fontSize: 15, fontWeight: 600 } },
      grid: { left: 48, right: 24, top: 56, bottom: 32 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: categories, axisTick: { alignWithLabel: true } },
      yAxis: { type: 'value', name: '销量（台）' },
      series: [
        filters.chartType === 'line'
          ? {
              name: '销量',
              type: 'line' as const,
              smooth: true,
              symbolSize: 6,
              itemStyle: { color: '#409eff' },
              data: values,
            }
          : {
              name: '销量',
              type: 'bar' as const,
              barMaxWidth: 32,
              itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
              data: values,
            },
      ],
    },
    true,
  )
}

function resizeChart() {
  chart?.resize()
}

onMounted(() => {
  chart = echarts.init(chartRef.value!)
  fetchData()
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
  chart = null
})

// 数据相关筛选器变化 -> 请求后端；图表类型变化 -> 仅本地重渲染
watch(
  () => [filters.model, filters.period, filters.granularity],
  () => fetchData(),
)
watch(
  () => filters.chartType,
  () => renderChart(),
)

// ---------- 底部输入框（LLM 意图解析） ----------
const query = ref('')
const parsing = ref(false)

const chartTypeLabel: Record<string, string> = {
  bar: '柱状图',
  line: '折线图',
}

// 把 LLM 返回的中文枚举值映射回筛选器的英文 value，非法值时回退为当前值
function matchOption(options: { label: string; value: string }[], label: string, fallback: string) {
  return options.find((opt) => opt.label === label)?.value ?? fallback
}

// 清空多轮对话历史，下一句输入将从全新对话开始解析
function clearConversation() {
  clearHistory()
  ElMessage.success('对话已清空，下一句将重新开始解析')
}

// ---------- 解析日志抽屉 ----------
const logDrawerVisible = ref(false)
const parseLogEntries = ref<ParseLogEntry[]>([])

function openLogDrawer() {
  // getParseLogs 返回旧 -> 新的副本，这里倒序让最新记录显示在最上面
  parseLogEntries.value = getParseLogs().slice().reverse()
  logDrawerVisible.value = true
}

// ---------- AI 解析结果确认（Human-in-the-loop） ----------
const confirmVisible = ref(false)
// 待确认的筛选条件（已做过枚举兜底映射，展示和确认生效的值完全一致）
const pendingIntent = ref<{
  model: string
  period: string
  granularity: string
  chartType: string
} | null>(null)
const pendingQuery = ref('')

function optionLabel(options: { label: string; value: string }[], value: string) {
  return options.find((opt) => opt.value === value)?.label ?? value
}

// 用户点「确认」：才真正把 AI 解析结果应用到筛选器（watch 会自动刷新图表）
function confirmIntent() {
  if (!pendingIntent.value) return
  filters.model = pendingIntent.value.model
  filters.period = pendingIntent.value.period
  filters.granularity = pendingIntent.value.granularity
  filters.chartType = pendingIntent.value.chartType
  confirmVisible.value = false
  ElMessage.success(`已按「${pendingQuery.value}」更新看板`)
  pendingIntent.value = null
}

async function handleQuery() {
  const text = query.value.trim()
  if (!text || parsing.value) return

  parsing.value = true
  try {
    const { intent, invalidFields } = await parseIntent(text, {
      carModel: modelLabel[filters.model],
      dateRange: periodLabel[filters.period],
      granularity: granularityLabel[filters.granularity],
      chartType: chartTypeLabel[filters.chartType],
    })

    // LLM 返回了不在枚举范围内的值（如 carModel 返回"车型C"），已用当前筛选器的值兜底
    if (invalidFields.length) {
      ElMessage.warning(
        `${invalidFields.join('、')}的值不在可选范围内，已用当前筛选器的值替代`,
      )
    }

    // Human-in-the-loop：解析成功后先弹出确认卡片，不直接更新筛选器。
    // 这里先做枚举兜底映射，保证卡片上展示的就是点「确认」后会生效的值。
    pendingIntent.value = {
      model: matchOption(modelOptions, intent.carModel, filters.model),
      period: matchOption(periodOptions, intent.dateRange, filters.period),
      granularity: matchOption(granularityOptions, intent.granularity, filters.granularity),
      chartType: matchOption(chartTypeOptions, intent.chartType, filters.chartType),
    }
    pendingQuery.value = text
    confirmVisible.value = true
    query.value = ''
  } catch (e) {
    if (e instanceof Error && e.message === 'PARSE_FAILED') {
      ElMessage.warning('没听懂，请换个说法试试')
    } else {
      ElMessage.error(e instanceof Error ? e.message : 'AI 解析失败，请稍后再试')
    }
  } finally {
    parsing.value = false
  }
}
</script>

<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <h1 class="dashboard-title">车辆数据看板</h1>
      <span class="dashboard-subtitle">Demo · 接口数据</span>
    </header>

    <!-- 顶部筛选区 -->
    <section class="filter-bar">
      <div class="filter-item">
        <label class="filter-label">车型</label>
        <el-select v-model="filters.model" placeholder="请选择车型" style="width: 160px">
          <el-option
            v-for="opt in modelOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div class="filter-item">
        <label class="filter-label">时间周期</label>
        <el-select v-model="filters.period" placeholder="请选择时间周期" style="width: 160px">
          <el-option
            v-for="opt in periodOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div class="filter-item">
        <label class="filter-label">统计颗粒度</label>
        <el-select
          v-model="filters.granularity"
          placeholder="请选择统计颗粒度"
          style="width: 160px"
        >
          <el-option
            v-for="opt in granularityOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>

      <div class="filter-item">
        <label class="filter-label">图表类型</label>
        <el-select
          v-model="filters.chartType"
          placeholder="请选择图表类型"
          style="width: 160px"
        >
          <el-option
            v-for="opt in chartTypeOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>
    </section>

    <!-- 中间图表区 -->
    <section v-loading="loading" element-loading-text="数据加载中..." class="chart-card">
      <div v-if="loadError" class="chart-error">
        <p class="chart-error-title">数据加载失败</p>
        <p class="chart-error-detail">{{ loadError }}，请确认后端服务已启动（http://localhost:8000）</p>
        <el-button type="primary" size="small" @click="fetchData">重新加载</el-button>
      </div>
      <div ref="chartRef" class="chart-container"></div>
    </section>

    <!-- 底部输入框 -->
    <section class="query-bar">
      <div class="query-row">
        <el-input
          v-model="query"
          size="large"
          clearable
          class="query-input"
          :disabled="parsing"
          placeholder="说一句话，比如：看上周车型A的销量趋势；追问可写：那车型B呢？"
          @keyup.enter="handleQuery"
        >
          <template #append>
            <el-button type="primary" :loading="parsing" @click="handleQuery">
              {{ parsing ? '解析中...' : '查询' }}
            </el-button>
          </template>
        </el-input>
        <el-button size="large" plain :disabled="parsing" @click="clearConversation">
          清空对话
        </el-button>
        <el-button size="large" text type="info" @click="openLogDrawer">解析日志</el-button>
      </div>
    </section>

    <!-- AI 解析结果确认卡片（Human-in-the-loop） -->
    <el-dialog
      v-model="confirmVisible"
      title="AI 解析结果 · 请确认"
      width="420px"
      :close-on-click-modal="false"
    >
      <div v-if="pendingIntent" class="confirm-list">
        <div class="confirm-row">
          <span class="confirm-label">车型</span>
          <span class="confirm-value">{{ optionLabel(modelOptions, pendingIntent.model) }}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">时间周期</span>
          <span class="confirm-value">{{ optionLabel(periodOptions, pendingIntent.period) }}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">统计颗粒度</span>
          <span class="confirm-value">{{
            optionLabel(granularityOptions, pendingIntent.granularity)
          }}</span>
        </div>
        <div class="confirm-row">
          <span class="confirm-label">图表类型</span>
          <span class="confirm-value">{{ optionLabel(chartTypeOptions, pendingIntent.chartType) }}</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmIntent">确认</el-button>
      </template>
    </el-dialog>

    <!-- LLM 解析日志抽屉（最近 10 条） -->
    <el-drawer v-model="logDrawerVisible" title="LLM 解析日志（最近 10 条）" size="480px">
      <div v-if="!parseLogEntries.length" class="log-empty">暂无解析记录</div>
      <div v-for="(log, i) in parseLogEntries" :key="i" class="log-item">
        <div class="log-head">
          <el-tag :type="log.success ? 'success' : 'danger'" size="small">
            {{ log.success ? '成功' : '失败' }}
          </el-tag>
          <span class="log-time">{{ log.time }}</span>
          <span class="log-duration">耗时 {{ log.durationMs }}ms</span>
        </div>
        <div class="log-line">
          <span class="log-label">用户输入：</span>{{ log.userInput }}
        </div>
        <div class="log-label">LLM 原始返回：</div>
        <pre class="log-pre">{{ log.rawContent || log.error }}</pre>
        <div class="log-line">
          <span class="log-label">解析结果：</span>
          {{ log.parsedIntent ? JSON.stringify(log.parsedIntent) : '—' }}
        </div>
        <div v-if="log.invalidFields?.length" class="log-invalid">
          已用默认值兜底：{{ log.invalidFields.join('、') }}
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style>
/* 覆盖脚手架 style.css 中 #app 的 Demo 样式，恢复常规后台布局 */
#app {
  width: 100%;
  border-inline: none;
  text-align: left;
}
</style>

<style scoped>
.dashboard {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 20px 24px 32px;
  box-sizing: border-box;
}

.dashboard-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.dashboard-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}

.dashboard-subtitle {
  font-size: 12px;
  color: #909399;
}

/* 顶部筛选区 */
.filter-bar {
  display: flex;
  align-items: center;
  gap: 24px;
  background: #fff;
  border-radius: 6px;
  padding: 16px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
}

/* 中间图表区 */
.chart-card {
  margin-top: 16px;
  background: #fff;
  border-radius: 6px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

.chart-container {
  width: 100%;
  height: 400px;
}

/* 加载失败提示 */
.chart-error {
  height: 400px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.chart-error-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.chart-error-detail {
  margin: 0 0 8px;
  font-size: 13px;
  color: #909399;
}

/* 底部输入框 */
.query-bar {
  margin-top: 16px;
}

.query-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.query-input {
  flex: 1;
}

/* AI 解析结果确认卡片 */
.confirm-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f5f7fa;
  border-radius: 4px;
  padding: 10px 16px;
}

.confirm-label {
  font-size: 14px;
  color: #909399;
}

.confirm-value {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

/* LLM 解析日志抽屉 */
.log-empty {
  color: #909399;
  font-size: 13px;
  text-align: center;
  padding: 40px 0;
}

.log-item {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.log-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.log-time {
  font-size: 12px;
  color: #909399;
}

.log-duration {
  font-size: 12px;
  color: #909399;
  margin-left: auto;
}

.log-line {
  font-size: 13px;
  color: #303133;
  margin: 4px 0;
  word-break: break-all;
}

.log-label {
  font-size: 12px;
  color: #909399;
}

.log-pre {
  margin: 4px 0;
  padding: 8px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 12px;
  color: #606266;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
}

.log-invalid {
  font-size: 12px;
  color: #e6a23c;
  margin-top: 4px;
}
</style>

