# Multi-Agent

> 深入介绍多 Agent 协作系统的设计模式与 Node.js 实现，涵盖中心化协调器、Agent 注册、任务分发与消息路由。

## 概述

Multi-Agent 系统由多个具备不同能力的 Agent 组成，通过协作完成单个 Agent 难以处理的复杂任务。

典型场景：

- 软件开发：需求分析 Agent + 编码 Agent + 测试 Agent + 文档 Agent
- 智能客服：路由 Agent + 售前 Agent + 售后 Agent + 投诉 Agent
- 数据分析：数据采集 Agent + 清洗 Agent + 分析 Agent + 可视化 Agent

两种协作模式：

| 模式         | 原理                         | 优点             | 缺点                   |
| ------------ | ---------------------------- | ---------------- | ---------------------- |
| 中心化协调   | 一个 Coordinator 分配任务    | 状态可控、易调试 | 单点瓶颈               |
| 去中心化协作 | Agent 间通过消息总线自主协作 | 高扩展性         | 调试困难、一致性难保证 |

## Node 示例（中心化协调器）

### Agent 定义与注册

- definitions/agents.js

```js
// 定义不同角色的 Agent，每个 Agent 有专属的系统提示和工具集
export const agentDefinitions = [
  {
    name: 'researcher',
    role: '研究员',
    description: '擅长信息检索、资料收集和数据分析',
    systemPrompt: '你是一个信息研究员，擅长搜索和分析信息。请用中文回答。',
    tools: ['web_search', 'database_query'],
    outputFormat: 'markdown',
  },
  {
    name: 'coder',
    role: '程序员',
    description: '擅长编写代码、调试和代码审查',
    systemPrompt: '你是一个资深程序员，请提供可运行的代码示例和详细解释。',
    tools: ['web_search', 'code_executor'],
    outputFormat: 'code',
  },
  {
    name: 'reviewer',
    role: '审核员',
    description: '擅长审核内容质量、发现问题和提出改进建议',
    systemPrompt: '你是一个内容审核员，请仔细审查内容并指出问题和改进建议。',
    tools: [],
    outputFormat: 'markdown',
  },
  {
    name: 'writer',
    role: '写作者',
    description: '擅长撰写文档、报告和总结',
    systemPrompt: '你是一个专业写作者，请用清晰专业的语言撰写内容。',
    tools: ['web_search'],
    outputFormat: 'markdown',
  },
]
```

### 协调器服务

- services/coordinatorService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import { agentDefinitions } from '../definitions/agents.js'
import { executeTool } from '../executors/toolExecutor.js'
import 'dotenv/config'

class CoordinatorService {
  constructor() {
    this.llm = null
    this.agents = new Map()
    this.initLLM()
    this.registerAgents()
  }

  initLLM() {
    const provider = process.env.MODEL_PROVIDER
    let apiKey, baseURL, model
    if (provider === 'SILICONFLOW') {
      apiKey = process.env.SILICONFLOW_API_KEY
      baseURL = process.env.SILICONFLOW_BASE_URL
      model = process.env.SILICONFLOW_MODEL
    } else if (provider === 'DEEPSEEK') {
      apiKey = process.env.DEEPSEEK_API_KEY
      baseURL = process.env.DEEPSEEK_BASE_URL
      model = process.env.DEEPSEEK_MODEL
    } else {
      throw new Error('不支持的模型提供者')
    }
    this.llm = new ChatOpenAI({
      configuration: { apiKey, baseURL },
      model,
      temperature: 0.3,
    })
  }

  registerAgents() {
    for (const def of agentDefinitions) {
      this.agents.set(def.name, {
        ...def,
        // 每个 Agent 有自己的 LLM 实例（可配置不同模型）
        llm: this.llm,
      })
    }
  }

  // 根据任务自动选择合适的 Agent
  async selectAgent(task) {
    const agentList = agentDefinitions
      .map((a) => `- ${a.name}（${a.role}）: ${a.description}`)
      .join('\n')

    const response = await this.llm.invoke([
      {
        role: 'system',
        content: '你是一个任务路由器。根据任务描述，选择最合适的 Agent。只输出 Agent 名称。',
      },
      {
        role: 'user',
        content: `任务：${task}\n\n可用 Agent：\n${agentList}\n\n请选择最合适的 Agent 名称：`,
      },
    ])

    const selected = response.content.trim().toLowerCase()
    for (const name of this.agents.keys()) {
      if (selected.includes(name)) return name
    }
    return 'researcher' // 默认
  }

  // 调用单个 Agent 执行任务
  async callAgent(agentName, task, context = '') {
    const agent = this.agents.get(agentName)
    if (!agent) throw new Error(`未知 Agent: ${agentName}`)

    const messages = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: context ? `上下文：\n${context}\n\n任务：${task}` : task },
    ]

    const response = await agent.llm.invoke(messages)
    return {
      agent: agentName,
      role: agent.role,
      result: response.content,
    }
  }

  // 顺序协作：agent1 → agent2 → agent3
  async sequentialPipeline(task, pipeline) {
    const results = []
    let context = ''

    for (const agentName of pipeline) {
      const result = await this.callAgent(agentName, task, context)
      results.push(result)
      context += `\n[${result.role}] 输出：\n${result.result}\n`
    }

    return {
      success: true,
      pipeline: results.map((r) => r.agent),
      finalResult: results[results.length - 1].result,
      details: results,
    }
  }

  // 并行协作：多个 Agent 同时工作，再汇总
  async parallelWorkflow(task, agentNames) {
    const results = await Promise.all(agentNames.map((name) => this.callAgent(name, task)))

    // 汇总各 Agent 结果
    const summary = results
      .map((r) => `### ${r.role}（${r.agent}）\n${r.result}`)
      .join('\n\n---\n\n')

    return {
      success: true,
      agents: agentNames,
      summary,
      details: results,
    }
  }

  // 辩论模式：多个 Agent 就同一问题辩论，协调员做最终裁决
  async debateWorkflow(topic, agentNames, rounds = 2) {
    let debateLog = `辩论主题：${topic}\n\n`
    const opinions = []

    for (let round = 1; round <= rounds; round++) {
      debateLog += `=== 第 ${round} 轮 ===\n\n`

      for (const name of agentNames) {
        const prompt =
          round === 1
            ? `请就以下主题发表你的观点：${topic}`
            : `请对其他 Agent 的观点进行回应和补充：\n${debateLog}\n\n请发表你的第 ${round} 轮观点：`

        const result = await this.callAgent(name, prompt)
        debateLog += `[${result.role}]：${result.result}\n\n`
        opinions.push({ round, agent: name, content: result.result })
      }
    }

    // 协调员总结
    const summary = await this.llm.invoke([
      { role: 'system', content: '你是一个辩论主持人，请总结各方观点并给出最终建议。' },
      { role: 'user', content: `辩论记录：\n${debateLog}\n\n请总结：` },
    ])

    return {
      success: true,
      topic,
      rounds,
      debateLog,
      summary: summary.content,
      opinions,
    }
  }
}

export default new CoordinatorService()
```

### 控制器层

```js
import express from 'express'
import coordinatorService from '../services/coordinatorService.js'

const router = express.Router()

// 自动路由 + 单 Agent 执行
router.post('/auto', async (req, res) => {
  const { task } = req.body
  if (!task) return res.status(400).json({ success: false, error: '缺少 task' })

  const agentName = await coordinatorService.selectAgent(task)
  const result = await coordinatorService.callAgent(agentName, task)
  res.json({ success: true, selectedAgent: agentName, ...result })
})

// 顺序管道
router.post('/pipeline', async (req, res) => {
  const { task, pipeline } = req.body
  if (!task || !pipeline)
    return res.status(400).json({ success: false, error: '缺少 task 或 pipeline' })

  const result = await coordinatorService.sequentialPipeline(task, pipeline)
  res.json(result)
})

// 并行协作
router.post('/parallel', async (req, res) => {
  const { task, agents } = req.body
  if (!task || !agents)
    return res.status(400).json({ success: false, error: '缺少 task 或 agents' })

  const result = await coordinatorService.parallelWorkflow(task, agents)
  res.json(result)
})

// 辩论模式
router.post('/debate', async (req, res) => {
  const { topic, agents, rounds = 2 } = req.body
  if (!topic || !agents)
    return res.status(400).json({ success: false, error: '缺少 topic 或 agents' })

  const result = await coordinatorService.debateWorkflow(topic, agents, rounds)
  res.json(result)
})

export default router
```

## 设计建议

- 从单 Agent 开始，确实需要时才引入多 Agent
- 中心化协调器模式适合 3-5 个 Agent 的场景
- 多 Agent 需考虑：一致性、失败恢复、通信成本
- 为每个 Agent 设置独立的超时，避免单个 Agent 拖慢整体
