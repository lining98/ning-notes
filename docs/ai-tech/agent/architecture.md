# Agent 架构

> 深入介绍 Agent 的核心组件、数据流设计以及 Node.js 中基于 LangChain 的完整 Agent 实现。

## 概述

Agent 是将推理能力与工具调用能力结合的系统，通过"思考 → 行动 → 观察 → 再思考"的循环自主完成任务。

核心组件：

| 组件               | 职责                                  | 类比   |
| ------------------ | ------------------------------------- | ------ |
| Planner（规划器）  | 将高层目标拆解为可执行步骤            | 大脑   |
| Executor（执行器） | 按步骤调用工具，收集结果              | 双手   |
| Memory（记忆）     | 存储对话历史、用户偏好、知识片段      | 海马体 |
| Tools（工具集）    | 外部能力：搜索、API、数据库、代码执行 | 工具箱 |

## 典型数据流

```
用户输入 → Planner 生成计划 → Executor 调用工具
    ↑                                    ↓
    └── Memory 记录历史 ←── 工具返回结果 ←──┘
              ↓
         Planner 判断是否继续 → 是：生成下一步
                              → 否：返回最终答案
```

## Node 示例（LangChain）

### Agent 核心类

- services/agentService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { toolDefinitions } from '../definitions/tools.js'
import { executeTool } from '../executors/toolExecutor.js'
import { memoryStore } from './memoryService.js'
import 'dotenv/config'

class AgentService {
  constructor() {
    this.llm = null
    this.maxIterations = 10 // 最大推理轮次，防止死循环
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

  // 构建系统提示，告知模型可用工具和推理格式
  buildSystemPrompt() {
    const toolDescriptions = toolDefinitions
      .map((t) => `- ${t.name}: ${t.description}，参数: ${JSON.stringify(t.parameters)}`)
      .join('\n')

    return `你是一个智能 Agent，可以调用以下工具完成任务：

${toolDescriptions}

推理格式：
Thought: 分析当前状态，思考下一步
Action: 工具名称
Action Input: JSON 格式的参数
Observation: 工具返回结果
...（可重复 Thought/Action/Action Input/Observation）
Final Answer: 最终回答

注意：每次只执行一个 Action，得到 Observation 后再决定下一步。`
  }

  // 解析模型输出中的 Action 指令
  parseAction(text) {
    const actionMatch = text.match(/Action:\s*(.+)/i)
    const inputMatch = text.match(
      /Action Input:\s*([\s\S]+?)(?=\n(?:Observation|Thought|Action|Final)|$)/i,
    )

    if (!actionMatch || !inputMatch) return null

    try {
      return {
        tool: actionMatch[1].trim(),
        args: JSON.parse(inputMatch[1].trim()),
      }
    } catch {
      return null
    }
  }

  // Agent 主循环
  async run(userInput, sessionId = 'default') {
    const history = memoryStore.getHistory(sessionId)
    const messages = [
      new SystemMessage(this.buildSystemPrompt()),
      ...history.map((m) =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
      ),
      new HumanMessage(`用户需求：${userInput}\n请开始推理。`),
    ]

    let iteration = 0
    let finalAnswer = ''

    while (iteration < this.maxIterations) {
      iteration++
      const response = await this.llm.invoke(messages)
      const content = response.content
      messages.push(response)

      // 检查是否到达最终答案
      const finalMatch = content.match(/Final Answer:\s*([\s\S]+)/i)
      if (finalMatch) {
        finalAnswer = finalMatch[1].trim()
        break
      }

      // 解析 Action 并执行工具
      const action = this.parseAction(content)
      if (!action) {
        // 无法解析，提示模型重新输出
        messages.push(
          new HumanMessage('请按格式输出 Action 和 Action Input，或给出 Final Answer。'),
        )
        continue
      }

      // 执行工具
      const result = await executeTool(action.tool, action.args)
      const observation = JSON.stringify(result)
      messages.push(new HumanMessage(`Observation: ${observation}`))
    }

    if (!finalAnswer) {
      finalAnswer = '抱歉，任务超出推理步数限制，请简化需求。'
    }

    // 保存到记忆
    memoryStore.addMessage(sessionId, { role: 'user', content: userInput })
    memoryStore.addMessage(sessionId, { role: 'assistant', content: finalAnswer })

    return { success: true, answer: finalAnswer, iterations: iteration }
  }
}

export default new AgentService()
```

### 控制器层

```js
import express from 'express'
import agentService from '../services/agentService.js'

const router = express.Router()

router.post('/agent', async (req, res) => {
  const { input, sessionId } = req.body
  if (!input) {
    return res.status(400).json({ success: false, error: '缺少 input 参数' })
  }
  const result = await agentService.run(input, sessionId)
  res.json(result)
})

export default router
```

## 扩展点与注意事项

- **安全边界**：危险操作（删库、执行任意命令）需人工确认
- **超时与重试**：工具调用设置超时，失败时自动重试或降级
- **隐私合规**：Memory 中的敏感信息需脱敏或加密存储
- **监控**：记录每次推理步骤、工具调用耗时，便于优化
