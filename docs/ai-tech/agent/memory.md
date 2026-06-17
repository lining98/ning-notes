# Memory 机制

> 深入介绍 Agent 的三种记忆类型：短期会话记忆、长期事实记忆与检索型记忆，含完整 Node.js 实现。

## 概述

Memory 是 Agent 持久化或可检索的状态，使 Agent 能"记住"之前的交互、用户偏好和关键事实，是多轮对话和复杂任务的基础。

三种记忆类型：

| 类型     | 生命周期     | 存储方式    | 用途                     |
| -------- | ------------ | ----------- | ------------------------ |
| 短期记忆 | 当前会话     | 内存数组    | 多轮对话上下文           |
| 长期记忆 | 跨会话持久化 | 数据库/文件 | 用户画像、偏好、关键事实 |
| 检索记忆 | 按需检索     | 向量数据库  | 知识库、历史对话检索     |

## 短期记忆（会话缓冲）

- services/memoryService.js

```js
// 短期会话记忆：基于内存的环形缓冲区
class ShortTermMemory {
  constructor(maxMessages = 50) {
    this.buffer = new Map() // sessionId → messages[]
    this.maxMessages = maxMessages
  }

  addMessage(sessionId, message) {
    if (!this.buffer.has(sessionId)) {
      this.buffer.set(sessionId, [])
    }
    const messages = this.buffer.get(sessionId)
    messages.push({
      ...message,
      timestamp: new Date().toISOString(),
    })

    // 环形缓冲：超出上限时移除最早消息
    if (messages.length > this.maxMessages) {
      messages.splice(0, messages.length - this.maxMessages)
    }
  }

  getHistory(sessionId, limit = 20) {
    const messages = this.buffer.get(sessionId) || []
    return messages.slice(-limit)
  }

  clear(sessionId) {
    this.buffer.delete(sessionId)
  }
}

export const shortTermMemory = new ShortTermMemory()
```

## 长期记忆（持久化存储）

- services/memoryService.js（续）

```js
import fs from 'fs/promises'
import path from 'path'

const LONG_TERM_DIR = './data/long-term-memory'

// 长期记忆：基于文件的持久化存储，生产环境应替换为数据库
class LongTermMemory {
  constructor() {
    this.cache = new Map() // 内存缓存
    this.initDir()
  }

  async initDir() {
    await fs.mkdir(LONG_TERM_DIR, { recursive: true }).catch(() => {})
  }

  _filePath(userId) {
    return path.join(LONG_TERM_DIR, `${userId}.json`)
  }

  async _load(userId) {
    if (this.cache.has(userId)) return this.cache.get(userId)
    try {
      const data = await fs.readFile(this._filePath(userId), 'utf-8')
      const profile = JSON.parse(data)
      this.cache.set(userId, profile)
      return profile
    } catch {
      return { userId, facts: {}, preferences: {}, createdAt: new Date().toISOString() }
    }
  }

  async _save(userId, profile) {
    this.cache.set(userId, profile)
    await fs.writeFile(this._filePath(userId), JSON.stringify(profile, null, 2))
  }

  // 存储事实（如"用户姓名是张三"）
  async saveFact(userId, key, value) {
    const profile = await this._load(userId)
    profile.facts[key] = { value, updatedAt: new Date().toISOString() }
    await this._save(userId, profile)
  }

  // 存储偏好（如"喜欢简洁回答"）
  async savePreference(userId, key, value) {
    const profile = await this._load(userId)
    profile.preferences[key] = { value, updatedAt: new Date().toISOString() }
    await this._save(userId, profile)
  }

  // 获取用户完整画像
  async getProfile(userId) {
    return await this._load(userId)
  }

  // 生成记忆提示词，注入到系统提示中
  async buildMemoryPrompt(userId) {
    const profile = await this._load(userId)
    const facts = Object.entries(profile.facts)
      .map(([k, v]) => `- ${k}: ${v.value}`)
      .join('\n')
    const prefs = Object.entries(profile.preferences)
      .map(([k, v]) => `- ${k}: ${v.value}`)
      .join('\n')

    let prompt = ''
    if (facts) prompt += `已知用户信息：\n${facts}\n`
    if (prefs) prompt += `用户偏好：\n${prefs}\n`
    return prompt
  }

  // 合规接口：删除用户数据
  async deleteUser(userId) {
    this.cache.delete(userId)
    await fs.unlink(this._filePath(userId)).catch(() => {})
  }
}

export const longTermMemory = new LongTermMemory()
```

## 检索记忆（RAG 记忆）

- services/memoryService.js（续）

```js
import { embed } from './embeddingService.js'
import { upsertVectors, search } from './vectorDbService.js'

// 检索记忆：将历史对话向量化，按需检索相关片段
class RetrievalMemory {
  async saveInteraction(sessionId, userMsg, assistantMsg) {
    const content = `用户: ${userMsg}\n助手: ${assistantMsg}`
    const vector = await embed(content)
    await upsertVectors([
      {
        id: `mem_${sessionId}_${Date.now()}`,
        vector,
        metadata: { sessionId, userMsg: userMsg.slice(0, 200), type: 'conversation' },
      },
    ])
  }

  async searchMemory(query, topK = 5) {
    const queryVec = await embed(query)
    return await search(queryVec, topK, { type: 'conversation' })
  }

  // 将检索到的记忆注入 prompt
  async buildRetrievalPrompt(query) {
    const memories = await this.searchMemory(query, 3)
    if (memories.length === 0) return ''
    const context = memories
      .map((m, i) => `[历史记忆${i + 1}] ${m.metadata?.userMsg || ''}`)
      .join('\n')
    return `相关历史对话：\n${context}\n`
  }
}

export const retrievalMemory = new RetrievalMemory()
```

## 统一记忆管理器

- services/memoryService.js（续）

```js
// 统一记忆入口，组合三种记忆类型
class MemoryManager {
  addMessage(sessionId, message) {
    shortTermMemory.addMessage(sessionId, message)
  }

  getHistory(sessionId, limit) {
    return shortTermMemory.getHistory(sessionId, limit)
  }

  async extractAndSave(userId, sessionId) {
    // 从近期对话中提取关键信息并存入长期记忆
    const history = shortTermMemory.getHistory(sessionId)
    const recentText = history.map((m) => `[${m.role}]: ${m.content}`).join('\n')

    // 用 LLM 提取关键事实（此处简化，实际需调用 LLM）
    // const extracted = await llm.extractFacts(recentText)

    // 保存交互到检索记忆
    const lastUser = history.filter((m) => m.role === 'user').pop()
    const lastAssistant = history.filter((m) => m.role === 'assistant').pop()
    if (lastUser && lastAssistant) {
      await retrievalMemory.saveInteraction(sessionId, lastUser.content, lastAssistant.content)
    }
  }

  clear(sessionId) {
    shortTermMemory.clear(sessionId)
  }
}

export const memoryStore = new MemoryManager()
```

## 控制器层

```js
import express from 'express'
import { longTermMemory, memoryStore } from '../services/memoryService.js'

const router = express.Router()

// 获取用户画像
router.get('/profile/:userId', async (req, res) => {
  const profile = await longTermMemory.getProfile(req.params.userId)
  res.json({ success: true, profile })
})

// 保存用户偏好
router.post('/preference', async (req, res) => {
  const { userId, key, value } = req.body
  await longTermMemory.savePreference(userId, key, value)
  res.json({ success: true })
})

// 清除会话记忆
router.delete('/session/:sessionId', (req, res) => {
  memoryStore.clear(req.params.sessionId)
  res.json({ success: true })
})

export default router
```

## 设计建议

- 短期记忆设置 TTL 或消息上限，防止内存膨胀
- 长期记忆中的敏感字段（手机号、身份证）做脱敏或加密
- 提供用户数据删除接口以符合 GDPR/个保法合规要求
- 检索记忆定期清理低价值片段，控制向量库规模
