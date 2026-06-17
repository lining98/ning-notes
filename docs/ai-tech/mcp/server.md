# MCP Server 开发

> 深入介绍 MCP Server 的完整 Node.js 实现，包括工具注册、发现、调用调度、传输层（stdio/HTTP SSE）与权限校验。

## 概述

MCP Server 是工具提供方，负责：

- 注册工具（名称、描述、参数 Schema）
- 处理 `initialize` 握手和 `tools/list` 发现
- 接收 `tools/call` 请求并执行对应工具
- 发送工具变更通知

Server 可运行在两种传输模式：

- **stdio**：标准输入输出，适合本地进程通信
- **HTTP + SSE**：适合远程访问，Server 作为 HTTP 服务运行

## Node 示例（HTTP + SSE）

### 工具注册

- server/tools.js

```js
// 工具注册表：定义 Server 提供的所有工具
export const tools = [
  {
    name: 'web_search',
    description: '在互联网上搜索信息，返回相关结果',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        maxResults: { type: 'number', description: '返回结果数量', default: 5 },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_weather',
    description: '查询指定城市的实时天气',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: '城市名称，如"北京"' },
      },
      required: ['city'],
    },
  },
  {
    name: 'read_file',
    description: '读取指定路径的文件内容',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        encoding: { type: 'string', description: '编码格式', default: 'utf-8' },
      },
      required: ['path'],
    },
  },
]
```

### 工具执行器

- server/executor.js

```js
import fs from 'fs/promises'

// 工具执行器：根据工具名称执行对应逻辑
export async function executeTool(name, args) {
  switch (name) {
    case 'web_search':
      return await searchWeb(args.query, args.maxResults || 5)
    case 'get_weather':
      return await getWeather(args.city)
    case 'read_file':
      return await readFile(args.path, args.encoding || 'utf-8')
    default:
      throw new Error(`未知工具: ${name}`)
  }
}

async function searchWeb(query, maxResults) {
  // 模拟搜索（生产环境接入真实搜索 API）
  return {
    results: [
      { title: `${query} - 结果1`, url: 'https://example.com/1', snippet: '相关内容...' },
      { title: `${query} - 结果2`, url: 'https://example.com/2', snippet: '更多内容...' },
    ].slice(0, maxResults),
  }
}

async function getWeather(city) {
  return { city, temperature: '22°C', humidity: '60%', condition: '晴' }
}

async function readFile(filePath, encoding) {
  const content = await fs.readFile(filePath, encoding)
  return { path: filePath, size: content.length, content: content.slice(0, 5000) }
}
```

### MCP Server 核心

- server/mcpServer.js

```js
import { tools } from './tools.js'
import { executeTool } from './executor.js'

class McpServer {
  constructor(config = {}) {
    this.name = config.name || 'my-mcp-server'
    this.version = config.version || '1.0.0'
    this.protocolVersion = '2024-11-05'
    this.tools = tools
    this.toolChangeCallbacks = []
    this.capabilities = {
      tools: { listChanged: true },
      resources: {},
      logging: {},
    }
  }

  // 处理 initialize 请求
  handleInitialize(params) {
    const clientVersion = params.protocolVersion
    if (clientVersion !== this.protocolVersion) {
      return {
        error: {
          code: -32603,
          message: `协议版本不兼容: 需要 ${this.protocolVersion}，收到 ${clientVersion}`,
        },
      }
    }
    return {
      result: {
        protocolVersion: this.protocolVersion,
        capabilities: this.capabilities,
        serverInfo: { name: this.name, version: this.version },
      },
    }
  }

  // 处理 tools/list 请求
  handleToolsList() {
    return {
      result: {
        tools: this.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    }
  }

  // 处理 tools/call 请求
  async handleToolsCall(params) {
    const { name, arguments: args = {} } = params

    // 校验工具是否存在
    const tool = this.tools.find((t) => t.name === name)
    if (!tool) {
      return {
        result: {
          content: [{ type: 'text', text: `工具 "${name}" 未注册` }],
          isError: true,
        },
      }
    }

    // 校验必填参数
    const required = tool.inputSchema?.required || []
    for (const key of required) {
      if (args[key] === undefined) {
        return {
          result: {
            content: [{ type: 'text', text: `缺少必要参数: ${key}` }],
            isError: true,
          },
        }
      }
    }

    // 执行工具
    try {
      const data = await executeTool(name, args)
      return {
        result: {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
          isError: false,
        },
      }
    } catch (err) {
      return {
        result: {
          content: [{ type: 'text', text: `执行失败: ${err.message}` }],
          isError: true,
        },
      }
    }
  }

  // 注册工具变更回调
  onToolsChanged(callback) {
    this.toolChangeCallbacks.push(callback)
  }

  // 添加新工具并通知 Client
  addTool(tool) {
    this.tools.push(tool)
    for (const cb of this.toolChangeCallbacks) {
      cb({ method: 'notifications/tools/list_changed' })
    }
  }

  // 路由分发：根据 method 调用对应处理方法
  async handleRequest(msg) {
    const { id, method, params } = msg

    switch (method) {
      case 'initialize':
        return { id, ...this.handleInitialize(params) }

      case 'tools/list':
        return { id, ...this.handleToolsList() }

      case 'tools/call':
        return { id, ...(await this.handleToolsCall(params)) }

      default:
        return {
          id,
          error: { code: -32601, message: `方法未找到: ${method}` },
        }
    }
  }
}

export default McpServer
```

### HTTP + SSE 传输层

- server/transport.js

```js
import express from 'express'
import McpServer from './mcpServer.js'

const app = express()
app.use(express.json())

const mcpServer = new McpServer({ name: 'my-mcp-server', version: '1.0.0' })

// SSE 端点：Client 通过此端点接收服务端推送
app.get('/sse', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  // 注册工具变更通知
  mcpServer.onToolsChanged((notification) => {
    res.write(`data: ${JSON.stringify(notification)}\n\n`)
  })

  // 发送初始连接确认
  res.write(`data: ${JSON.stringify({ method: 'connection/established' })}\n\n`)

  req.on('close', () => {
    console.log('Client 断开 SSE 连接')
  })
})

// JSON-RPC 端点：Client 通过此端点发送请求
app.post('/message', async (req, res) => {
  const msg = req.body

  if (!msg || msg.jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: '无效请求' },
    })
  }

  // 通知类型不需要响应
  if (msg.method && msg.id === undefined) {
    console.log('收到通知:', msg.method)
    return res.status(202).end()
  }

  const response = await mcpServer.handleRequest(msg)
  res.json({ jsonrpc: '2.0', ...response })
})

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    server: mcpServer.name,
    version: mcpServer.version,
    tools: mcpServer.tools.length,
  })
})

const PORT = process.env.MCP_PORT || 3001
app.listen(PORT, () => {
  console.log(`MCP Server 已启动: http://localhost:${PORT}`)
  console.log(`  SSE 端点: http://localhost:${PORT}/sse`)
  console.log(`  消息端点: POST http://localhost:${PORT}/message`)
  console.log(`  已注册工具: ${mcpServer.tools.map((t) => t.name).join(', ')}`)
})
```

## 安全建议

- 工具执行前校验参数类型和范围，防止注入
- 对文件读写类工具限制访问路径（白名单目录）
- 生产环境添加认证层（API Key / OAuth）
- 记录所有工具调用日志，便于审计
