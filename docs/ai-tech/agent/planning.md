# Planning 规划

> 深入介绍 Agent 规划能力的实现：任务拆解、步骤验证、执行调度与动态重规划，含完整 Node.js 示例。

## 概述

Planning（规划）是 Agent 将复杂目标拆解为可执行步骤的核心能力。好的规划能显著提升任务成功率，减少无效工具调用。

规划方法对比：

| 方法       | 原理                   | 适用场景         | 灵活性 |
| ---------- | ---------------------- | ---------------- | ------ |
| 规则化拆解 | 基于模板/规则拆解      | 流程固定的任务   | 低     |
| LLM 生成   | 模型自主生成步骤       | 开放式任务       | 高     |
| 分层规划   | 先生成高层计划，再细化 | 复杂多步骤任务   | 高     |
| 动态重规划 | 执行中根据反馈调整     | 不确定性高的任务 | 最高   |

## Node 示例

### 规划器服务

- services/plannerService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import 'dotenv/config'

class PlannerService {
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

  // LLM 生成执行计划
  async generatePlan(goal, tools, context = '') {
    const toolDescriptions = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')

    const prompt = `你是一个任务规划专家。请将以下目标拆解为可执行的步骤序列。

可用工具：
${toolDescriptions}

${context ? `上下文信息：\n${context}\n` : ''}

目标：${goal}

请以 JSON 格式输出执行计划：
{
  "goal": "目标描述",
  "steps": [
    {
      "id": 1,
      "description": "步骤描述",
      "tool": "工具名称",
      "args": { "参数名": "参数值" },
      "dependsOn": [],
      "expectedOutput": "预期输出描述"
    }
  ],
  "estimatedSteps": 步骤总数
}

要求：
1. 每个步骤明确指定使用的工具和参数
2. 如有依赖关系，在 dependsOn 中标明前置步骤 ID
3. 优先使用可用工具，无可用的标注为 manual
4. 步骤粒度适中，不过粗也不过细`

    const response = await this.llm.invoke([
      { role: 'system', content: '你是一个任务规划专家，请输出 JSON 格式的计划。' },
      { role: 'user', content: prompt },
    ])

    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/)
      return JSON.parse(jsonMatch[0])
    } catch {
      return {
        goal,
        steps: [{ id: 1, description: goal, tool: 'manual', args: {} }],
        error: '计划解析失败',
      }
    }
  }

  // 验证计划可行性
  validatePlan(plan, availableTools) {
    const toolNames = new Set(availableTools.map((t) => t.name))
    const errors = []

    for (const step of plan.steps) {
      // 检查工具是否存在
      if (step.tool !== 'manual' && !toolNames.has(step.tool)) {
        errors.push(`步骤 ${step.id}: 工具 "${step.tool}" 不在可用工具列表中`)
      }
      // 检查依赖是否存在
      for (const depId of step.dependsOn || []) {
        if (!plan.steps.find((s) => s.id === depId)) {
          errors.push(`步骤 ${step.id}: 依赖步骤 ${depId} 不存在`)
        }
      }
    }

    // 检查循环依赖
    const hasCycle = this.detectCycle(plan.steps)
    if (hasCycle) {
      errors.push('计划存在循环依赖')
    }

    return { valid: errors.length === 0, errors }
  }

  // 检测循环依赖
  detectCycle(steps) {
    const visited = new Set()
    const stack = new Set()

    function dfs(stepId) {
      if (stack.has(stepId)) return true
      if (visited.has(stepId)) return false
      visited.add(stepId)
      stack.add(stepId)
      const step = steps.find((s) => s.id === stepId)
      for (const depId of step?.dependsOn || []) {
        if (dfs(depId)) return true
      }
      stack.delete(stepId)
      return false
    }

    return steps.some((s) => dfs(s.id))
  }

  // 动态重规划：根据执行反馈调整后续步骤
  async replan(originalPlan, failedStep, errorMessage, tools) {
    const context = `原计划在执行步骤 ${failedStep.id}（${failedStep.description}）时失败：${errorMessage}`
    return await this.generatePlan(originalPlan.goal, tools, context)
  }
}

export default new PlannerService()
```

### 执行器服务

- services/executorService.js

```js
import { executeTool } from '../executors/toolExecutor.js'

class ExecutorService {
  // 按拓扑顺序执行计划（先执行无依赖的步骤）
  async executePlan(plan, onStepComplete) {
    const results = new Map() // stepId → result
    const completed = new Set()
    let remaining = [...plan.steps]

    while (remaining.length > 0) {
      // 找出所有依赖已满足的步骤
      const ready = remaining.filter((step) =>
        (step.dependsOn || []).every((depId) => completed.has(depId)),
      )

      if (ready.length === 0) {
        throw new Error('计划执行死锁：无可执行步骤但仍有未完成步骤')
      }

      // 并行执行无相互依赖的步骤
      const stepResults = await Promise.all(
        ready.map(async (step) => {
          const result =
            step.tool === 'manual'
              ? { status: 'manual', message: '需人工处理' }
              : await executeTool(step.tool, step.args)

          if (onStepComplete) onStepComplete(step, result)
          return { stepId: step.id, result }
        }),
      )

      for (const { stepId, result } of stepResults) {
        results.set(stepId, result)
        completed.add(stepId)
      }

      remaining = remaining.filter((s) => !completed.has(s.id))
    }

    return { success: true, results: Object.fromEntries(results) }
  }
}

export default new ExecutorService()
```

### 控制器层

```js
import express from 'express'
import plannerService from '../services/plannerService.js'
import executorService from '../services/executorService.js'
import { getToolCapabilities } from '../executors/toolExecutor.js'

const router = express.Router()

router.post('/plan', async (req, res) => {
  const { goal } = req.body
  if (!goal) {
    return res.status(400).json({ success: false, error: '缺少 goal 参数' })
  }

  const tools = getToolCapabilities()
  const plan = await plannerService.generatePlan(goal, tools)
  const validation = plannerService.validatePlan(plan, tools)

  res.json({ success: true, plan, validation })
})

router.post('/execute', async (req, res) => {
  const { plan } = req.body
  if (!plan || !plan.steps) {
    return res.status(400).json({ success: false, error: '缺少 plan 参数' })
  }

  const stepLogs = []
  const result = await executorService.executePlan(plan, (step, result) => {
    stepLogs.push({ stepId: step.id, description: step.description, result })
  })

  res.json({ success: true, stepLogs, ...result })
})

export default router
```

## 设计建议

- 规划粒度适中：步骤过粗执行困难，过细则通信开销大
- 计划验证必不可少：检查工具可用性、依赖完整性和循环依赖
- 支持动态重规划：执行失败时根据错误信息重新生成计划
- 为关键步骤设置检查点，失败时从中断处恢复而非从头开始
