# MCP 协议原理

> 深入介绍 MCP 协议的消息格式、生命周期、能力协商、工具发现与调用机制，含完整 Node.js 示例。

## 概述

MCP（Model Context Protocol）基于 **JSON-RPC 2.0** 协议，定义了 Client 与 Server 之间的标准化通信格式。所有消息均为 JSON 结构，包含请求、响应和通知三种类型。

协议设计原则：

- **无状态请求**：每个请求独立，Server 不维护会话状态（除显式会话外）
- **能力驱动**：Server 声明能力，Client 按需发现和调用
- **传输无关**：协议层与传输层分离，支持 stdio 和 HTTP/SSE

## 消息格式

### JSON-RPC 请求

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "web_search",
    "arguments": { "query": "MCP 协议" }
  }
}
```

### JSON-RPC 响应（成功）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{ "type": "text", "text": "搜索结果：MCP 是..." }]
  }
}
```

### JSON-RPC 响应（错误）

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32601,
    "message": "Method not found",
    "data": "工具 'unknown_tool' 未注册"
  }
}
```

### 通知（无 id，Server 主动推送）

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed",
  "params": {}
}
```

## 协议生命周期

### 阶段一：初始化（Initialize）

Client 发起连接，声明自己的能力和协议版本。

```js
// Client → Server: 初始化请求
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {
      roots: { listChanged: true },
      sampling: {},
    },
    clientInfo: {
      name: 'my-mcp-client',
      version: '1.0.0',
    },
  },
}

// Server → Client: 初始化响应
const initResponse = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true },
      logging: {},
    },
    serverInfo: {
      name: 'my-mcp-server',
      version: '1.0.0',
    },
  },
}
```

### 阶段二：能力协商

双方交换 `capabilities` 后，Client 知道 Server 支持哪些功能（tools、resources、prompts、logging 等）。

```js
// Client 发送 initialized 通知
const initializedNotification = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
}
```

### 阶段三：工具发现

Client 查询 Server 注册的工具列表。

```js
// Client → Server: 列出工具
const listToolsRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
}

// Server → Client: 工具列表
const listToolsResponse = {
  jsonrpc: '2.0',
  id: 2,
  result: {
    tools: [
      {
        name: 'web_search',
        description: '搜索互联网信息',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '搜索关键词' },
          },
          required: ['query'],
        },
      },
    ],
  },
}
```

### 阶段四：工具调用

Client 调用具体工具，Server 执行并返回结果。

```js
// Client → Server: 调用工具
const callToolRequest = {
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'web_search',
    arguments: { query: 'MCP 协议详解' },
  },
}

// Server → Client: 工具结果
const callToolResponse = {
  jsonrpc: '2.0',
  id: 3,
  result: {
    content: [
      {
        type: 'text',
        text: 'MCP（Model Context Protocol）是 Anthropic 推出的开放协议...',
      },
    ],
    isError: false,
  },
}
```

## 标准方法汇总

| 方法                                   | 方向          | 说明                 |
| -------------------------------------- | ------------- | -------------------- |
| `initialize`                           | Client→Server | 初始化连接，交换能力 |
| `notifications/initialized`            | Client→Server | 初始化完成通知       |
| `tools/list`                           | Client→Server | 获取工具列表         |
| `tools/call`                           | Client→Server | 调用指定工具         |
| `resources/list`                       | Client→Server | 获取资源列表         |
| `resources/read`                       | Client→Server | 读取资源内容         |
| `prompts/list`                         | Client→Server | 获取提示模板列表     |
| `prompts/get`                          | Client→Server | 获取指定提示模板     |
| `notifications/tools/list_changed`     | Server→Client | 工具列表变更通知     |
| `notifications/resources/list_changed` | Server→Client | 资源列表变更通知     |

## 错误码

| 错误码 | 含义          |
| ------ | ------------- |
| -32700 | JSON 解析错误 |
| -32600 | 无效请求      |
| -32601 | 方法未找到    |
| -32602 | 参数无效      |
| -32603 | 内部错误      |
| -32000 | 工具执行失败  |

## 协议消息解析器

- utils/mcpProtocol.js

```js
// MCP 协议消息的构建与解析工具
export function createRequest(id, method, params = {}) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params,
  }
}

export function createResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  }
}

export function createError(id, code, message, data = null) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, data },
  }
}

export function createNotification(method, params = {}) {
  return {
    jsonrpc: '2.0',
    method,
    params,
  }
}

export function isValidMessage(msg) {
  return msg && msg.jsonrpc === '2.0' && (msg.method || msg.result !== undefined || msg.error)
}

export function isRequest(msg) {
  return msg.method && msg.id !== undefined
}

export function isNotification(msg) {
  return msg.method && msg.id === undefined
}

export function isResponse(msg) {
  return (msg.result !== undefined || msg.error) && msg.id !== undefined
}
```

## 设计建议

- 严格遵守 JSON-RPC 2.0 规范，确保跨实现兼容
- 工具参数使用 JSON Schema 定义，Client 端可据此做前端校验
- 传输层错误（网络断开）与协议层错误（方法不存在）分开处理
- Server 工具变更时主动发送 `tools/list_changed` 通知
