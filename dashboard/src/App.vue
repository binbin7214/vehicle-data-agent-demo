<script setup lang="ts">
import { onMounted, onBeforeUnmount, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'

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

// ---------- 底部输入框（假语义解析） ----------
const query = ref('')

function handleQuery() {
  const text = query.value.trim()
  if (!text) return
  if (text.includes('上月')) filters.period = 'lastMonth'
  else if (text.includes('上季度') || text.includes('季度')) filters.period = 'lastQuarter'
  else if (text.includes('上周')) filters.period = 'lastWeek'

  if (text.includes('车型A')) filters.model = 'modelA'
  else if (text.includes('车型B')) filters.model = 'modelB'

  if (text.includes('按周') || text.includes('周销量')) filters.granularity = 'week'
  else if (text.includes('按月') || text.includes('月销量')) filters.granularity = 'month'
  else if (text.includes('按天') || text.includes('日销量')) filters.granularity = 'day'

  ElMessage.success(`已按「${text}」刷新图表（模拟解析）`)
  query.value = ''
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
      <el-input
        v-model="query"
        size="large"
        clearable
        placeholder="说一句话，比如：看上周车型A的销量"
        @keyup.enter="handleQuery"
      >
        <template #append>
          <el-button type="primary" @click="handleQuery">查询</el-button>
        </template>
      </el-input>
    </section>
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
</style>

