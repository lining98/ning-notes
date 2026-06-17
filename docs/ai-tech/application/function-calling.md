# 函数调用

> 介绍 Function Calling 的完整工作流程，包括工具 Schema 定义、模型调用、响应解析、函数执行与结果回传。

## 概述

函数调用（Function Calling）让模型返回**结构化函数调用指令**而非自由文本。模型根据用户输入判断需要调用哪个函数、传什么参数，后端解析后执行实际函数，并将结果返回模型继续对话。

典型场景：查询实时数据（天气、股价）、执行操作（创建工单、下单）、对接外部 API。

## 工作流程

```
用户输入 → 构建 messages + tools 定义 → 请求模型
→ 模型返回 tool_calls（函数名 + 参数 JSON）
→ 后端解析并执行函数 → 将结果追加到 messages
→ 再次请求模型 → 模型基于结果生成最终回复
```

## Node 示例（Express）

### 工具定义

- toolDefinitions.js

```js
// 定义可调用的工具列表，每个工具包含名称、描述和参数 JSON Schema
export const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: '查询指定城市的实时天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名称，如"北京"' },
        },
        required: ['city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_order',
      description: '创建订单',
      parameters: {
        type: 'object',
        properties: {
          product: { type: 'string', description: '商品名称' },
          quantity: { type: 'number', description: '数量' },
          price: { type: 'number', description: '单价（元）' },
        },
        required: ['product', 'quantity', 'price'],
      },
    },
  },
]
```

### 函数执行层

- functionExecutor.js

```js
// 白名单分发：根据函数名执行对应逻辑
export async function executeFunction(name, args) {
  switch (name) {
    case 'get_weather':
      return await getWeather(args.city)
    case 'create_order':
      return await createOrder(args.product, args.quantity, args.price)
    default:
      throw new Error(`未知函数: ${name}`)
  }
}

async function getWeather(city) {
  return { city, temperature: '26°C', condition: '晴', humidity: '55%' }
}

async function createOrder(product, quantity, price) {
  const total = quantity * price
  return { orderId: 'ORD' + Date.now(), product, quantity, price, total, status: '已创建' }
}
```

### 服务层

- functionCallingService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { tools } from '../definitions/toolDefinitions.js'
import { executeFunction } from '../executors/functionExecutor.js'
import 'dotenv/config'

class FunctionCallingService {
  constructor() {
    this.llm = null
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

  async chat(userMessage) {
    const messages = [
      new SystemMessage('你是一个智能助手，可以查询天气和创建订单。'),
      new HumanMessage(userMessage),
    ]
    try {
      // 第一轮：模型判断是否需要调用工具
      const response = await this.llm.invoke(messages, { tools })
      const toolCalls = response.tool_calls || []

      if (toolCalls.length === 0) {
        return { success: true, reply: response.content }
      }

      // 执行所有工具调用
      messages.push(response)
      for (const toolCall of toolCalls) {
        const { name, arguments: args } = toolCall
        const parsedArgs = JSON.parse(args)
        const result = await executeFunction(name, parsedArgs)
        messages.push(
          new ToolMessage({
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          }),
        )
      }

      // 第二轮：基于工具结果生成最终回复
      const finalResponse = await this.llm.invoke(messages)
      return { success: true, reply: finalResponse.content }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
}

export default new FunctionCallingService()
```

### 控制器层

```js
import express from 'express'
import functionCallingService from '../services/functionCallingService.js'

const router = express.Router()

router.post('/chat', async (req, res) => {
  const { message } = req.body
  if (!message) {
    return res.status(400).json({ success: false, error: '缺少必要参数 message' })
  }
  const result = await functionCallingService.chat(message)
  return res.json(result)
})

export default router
```

## 安全建议

- **白名单机制**：只允许调用 `toolDefinitions` 中预定义的工具，禁止动态注册
- **参数校验**：对模型返回的参数做类型与范围校验，防止注入
- **权限控制**：敏感操作（删除、支付）需二次确认或权限校验
- **日志记录**：记录所有工具调用日志，便于审计和排查
- **超时限制**：为每个工具调用设置超时，防止长时间阻塞
