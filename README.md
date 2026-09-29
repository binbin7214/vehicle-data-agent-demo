# 车辆数据看板 Agent

一个用自然语言控制数据看板的前端 Agent Demo。用户输入一句话（如"看上周车型A的销量趋势"），Agent 自动解析意图，联动筛选器、刷新图表。

## 项目背景

B 端数据看板通常有多个筛选维度（车型、时间周期、统计颗粒度、图表类型），运营每次分析数据都要手动点很多次筛选器，效率低且容易出错。

本项目尝试用 LLM 作为"意图解析层"，让用户用一句话完成筛选和图表切换，把重复操作交给 Agent。

## 架构

用户输入自然语言
        ↓
前端 Agent（火山方舟 LLM）
  - 理解意图
  - 输出结构化 JSON：
    {
      carModel: "车型A",
      dateRange: "上周",
      granularity: "按天",
      chartType: "折线图"
    }
        ↓
前端联动
  - 筛选器自动更新
  - 调后端接口
  - 图表自动切换类型并刷新
        ↓
后端（FastAPI + Mock 数据）
  - 接收筛选条件
  - 返回 mock 数据

## 技术栈

前端：
- Vue 3 + Vite
- ECharts（图表渲染）
- Element Plus（筛选器组件）

后端：
- Python 3.10+
- FastAPI
- Uvicorn

LLM：
- 火山方舟（Volcengine Ark）
- 模型：DeepSeek-V4-Pro
- 兼容 OpenAI 接口格式

## 📁 项目结构

vehicle-data-agent-demo/
├── backend/
│   ├── main.py
│   └── requirements.txt
├── src/
│   ├── App.vue
│   ├── utils/
│   │   └── llm.js
│   └── prompts/
│       └── parseIntent.js
├── .env
├── .env.example
├── vite.config.js
└── README.md

## 🚀 快速开始

### 1. 安装前端依赖

前置条件：已安装 Node.js 18+，命令行输入 node -v 能看到版本号。

npm install

如果下载慢，换淘宝镜像：
npm config set registry https://registry.npmmirror.com
npm install

### 2. 配置环境变量

在项目根目录创建 .env 文件，内容：

VITE_ARK_API_KEY=你的火山方舟API Key

API Key 获取地址：https://console.volcengine.com/ark/region:ark+cn-beijing/apikey

### 3. 启动后端

前置条件：已安装 Python 3.10+，安装时务必勾选 "Add Python to PATH"。命令行输入 python --version 能看到版本号。

第一步：进入后端目录
cd backend

第二步：安装依赖
python -m pip install fastapi uvicorn

如果下载慢，换清华镜像：
python -m pip install fastapi uvicorn -i https://pypi.tuna.tsinghua.edu.cn/simple

第三步：启动后端服务
python -m uvicorn main:app --reload --port 8000

看到以下输出说明启动成功：
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Started reloader process

第四步：验证后端
浏览器打开 http://localhost:8000/openapi.json
能看到 JSON 格式的接口定义，说明后端跑通了。

注意：http://localhost:8000/docs 页面可能因为 CDN 加载失败而白屏，这是正常现象，不影响接口功能。用 /openapi.json 验证即可。

### 4. 启动前端

第一步：回到项目根目录
dashboard目录中

第二步：启动前端
npm run dev

看到以下输出说明启动成功：
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/

浏览器打开 http://localhost:5173 即可。

### 5. 两个服务都要开着

调试时必须同时开两个终端：
- 终端 1：跑后端
- 终端 2：跑前端

关掉任何一个，前后端联调都会失败。

## 💡 核心功能

### 1. 手动筛选
顶部四个筛选器：车型、时间周期、统计颗粒度、图表类型。手动修改任意筛选器，图表会自动刷新。

### 2. 自然语言控制
底部输入框输入自然语言，点击"查询"，Agent 自动解析意图并联动整个看板。

示例：
- 输入："看上周车型A的销量趋势" → 自动切换到车型A / 上周 / 按天 / 折线图
- 输入："换成柱状图" → 只改图表类型，其他条件不变
- 输入："看看最近的数据" → 使用当前筛选器的值作为默认

### 3. 结构化输出
LLM 返回固定 JSON 格式：
{
  "carModel": "全部车型 | 车型A | 车型B",
  "dateRange": "上周 | 上月 | 上季度",
  "granularity": "按天 | 按周 | 按月",
  "chartType": "柱状图 | 折线图"
}

### 4. 错误兜底
LLM 返回的 JSON 解析失败时，用正则从文本中提取；仍失败则提示"没听懂，请换个说法试试"。

## 🔧 关键技术点

1. 火山方舟 API 代理
前端直接调火山方舟 API 会有 CORS 问题，在 vite.config.js 里配置代理，把 /llm 开头的请求转发到 https://ark.cn-beijing.volces.com/api/v3

2. API Key 安全
Key 放在 .env 文件里，通过 import.meta.env.VITE_ARK_API_KEY 读取，不硬编码在代码里。.env 加入 .gitignore，避免提交到 Git。

3. LLM 输出稳定性
System Prompt 里明确要求"只输出 JSON，不要任何解释"，并在用户消息里带上当前筛选器的值作为默认值参考。

4. ECharts 内存管理
图表切换类型时，先 dispose() 旧实例，再 init() 新实例，避免内存泄漏。

## ⚠️ 踩坑记录

1. 火山方舟 Base URL 有两个
- /api/v3：普通 API，按量计费
- /api/coding/v3：Coding Plan 专属，走套餐额度
用错了会扣错账户，本项目用的是 /api/v3

2. Vite 环境变量不会热更新
改完 .env 后必须重启 npm run dev。

3. FastAPI 的 /docs 页面可能白屏
因为 Swagger UI 依赖外部 CDN，国内网络可能加载失败。用 /openapi.json 验证接口即可。

4. 筛选器联动循环触发
用标志位区分"Agent 触发的更新"和"用户手动触发的更新"，避免循环。

## 📈 后续规划

- 多轮对话：用户追问"那车型B呢？"，Agent 自动推断其他条件不变
- 解析结果确认：展示 LLM 理解的筛选条件，让用户确认
- RAG：让 Agent 能查项目里的指标定义
- 权限控制：不同角色只能查权限内的数据

## 📄 License

MIT

