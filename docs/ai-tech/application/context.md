# 上下文管理

> 介绍如何在有限 Token 窗口内管理上下文，包括截断、摘要、滑动窗口与长期记忆等策略的完整实现。

## 概述

LLM 的上下文窗口有限（如 4K / 8K / 128K tokens），当对话历史过长时需要策略性管理，在保留关键信息的同时不超出窗口限制。核心策略：

- **截断**：保留最近 N 条消息或最近 N 个 Token
- **摘要**：定期将历史压缩为摘要，替换旧消息
- **滑动窗口**：保留最近消息 + 系统提示 + 摘要
- **长期记忆**：将重要信息持久化到外部存储，按需检索

## Token 计算工具

- tokenUtils.js

```js
// 基于 tiktoken 计算消息 Token 数（也可用字符数粗略估算：1 token ≈ 1.5 中文字符）
import { encoding_for_model } from 'tiktoken'

const enc = encoding_for_model('gpt-4o')

export function countTokens(text) {
  return enc.encode(text).length
}

export function countMessagesTokens(messages) {
  let total = 0
  for (const msg of messages) {
    total += countTokens(msg.content || '') + 4 // 每条消息有 4 token 的格式开销
  }
  return total + 2 // 回复开头标记
}
```

## 截断策略

### 服务层

- contextService.js

```js
import { countMessagesTokens } from '../utils/tokenUtils.js'

class ContextService {
  constructor() {
    this.maxTokens = 4000 // 上下文窗口上限
    this.reserveTokens = 1000 // 为回复预留的 token
  }

  // 基于 Token 数量的截断：保留最近消息，超出则从最早开始移除
  truncateByTokens(messages) {
    const systemMsg = messages.filter((m) => m.role === 'system')
    let history = messages.filter((m) => m.role !== 'system')
    const systemTokens = countMessagesTokens(systemMsg)
    const limit = this.maxTokens - this.reserveTokens - systemTokens

    let totalTokens = countMessagesTokens(history)
    while (totalTokens > limit && history.length > 0) {
      const removed = history.shift()
      totalTokens -= countMessagesTokens([removed])
    }
    return [...systemMsg, ...history]
  }

  // 基于消息数量的截断
  truncateByCount(messages, maxCount = 20) {
    const systemMsg = messages.filter((m) => m.role === 'system')
    const history = messages.filter((m) => m.role !== 'system')
    const recent = history.slice(-maxCount)
    return [...systemMsg, ...recent]
  }
}

export default new ContextService()
```

## 摘要策略

### 摘要压缩

- contextService.js（续）

```js
// 在 ContextService 类中追加以下方法

// 当消息超过阈值时触发摘要，将旧消息替换为摘要
async compactWithSummary(messages, llm) {
  const systemMsg = messages.filter(m => m.role === 'system')
  const history = messages.filter(m => m.role !== 'system')

  if (history.length < 10) return messages

  const tokens = countMessagesTokens(history)
  if (tokens < this.maxTokens * 0.7) return messages

  // 取前 50% 的消息做摘要
  const mid = Math.floor(history.length / 2)
  const oldMessages = history.slice(0, mid)
  const recentMessages = history.slice(mid)

  const summaryText = oldMessages.map(m => `[${m.role}]: ${m.content}`).join('\n')
  const summaryResp = await llm.invoke([
    { role: 'system', content: '请用 200 字以内总结以下对话的关键信息。' },
    { role: 'user', content: summaryText }
  ])

  return [
    ...systemMsg,
    { role: 'system', content: '【历史摘要】' + summaryResp.content },
    ...recentMessages
  ]
}
```

## 滑动窗口策略

```js
// 滑动窗口：系统提示 + 摘要 + 最近 N 轮对话
async function buildSlidingWindow(systemPrompt, history, llm, recentRounds = 5) {
  const recent = history.slice(-recentRounds * 2) // 每轮包含 user + assistant
  const older = history.slice(0, -recentRounds * 2)

  let messages = [{ role: 'system', content: systemPrompt }]

  if (older.length > 0) {
    const summary = await summarizeHistory(older, llm)
    messages.push({ role: 'system', content: '【历史摘要】' + summary })
  }

  return [...messages, ...recent]
}
```

## 长期记忆

```js
// 将关键信息持久化，后续对话时按需检索
class MemoryStore {
  constructor() {
    this.memories = new Map() // 简易内存存储，生产环境可用 Redis/DB
  }

  save(sessionId, key, value) {
    if (!this.memories.has(sessionId)) {
      this.memories.set(sessionId, {})
    }
    this.memories.get(sessionId)[key] = value
  }

  get(sessionId, key) {
    return this.memories.get(sessionId)?.[key] || null
  }

  getAll(sessionId) {
    return this.memories.get(sessionId) || {}
  }

  // 将记忆注入系统提示
  buildMemoryPrompt(sessionId) {
    const mem = this.getAll(sessionId)
    const entries = Object.entries(mem).map(([k, v]) => `${k}: ${v}`)
    return entries.length > 0 ? `用户已知信息：\n${entries.join('\n')}` : ''
  }
}

export const memoryStore = new MemoryStore()
```

## 完整控制器示例

```js
import express from 'express'
import contextService from '../services/contextService.js'

const router = express.Router()

router.post('/chat', async (req, res) => {
  const { messages, sessionId } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ success: false, error: '缺少 messages 参数' })
  }

  // 注入长期记忆
  const memoryPrompt = memoryStore.buildMemoryPrompt(sessionId)
  if (memoryPrompt) {
    messages.unshift({ role: 'system', content: memoryPrompt })
  }

  // 截断超长上下文
  const trimmed = contextService.truncateByTokens(messages)

  // 调用模型...
  const result = await chatModel.invoke(trimmed)

  // 提取并保存关键信息（示例：用户提到姓名时）
  if (result.content.includes('我叫')) {
    const nameMatch = result.content.match(/我叫(\S+)/)
    if (nameMatch) memoryStore.save(sessionId, 'userName', nameMatch[1])
  }

  return res.json({ success: true, reply: result.content })
})

export default router
```

## 陷阱与建议

- 盲目截断会丢失用户意图，建议保留 system prompt 和最近对话
- 摘要可能改变原意，建议对关键事实类信息不做摘要
- 长期记忆中避免存储敏感信息（密码、身份证号等）
