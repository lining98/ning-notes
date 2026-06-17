# MCP Client 开发

> 深入介绍 MCP Client 的完整 Node.js 实现，包括连接管理、工具发现、工具调用、SSE 事件监听与 LLM 集成。

## 概述

MCP Client 是 AI 应用端，负责：

- 与 MCP Server 建立连接（HTTP + SSE）
- 发送 `initialize` 握手，协商协议版本
- 调用 `tools/list` 发现可用工具
- 调用 `tools/call` 执行工具
- 监听 SSE 推送（工具变更通知等）

Client 通常集成在 LLM 应用中，让模型能够发现和调用 MCP Server 提供的工具。

## Node 示例

### MCP Client 核心类

- client/mcpClient.js

```js
class McpClient {
  constructor(config = {}) {
    this.name = config.name || 'my-mcp-client'
    this.version = config.version || '1.0.0'
    this.serverUrl = config.serverUrl || 'http://localhost:3001'
    this.protocolVersion = '2024-11-05'
    this.requestId = 0
    this.tools = []
    this.connected = false
    this.eventSource = null
    this.eventCallbacks = new Map()
    this.pendingRequests = new Map()
  }

  // 连接到 MCP Server
  async connect() {
    // 1. 建立 SSE 连接
    await this.connectSSE()

    // 2. 发送 initialize 请求
    const initResult = await this.initialize()

    // 3. 发送 initialized 通知
    await this.sendNotification('notifications/initialized')

    // 4. 获取工具列表
    const toolsResult = await this.listTools()
    this.tools = toolsResult.tools || []

    this.connected = true
    console.log(`已连接到 MCP Server，发现 ${this.tools.length} 个工具`)
    return { serverInfo: initResult.serverInfo, tools: this.tools }
  }

  // 建立 SSE 连接，监听服务端推送
  connectSSE() {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(`${this.serverUrl}/sse`)

      this.eventSource.onopen = () => {
        console.log('SSE 连接已建立')
        resolve()
      }

      this.eventSource.onerror = (err) => {
        console.error('SSE 连接错误:', err)
        if (!this.connected) reject(err)
      }

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          this.handleServerEvent(data)
        } catch (err) {
          console.error('SSE 消息解析失败:', err)
        }
      }
    })
  }

  // 处理服务端推送事件
  handleServerEvent(data) {
    switch (data.method) {
      case 'notifications/tools/list_changed':
        console.log('工具列表已变更，重新获取...')
        this.listTools().then((result) => {
          this.tools = result.tools || []
          this.emit('toolsChanged', this.tools)
        })
        break

      case 'notifications/resources/list_changed':
        console.log('资源列表已变更')
        this.emit('resourcesChanged')
        break

      default:
        console.log('收到未知事件:', data.method)
    }
  }

  // 发送 JSON-RPC 请求
  async sendRequest(method, params = {}) {
    const id = ++this.requestId
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    }

    const response = await fetch(`${this.serverUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`HTTP 错误: ${response.status}`)
    }

    const data = await response.json()

    if (data.error) {
      throw new Error(`MCP 错误 [${data.error.code}]: ${data.error.message}`)
    }

    return data.result
  }

  // 发送通知（无需响应）
  async sendNotification(method, params = {}) {
    await fetch(`${this.serverUrl}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    })
  }

  // 初始化握手
  async initialize() {
    return await this.sendRequest('initialize', {
      protocolVersion: this.protocolVersion,
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: { name: this.name, version: this.version },
    })
  }

  // 获取工具列表
  async listTools() {
    return await this.sendRequest('tools/list')
  }

  // 调用工具
  async callTool(name, args = {}) {
    return await this.sendRequest('tools/call', { name, arguments: args })
  }

  // 事件监听
  on(event, callback) {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, [])
    }
    this.eventCallbacks.get(event).push(callback)
  }

  emit(event, data) {
    const callbacks = this.eventCallbacks.get(event) || []
    for (const cb of callbacks) {
      cb(data)
    }
  }

  // 断开连接
  disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.connected = false
    console.log('已断开 MCP Server 连接')
  }
}

export default McpClient
```

### 与 LLM 集成

- client/agentWithMcp.js

```js
import { ChatOpenAI } from '@langchain/openai'
import McpClient from './mcpClient.js'
import 'dotenv/config'

class AgentWithMcp {
  constructor() {
    this.llm = null
    this.mcpClient = null
    this.initLLM()
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

  // 连接 MCP Server 并获取可用工具
  async connect() {
    this.mcpClient = new McpClient({ serverUrl: process.env.MCP_SERVER_URL })
    const { tools } = await this.mcpClient.connect()

    // 监听工具变更
    this.mcpClient.on('toolsChanged', (newTools) => {
      console.log(
        '工具已更新:',
        newTools.map((t) => t.name),
      )
    })

    return tools
  }

  // 将 MCP 工具转换为 OpenAI Function Calling 格式
  mcpToolsToOpenAI() {
    return this.mcpClient.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }

  // Agent 对话
  async chat(userMessage) {
    if (!this.mcpClient || !this.mcpClient.connected) {
      throw new Error('MCP Client 未连接')
    }

    const messages = [
      { role: 'system', content: '你是一个智能助手，可以调用工具完成任务。' },
      { role: 'user', content: userMessage },
    ]

    const openaiTools = this.mcpToolsToOpenAI()

    // 第一轮：模型判断是否需要调用工具
    const response = await this.llm.invoke(messages, {
      tools: openaiTools,
    })

    const toolCalls = response.tool_calls || []
    if (toolCalls.length === 0) {
      return { success: true, reply: response.content }
    }

    // 执行工具调用
    messages.push(response)
    for (const toolCall of toolCalls) {
      const { name, arguments: args } = toolCall
      const parsedArgs = JSON.parse(args)

      // 通过 MCP Client 调用工具
      const toolResult = await this.mcpClient.callTool(name, parsedArgs)

      const resultText =
        toolResult.content?.map((c) => c.text).join('\n') || JSON.stringify(toolResult)

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultText,
      })
    }

    // 第二轮：基于工具结果生成最终回复
    const finalResponse = await this.llm.invoke(messages)
    return { success: true, reply: finalResponse.content }
  }

  // 断开连接
  disconnect() {
    if (this.mcpClient) this.mcpClient.disconnect()
  }
}

export default new AgentWithMcp()
```

### 控制器层

```js
import express from 'express'
import agentWithMcp from '../client/agentWithMcp.js'

const router = express.Router()

// 获取可用工具
router.get('/tools', async (req, res) => {
  const tools = await agentWithMcp.connect()
  res.json({ success: true, tools })
})

// Agent 对话
router.post('/chat', async (req, res) => {
  const { message } = req.body
  if (!message) {
    return res.status(400).json({ success: false, error: '缺少 message 参数' })
  }
  const result = await agentWithMcp.chat(message)
  res.json(result)
})

export default router
```

## 错误处理

```js
// 统一的 MCP 错误处理
export class McpError extends Error {
  constructor(code, message, data = null) {
    super(message)
    this.code = code
    this.data = data
  }
}

// 请求重试
export async function withRetry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === maxRetries - 1) throw err
      console.log(`重试 ${i + 1}/${maxRetries}...`)
      await new Promise((r) => setTimeout(r, delay * (i + 1)))
    }
  }
}
```

## 设计建议

- 连接断开时自动重连，带指数退避
- 工具调用设置超时，防止长时间阻塞
- 缓存工具列表，仅在收到变更通知时刷新
- 为生产环境添加请求签名和认证
