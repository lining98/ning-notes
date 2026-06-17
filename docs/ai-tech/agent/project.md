# Agent 实战项目

> 通过一个完整的智能客服 Agent 项目，串联架构、工具调用、记忆、规划与 ReAct 模式，展示端到端 Node.js 实现。

## 概述

本项目构建一个**智能客服 Agent**，支持：

- 自动识别用户意图（售前咨询 / 售后工单 / 投诉）
- 调用工具查询知识库、创建工单、查询订单
- 多轮对话记忆，记住用户上下文
- ReAct 模式推理，可解释的思考过程
- 流式 SSE 输出，实时打字效果

## 项目结构

```
agent-project/
├── definitions/
│   ├── tools.js              # 工具 Schema 定义
│   └── agents.js             # Agent 角色定义（支持多 Agent）
├── executors/
│   └── toolExecutor.js       # 工具注册与执行
├── services/
│   ├── agentService.js       # Agent 主循环（ReAct）
│   ├── memoryService.js      # 短期/长期/检索记忆
│   ├── plannerService.js     # 规划服务
│   └── coordinatorService.js # 多 Agent 协调器
├── routes/
│   ├── agentRouter.js        # Agent 对话路由
│   ├── memoryRouter.js       # 记忆管理路由
│   └── toolRouter.js         # 工具管理路由
├── utils/
│   └── streamUtils.js        # SSE 流式响应工具
└── app.js                    # 应用入口
```

## 第一步：工具定义

- definitions/tools.js

```js
export const toolDefinitions = [
  {
    name: 'search_knowledge_base',
    description: '搜索客服知识库，查找产品文档、FAQ 和解决方案',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        category: { type: 'string', description: '分类：product/faq/troubleshooting' },
      },
      required: ['query'],
    },
    riskLevel: 'low',
  },
  {
    name: 'create_ticket',
    description: '创建售后工单，记录用户问题并分配处理人',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '工单标题' },
        description: { type: 'string', description: '问题详细描述' },
        priority: { type: 'string', description: '优先级：low/medium/high/urgent' },
        userId: { type: 'string', description: '用户 ID' },
      },
      required: ['title', 'description', 'priority'],
    },
    riskLevel: 'medium',
  },
  {
    name: 'query_order',
    description: '查询用户订单状态和详情',
    parameters: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: '订单号' },
        userId: { type: 'string', description: '用户 ID' },
      },
      required: ['orderId'],
    },
    riskLevel: 'low',
  },
]
```

## 第二步：工具执行器

- executors/toolExecutor.js

```js
import { toolDefinitions } from '../definitions/tools.js'

const toolRegistry = new Map()

// 搜索知识库
toolRegistry.set('search_knowledge_base', async (args) => {
  const { query, category } = args
  // 模拟知识库检索（生产环境接入向量检索）
  const kb = [
    {
      id: 1,
      title: '如何重置密码',
      content: '请前往设置 → 账号安全 → 修改密码...',
      category: 'faq',
    },
    {
      id: 2,
      title: '退款政策',
      content: '7天内无条件退款，超过7天需人工审核...',
      category: 'product',
    },
    {
      id: 3,
      title: 'App 闪退解决方案',
      content: '请尝试清除缓存或重新安装...',
      category: 'troubleshooting',
    },
  ]

  let results = kb.filter((item) => item.title.includes(query) || item.content.includes(query))
  if (category) results = results.filter((item) => item.category === category)

  return { results, total: results.length }
})

// 创建工单
toolRegistry.set('create_ticket', async (args) => {
  const ticketId = 'TICKET-' + Date.now()
  return {
    ticketId,
    status: 'created',
    assignedTo: '客服一组',
    estimatedResponse: '2小时内',
    ...args,
  }
})

// 查询订单
toolRegistry.set('query_order', async (args) => {
  const { orderId } = args
  return {
    orderId,
    status: '已发货',
    product: '智能音箱 Pro',
    amount: 299,
    createdAt: '2026-06-15',
    estimatedDelivery: '2026-06-20',
  }
})

export async function executeTool(name, args, timeout = 10000) {
  if (!toolRegistry.has(name)) {
    return { error: `未知工具: ${name}` }
  }
  try {
    const fn = toolRegistry.get(name)
    const result = await Promise.race([
      fn(args),
      new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), timeout)),
    ])
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err.message }
  }
}

export function getToolCapabilities() {
  return toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}
```

## 第三步：应用入口

- app.js

```js
import express from 'express'
import agentRouter from './routes/agentRouter.js'
import memoryRouter from './routes/memoryRouter.js'
import toolRouter from './routes/toolRouter.js'
import 'dotenv/config'

const app = express()
app.use(express.json())

// 路由注册
app.use('/api/agent', agentRouter) // Agent 对话
app.use('/api/memory', memoryRouter) // 记忆管理
app.use('/api/tools', toolRouter) // 工具管理

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Agent 服务已启动: http://localhost:${PORT}`)
  console.log('API 文档:')
  console.log('  POST /api/agent/chat  - Agent 对话（SSE 流式）')
  console.log('  GET  /api/memory/:userId - 获取用户记忆')
  console.log('  GET  /api/tools       - 获取可用工具列表')
})
```

## 第四步：Agent 对话路由

- routes/agentRouter.js

```js
import express from 'express'
import reactAgentService from '../services/reactAgentService.js'
import { createStreamRespose } from '../utils/streamUtils.js'

const router = express.Router()

// 流式 Agent 对话
router.post('/chat', async (req, res) => {
  const { input, sessionId } = req.body
  if (!input) {
    return res.status(400).json({ success: false, error: '缺少 input 参数' })
  }

  const stream = createStreamRespose(res)

  const result = await reactAgentService.run(input, (event) => {
    stream.send(event)
  })

  stream.send({ type: 'complete', data: result })
  stream.end()
})

export default router
```

## 第五步：前端调用示例

```js
// 前端流式调用 Agent
import { fetchStream } from '../utils/request'

async function chatWithAgent(userMsg, sessionId) {
  let thinking = ''
  let answer = ''

  fetchStream(
    'agent/chat',
    { input: userMsg, sessionId },
    (chunk) => {
      // 实时渲染思考过程或最终答案
      if (chunk.type === 'chunk') {
        answer += chunk.content
        updateUI(answer)
      } else if (chunk.type === 'tool_call') {
        showThinking(`正在调用 ${chunk.tool}...`)
      }
    },
    () => console.log('Agent 完成'),
    (err) => console.error('Agent 错误:', err),
  )
}
```

## 测试建议

- 单元测试：对每个工具函数 Mock 外部依赖
- 集成测试：模拟完整对话流程，验证 ReAct 循环
- 回归测试：建立测试用例集，确保工具调用正确性
- 监控指标：推理步数、工具调用耗时、成功率

## 上线建议

- 工具调用加入完整的审计日志
- 高风险操作（创建工单、发送通知）需二次确认
- 设置每日调用限额，防止滥用
- 定期分析 Agent 推理 trace，优化系统提示词
