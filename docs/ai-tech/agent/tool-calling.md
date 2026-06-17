# Tool Calling

> 介绍 Agent 中工具调用的完整设计：工具 Schema 定义、注册管理、调用执行、安全校验与错误降级。

## 概述

Tool Calling 是 Agent 与外部世界交互的核心机制。Agent 通过调用工具来获取实时信息、执行操作，弥补 LLM 自身无法感知外部世界的局限。

工具类型：

- **检索类**：搜索引擎、知识库、文档查询
- **操作类**：API 调用、数据库读写、发送邮件
- **计算类**：代码执行、数学计算、数据转换
- **系统类**：文件操作、Shell 命令（需严格限制）

## 工具定义

- definitions/tools.js

```js
// 工具 Schema 定义：每个工具声明名称、描述、参数 JSON Schema 和风险等级
export const toolDefinitions = [
  {
    name: 'web_search',
    description: '在互联网上搜索实时信息，返回相关结果摘要',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '返回结果数量，默认 5' },
      },
      required: ['query'],
    },
    riskLevel: 'low', // 低风险，无需确认
  },
  {
    name: 'database_query',
    description: '执行只读 SQL 查询，仅支持 SELECT 语句',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SELECT 查询语句' },
        limit: { type: 'number', description: '返回行数上限，默认 100' },
      },
      required: ['sql'],
    },
    riskLevel: 'medium', // 中风险，需校验 SQL 合法性
  },
  {
    name: 'send_email',
    description: '发送邮件给指定收件人',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: '收件人邮箱' },
        subject: { type: 'string', description: '邮件主题' },
        body: { type: 'string', description: '邮件正文' },
      },
      required: ['to', 'subject', 'body'],
    },
    riskLevel: 'high', // 高风险，需人工确认
  },
]
```

## 工具注册与执行

- executors/toolExecutor.js

```js
import { toolDefinitions } from '../definitions/tools.js'

// 工具白名单：只允许调用已注册的工具
const toolRegistry = new Map()

// 注册工具实现
toolRegistry.set('web_search', async (args) => {
  const { query, maxResults = 5 } = args
  // 模拟搜索（生产环境接入真实搜索 API）
  return {
    results: [
      { title: `搜索结果: ${query}`, url: 'https://example.com/1', snippet: '相关内容摘要...' },
    ],
    total: 1,
  }
})

toolRegistry.set('database_query', async (args) => {
  const { sql, limit = 100 } = args
  // 安全校验：只允许 SELECT
  if (!sql.trim().toUpperCase().startsWith('SELECT')) {
    throw new Error('仅允许 SELECT 查询')
  }
  // 模拟数据库查询
  return { rows: [{ id: 1, name: '示例数据' }], count: 1 }
})

toolRegistry.set('send_email', async (args) => {
  // 高风险操作：返回确认请求而非直接执行
  return {
    status: 'pending_confirmation',
    message: '邮件发送需人工确认',
    details: args,
  }
})

// 统一执行入口：白名单校验 + 参数校验 + 超时控制
export async function executeTool(name, args, timeout = 10000) {
  // 1. 白名单校验
  if (!toolRegistry.has(name)) {
    return { error: `未知工具: ${name}`, allowed: false }
  }

  // 2. 参数校验
  const definition = toolDefinitions.find((t) => t.name === name)
  if (definition) {
    const required = definition.parameters?.required || []
    for (const key of required) {
      if (args[key] === undefined) {
        return { error: `缺少必要参数: ${key}`, allowed: false }
      }
    }
  }

  // 3. 高风险操作确认
  if (definition?.riskLevel === 'high') {
    return {
      status: 'confirmation_required',
      message: `操作 "${name}" 为高风险操作，需人工确认后执行`,
      tool: name,
      args,
    }
  }

  // 4. 超时执行
  try {
    const fn = toolRegistry.get(name)
    const result = await Promise.race([
      fn(args),
      new Promise((_, reject) => setTimeout(() => reject(new Error('工具执行超时')), timeout)),
    ])
    return { success: true, data: result }
  } catch (err) {
    return { error: err.message, success: false }
  }
}

// 获取所有工具描述（供 Agent Planner 使用）
export function getToolCapabilities() {
  return toolDefinitions.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }))
}
```

## 控制器层

```js
import express from 'express'
import { executeTool, getToolCapabilities } from '../executors/toolExecutor.js'

const router = express.Router()

// 获取可用工具列表
router.get('/tools', (req, res) => {
  res.json({ success: true, tools: getToolCapabilities() })
})

// 执行工具调用
router.post('/execute', async (req, res) => {
  const { tool, args } = req.body
  if (!tool) {
    return res.status(400).json({ success: false, error: '缺少 tool 参数' })
  }
  const result = await executeTool(tool, args || {})
  res.json(result)
})

export default router
```

## 安全设计原则

- **白名单机制**：只能调用 `toolRegistry` 中注册的工具
- **参数校验**：根据 Schema 校验必填字段和类型
- **风险分级**：low 自动执行、medium 校验后执行、high 需人工确认
- **超时控制**：每个工具设置超时，防止长时间阻塞
- **审计日志**：记录所有工具调用，包含时间、参数、结果
