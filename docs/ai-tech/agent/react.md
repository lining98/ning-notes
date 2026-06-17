# ReAct 模式

> 深入介绍 ReAct（Reasoning + Acting）模式的原理与完整 Node.js 实现，含思考-行动-观察循环与流式输出。

## 概述

ReAct 是 Agent 领域的经典范式，将**推理（Reasoning）** 与**行动（Acting）** 交替进行，使模型在生成文本的同时产生工具调用决策。

核心循环：

```
Thought（思考）→ Action（行动）→ Observation（观察）→ Thought → ... → Final Answer
```

与普通 Function Calling 的区别：

- Function Calling：模型一次决定调用哪个工具，是"黑盒"决策
- ReAct：模型显式输出思考过程，可解释性更强，支持多步推理

## Node 示例

### ReAct Agent 服务

- services/reactAgentService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { executeTool, getToolCapabilities } from '../executors/toolExecutor.js'
import 'dotenv/config'

class ReactAgentService {
  constructor() {
    this.llm = null
    this.maxIterations = 15
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
      streaming: true,
    })
  }

  buildSystemPrompt() {
    const tools = getToolCapabilities()
    const toolDesc = tools
      .map(
        (t) =>
          `- ${t.name}: ${t.description}\n  参数: ${JSON.stringify(
            t.parameters?.properties || {},
          )}`,
      )
      .join('\n')

    return `你是一个使用 ReAct 模式的智能 Agent。请严格按以下格式响应：

可用工具：
${toolDesc}

响应格式（每次只能输出一个部分）：

Thought: [对当前状态的分析和下一步思考]
Action: [工具名称]
Action Input: [JSON 格式的参数]

或者：

Thought: [分析后认为任务已完成]
Final Answer: [最终回答，用中文]

规则：
1. 每次输出必须以 Thought 开头
2. Action 和 Action Input 必须配对出现
3. 得到 Observation 后才能继续下一轮思考
4. 完成任务后输出 Final Answer
5. 工具调用失败时分析原因并尝试替代方案`
  }

  // 解析 ReAct 格式输出
  parseReActOutput(text) {
    const thought = text.match(/Thought:\s*([\s\S]*?)(?=\n(?:Action|Final)|$)/i)?.[1]?.trim()
    const action = text.match(/Action:\s*(.+)/i)?.[1]?.trim()
    const actionInput = text
      .match(/Action Input:\s*([\s\S]*?)(?=\n(?:Observation|Thought|Action|Final)|$)/i)?.[1]
      ?.trim()
    const finalAnswer = text.match(/Final Answer:\s*([\s\S]+)/i)?.[1]?.trim()

    return { thought, action, actionInput, finalAnswer }
  }

  // ReAct 主循环（支持流式回调）
  async run(userInput, streamCallback) {
    const messages = [
      new SystemMessage(this.buildSystemPrompt()),
      new HumanMessage(`任务：${userInput}`),
    ]

    const trace = [] // 记录完整推理过程
    let iteration = 0

    while (iteration < this.maxIterations) {
      iteration++

      // 流式调用模型
      const stream = await this.llm.stream(messages)
      let fullContent = ''
      for await (const chunk of stream) {
        const content = chunk.content || ''
        if (content.trim() === '') continue
        fullContent += content
        if (streamCallback) streamCallback({ type: 'chunk', content })
      }

      messages.push(new AIMessage(fullContent))
      const parsed = this.parseReActOutput(fullContent)

      trace.push({
        iteration,
        thought: parsed.thought,
        action: parsed.action,
        actionInput: parsed.actionInput,
        finalAnswer: parsed.finalAnswer,
      })

      // 检查是否到达最终答案
      if (parsed.finalAnswer) {
        return {
          success: true,
          answer: parsed.finalAnswer,
          iterations: iteration,
          trace,
        }
      }

      // 检查是否需要执行 Action
      if (!parsed.action || !parsed.actionInput) {
        messages.push(
          new HumanMessage('请按格式输出 Thought + Action + Action Input，或输出 Final Answer。'),
        )
        continue
      }

      // 解析 Action Input 中的 JSON
      let args
      try {
        args = JSON.parse(parsed.actionInput)
      } catch {
        messages.push(
          new HumanMessage(`Action Input 必须是有效 JSON。你输入的是: ${parsed.actionInput}`),
        )
        continue
      }

      // 执行工具
      if (streamCallback)
        streamCallback({
          type: 'tool_call',
          tool: parsed.action,
          args,
        })

      const result = await executeTool(parsed.action, args)
      const observation = JSON.stringify(result)

      trace[trace.length - 1].observation = result

      messages.push(new HumanMessage(`Observation: ${observation}`))

      if (streamCallback)
        streamCallback({
          type: 'observation',
          result,
        })
    }

    return {
      success: false,
      answer: '任务超出推理步数限制，请简化需求。',
      iterations: iteration,
      trace,
    }
  }
}

export default new ReactAgentService()
```

### 控制器层（流式 SSE）

```js
import express from 'express'
import reactAgentService from '../services/reactAgentService.js'
import { createStreamRespose } from '../utils/streamUtils.js'

const router = express.Router()

router.post('/react', async (req, res) => {
  const { input } = req.body
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

## ReAct vs 其他模式

| 特性       | ReAct              | 纯 Function Calling | 纯 CoT（思维链） |
| ---------- | ------------------ | ------------------- | ---------------- |
| 可解释性   | 高（显式思考过程） | 低                  | 高               |
| 工具调用   | 支持               | 支持                | 不支持           |
| 多步推理   | 原生支持           | 需额外封装          | 支持             |
| 实现复杂度 | 中                 | 低                  | 低               |

## 注意事项

- 保持 Thought 与 Action 明确分离，防止模型混淆
- 设置最大迭代次数，防止无限循环
- 工具执行失败时引导模型分析原因并尝试替代方案
- 记录完整 trace 便于调试和审计
