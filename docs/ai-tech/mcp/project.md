# MCP 实战案例

> 通过一个完整的 MCP 天气查询助手项目，串联 Server 开发、Client 开发、工具注册与 LLM 集成，展示端到端 Node.js 实现。

## 概述

本项目构建一个**天气查询 MCP 应用**，包含：

- **MCP Server**：提供天气查询、城市搜索、空气质量查询三个工具
- **MCP Client**：连接 Server，将工具转为 LLM 可用的 Function Calling 格式
- **LLM Agent**：接收用户自然语言输入，自动调用 MCP 工具获取天气信息

## 项目结构

```
mcp-weather-project/
├── server/
│   ├── tools.js              # 工具 Schema 定义
│   ├── executor.js           # 工具执行器
│   ├── mcpServer.js          # MCP Server 核心类
│   └── transport.js          # HTTP + SSE 传输层
├── client/
│   ├── mcpClient.js          # MCP Client 核心类
│   └── agentWithMcp.js       # LLM Agent 集成
├── routes/
│   └── chatRouter.js         # 对话路由
├── utils/
│   └── streamUtils.js        # SSE 流式响应工具
├── app.js                    # 应用入口
├── package.json
└── .env
```

## 第一步：Server 端工具定义

- server/tools.js

```js
export const tools = [
  {
    name: 'get_weather',
    description: '查询指定城市的实时天气信息，包括温度、湿度、风速、天气状况',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称，如"北京"、"上海"' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'], description: '温度单位' },
      },
      required: ['city'],
    },
  },
  {
    name: 'search_city',
    description: '根据关键词搜索城市，返回匹配的城市列表和城市 ID',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: '城市名关键词，支持模糊搜索' },
        limit: { type: 'number', description: '返回数量上限', default: 5 },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'get_air_quality',
    description: '查询指定城市的空气质量指数（AQI）和主要污染物',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称' },
      },
      required: ['city'],
    },
  },
]
```

## 第二步：Server 端工具执行器

- server/executor.js

```js
// 模拟天气数据（生产环境接入真实天气 API）
const weatherDB = {
  北京: { temperature: 22, humidity: 45, wind: '北风 3级', condition: '晴' },
  上海: { temperature: 26, humidity: 70, wind: '东南风 2级', condition: '多云' },
  深圳: { temperature: 30, humidity: 80, wind: '西南风 3级', condition: '阵雨' },
  成都: { temperature: 24, humidity: 55, wind: '无持续风向', condition: '阴' },
}

const aqiDB = {
  北京: { aqi: 65, level: '良', primaryPollutant: 'PM2.5' },
  上海: { aqi: 48, level: '优', primaryPollutant: '无' },
  深圳: { aqi: 35, level: '优', primaryPollutant: '无' },
  成都: { aqi: 82, level: '良', primaryPollutant: 'PM10' },
}

export async function executeTool(name, args) {
  switch (name) {
    case 'get_weather':
      return getWeather(args.city, args.unit)
    case 'search_city':
      return searchCity(args.keyword, args.limit || 5)
    case 'get_air_quality':
      return getAirQuality(args.city)
    default:
      throw new Error(`未知工具: ${name}`)
  }
}

function getWeather(city, unit = 'celsius') {
  const data = weatherDB[city]
  if (!data) return { error: `未找到城市 "${city}" 的天气数据，请使用 search_city 搜索可用城市` }

  const temp =
    unit === 'fahrenheit' ? Math.round((data.temperature * 9) / 5 + 32) : data.temperature

  return {
    city,
    temperature: temp,
    unit: unit === 'fahrenheit' ? '°F' : '°C',
    humidity: `${data.humidity}%`,
    wind: data.wind,
    condition: data.condition,
    updateTime: new Date().toISOString(),
  }
}

function searchCity(keyword, limit) {
  const allCities = Object.keys(weatherDB)
  const matched = allCities.filter((c) => c.includes(keyword))
  return {
    keyword,
    cities: matched.slice(0, limit).map((name, i) => ({ id: i + 1, name })),
    total: matched.length,
  }
}

function getAirQuality(city) {
  const data = aqiDB[city]
  if (!data) return { error: `未找到城市 "${city}" 的空气质量数据` }
  return { city, ...data, updateTime: new Date().toISOString() }
}
```

## 第三步：应用入口

- app.js

```js
import express from 'express'
import chatRouter from './routes/chatRouter.js'
import 'dotenv/config'

// 启动 MCP Server
import './server/transport.js'

const app = express()
app.use(express.json())

// 对话路由
app.use('/api', chatRouter)

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MCP 天气查询助手',
    mcpServer: process.env.MCP_SERVER_URL || 'http://localhost:3001',
    timestamp: new Date().toISOString(),
  })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`应用已启动: http://localhost:${PORT}`)
  console.log('  POST /api/chat  - 天气查询对话')
  console.log('  GET  /health     - 健康检查')
})
```

## 第四步：对话路由（流式 SSE）

- routes/chatRouter.js

```js
import express from 'express'
import agentWithMcp from '../client/agentWithMcp.js'
import { createStreamRespose } from '../utils/streamUtils.js'

const router = express.Router()

// 初始化时连接 MCP Server
let initialized = false
async function ensureConnected() {
  if (!initialized) {
    await agentWithMcp.connect()
    initialized = true
  }
}

router.post('/chat', async (req, res) => {
  const { message } = req.body
  if (!message) {
    return res.status(400).json({ success: false, error: '缺少 message 参数' })
  }

  await ensureConnected()

  const stream = createStreamRespose(res)

  try {
    const result = await agentWithMcp.chat(message)
    stream.send({ type: 'chunk', content: result.reply })
    stream.send({ type: 'complete', data: result })
  } catch (err) {
    stream.send({ type: 'error', message: err.message })
  }

  stream.end()
})

export default router
```

## 第五步：前端调用示例

```js
import { fetchStream } from '../utils/request'

// 前端天气查询对话
async function askWeather(question) {
  fetchStream(
    'chat',
    { message: question },
    (chunk) => {
      // 实时渲染 AI 回复
      appendToChat(chunk)
    },
    () => {
      console.log('查询完成')
    },
    (err) => {
      console.error('查询失败:', err)
    },
  )
}

// 使用示例
askWeather('北京今天天气怎么样？')
askWeather('上海和深圳哪个空气质量更好？')
```

## 运行方式

```bash
# 1. 安装依赖
npm install express @langchain/openai @langchain/core dotenv

# 2. 配置环境变量
# .env 文件：
# MODEL_PROVIDER=DEEPSEEK
# DEEPSEEK_API_KEY=sk-xxx
# DEEPSEEK_BASE_URL=https://api.deepseek.com
# DEEPSEEK_MODEL=deepseek-chat
# MCP_SERVER_URL=http://localhost:3001
# PORT=3000

# 3. 启动服务
node app.js
```

## 测试验证

```bash
# 测试 MCP Server 健康检查
curl http://localhost:3001/health

# 测试 MCP Server 工具列表
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# 测试天气查询
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"北京今天天气怎么样？"}'
```

## 上线建议

- 将天气数据替换为真实 API（如和风天气、OpenWeatherMap）
- 添加 API Key 认证保护 MCP Server 端点
- 对工具调用做速率限制，防止滥用
- 接入日志系统，记录工具调用耗时和成功率
- 支持多 MCP Server：Client 可同时连接多个 Server 聚合工具
