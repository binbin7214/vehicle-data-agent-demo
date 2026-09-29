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

const filters = reactive({
  model: 'all',
  period: 'lastWeek',
  granularity: 'day',
})

// ---------- 假数据生成 ----------
// 基于筛选条件的简单伪随机，保证同一组合下数据稳定、切换筛选后数据变化
function seededRandom(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function hashCode(str: string) {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

const periodPointCount: Record<string, number> = {
  lastWeek: 7,
  lastMonth: 30,
  lastQuarter: 90,
}

const periodName: Record<string, string> = {
  lastWeek: '上周',
  lastMonth: '上月',
  lastQuarter: '上季度',
}
const modelName: Record<string, string> = {
  all: '全部车型',
  modelA: '车型A',
  modelB: '车型B',
}

function buildChartData() {
  const count = periodPointCount[filters.period] ?? 7

  // x 轴：按天显示全部日期，按周/按月做抽样避免过密
  const step = filters.granularity === 'day' ? 1 : filters.granularity === 'week' ? 7 : 30
  const labels: string[] = []
  const values: number[] = []
  const rand = seededRandom(
    hashCode(`${filters.model}-${filters.period}-${filters.granularity}`),
  )
  const base = filters.model === 'all' ? 520 : filters.model === 'modelA' ? 680 : 410

  for (let i = 0; i < count; i++) {
    const isBoundary =
      filters.granularity === 'day' || (i + 1) % step === 0 || i === count - 1
    if (!isBoundary) continue
    if (filters.granularity === 'month') {
      labels.push(`第${Math.floor(i / 30) + 1}月`)
    } else {
      labels.push(`D${i + 1}`)
    }
    values.push(Math.round(base * (0.6 + rand() * 0.8)))
  }

  return {
    title: `${periodName[filters.period]} · ${modelName[filters.model]}销量趋势（${filters.granularity === 'day' ? '按天' : filters.granularity === 'week' ? '按周' : '按月'}）`,
    labels,
    values,
  }
}

// ---------- ECharts ----------
const chartRef = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | null = null

function renderChart() {
  if (!chart) return
  const { title, labels, values } = buildChartData()
  chart.setOption(
    {
      title: { text: title, left: 'left', textStyle: { fontSize: 15, fontWeight: 600 } },
      grid: { left: 48, right: 24, top: 56, bottom: 32 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: labels, axisTick: { alignWithLabel: true } },
      yAxis: { type: 'value', name: '销量（台）' },
      series: [
        {
          name: '销量',
          type: 'bar',
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
  renderChart()
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
  chart = null
})

watch(filters, renderChart)

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
      <span class="dashboard-subtitle">Demo · 假数据</span>
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
    </section>

    <!-- 中间图表区 -->
    <section class="chart-card">
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

/* 底部输入框 */
.query-bar {
  margin-top: 16px;
}
</style>

