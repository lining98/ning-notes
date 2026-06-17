# 多轮对话实现

> 介绍多轮对话的完整实现方案，包括会话存储、消息构建、RAG 增强、流式输出与角色提示设计。

## 概述

多轮对话的核心是在有限上下文窗口内管理 `system`、`user`、`assistant` 消息序列，使模型能"记住"之前的交流。关键环节：

- **会话存储**：将历史消息持久化（内存 / 文件 / 数据库）
- **消息构建**：拼接历史 + 新消息，控制 Token 不超限
- **RAG 增强**：当需要外部知识时，检索相关文档注入上下文
- **流式输出**：结合 SSE 实现实时打字效果

## 会话存储

### 内存存储（开发调试用）

- sessionStore.js

```js
// 简易内存会话存储，生产环境应替换为 Redis 或数据库
class SessionStore {
  constructor() {
    this.sessions = new Map()
  }

  create(sessionId) {
    this.sessions.set(sessionId, {
      id: sessionId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    return this.sessions.get(sessionId)
  }

  getOrCreate(sessionId) {
    return this.sessions.get(sessionId) || this.create(sessionId)
  }

  addMessage(sessionId, message) {
    const session = this.getOrCreate(sessionId)
    session.messages.push(message)
    session.updatedAt = new Date().toISOString()
    return session
  }

  getMessages(sessionId) {
    return this.sessions.get(sessionId)?.messages || []
  }

  clear(sessionId) {
    this.sessions.delete(sessionId)
  }
}

export const sessionStore = new SessionStore()
```

### 文件存储（持久化方案）

- sessionDb.js

```js
import fs from 'fs/promises'
import path from 'path'

const DATA_DIR = './data/sessions'

// 确保目录存在
await fs.mkdir(DATA_DIR, { recursive: true }).catch(() => {})

export async function saveSession(sessionId, messages) {
  const filePath = path.join(DATA_DIR, `${sessionId}.json`)
  await fs.writeFile(
    filePath,
    JSON.stringify({ sessionId, messages, updatedAt: new Date().toISOString() }, null, 2),
  )
}

export async function loadSession(sessionId) {
  try {
    const filePath = path.join(DATA_DIR, `${sessionId}.json`)
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data)
  } catch {
    return { sessionId, messages: [] }
  }
}
```

## 消息构建

### 服务层

- chatService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { sessionStore } from '../stores/sessionStore.js'
import { countMessagesTokens } from '../utils/tokenUtils.js'
import 'dotenv/config'

class ChatService {
  constructor() {
    this.llm = null
    this.maxTokens = 4000
    this.systemPrompt = '你是一个友好的助手，请用中文回答。'
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
      temperature: 0.7,
      streaming: true,
    })
  }

  // 构建完整消息列表：系统提示 + 历史 + 新消息，Token 超限时截断
  buildMessages(sessionId, newUserMessage) {
    const history = sessionStore.getMessages(sessionId)
    let messages = [
      new SystemMessage(this.systemPrompt),
      ...history.map((m) =>
        m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
      ),
      new HumanMessage(newUserMessage),
    ]

    // Token 截断
    let totalTokens = countMessagesTokens(messages)
    while (totalTokens > this.maxTokens && messages.length > 2) {
      messages.splice(1, 1) // 从最早的历史消息开始移除（保留 system prompt）
      totalTokens = countMessagesTokens(messages)
    }
    return messages
  }

  async chat(sessionId, userMessage, streamCallback) {
    // 保存用户消息
    sessionStore.addMessage(sessionId, { role: 'user', content: userMessage })

    const messages = this.buildMessages(sessionId, userMessage)

    try {
      const stream = await this.llm.stream(messages)
      let fullResponse = ''
      for await (const chunk of stream) {
        const content = chunk.content || ''
        if (content.trim() === '') continue
        fullResponse += content
        if (streamCallback) streamCallback(content)
      }

      // 保存 AI 回复
      sessionStore.addMessage(sessionId, { role: 'assistant', content: fullResponse })
      return { success: true, reply: fullResponse }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }
}

export default new ChatService()
```

## 控制器层（流式 SSE）

```js
import express from 'express'
import chatService from '../services/chatService.js'
import { createStreamRespose } from '../utils/streamUtils.js'

const router = express.Router()

router.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body
  if (!message) {
    return res.status(400).json({ success: false, error: '缺少必要参数 message' })
  }

  const sid = sessionId || 'default'
  const stream = createStreamRespose(res)

  const result = await chatService.chat(sid, message, (chunk) => {
    stream.send({ type: 'chunk', content: chunk })
  })

  stream.send({ type: 'complete', data: result })
  stream.end()
})

// 清除会话
router.post('/clear', (req, res) => {
  const { sessionId } = req.body
  sessionStore.clear(sessionId || 'default')
  return res.json({ success: true, message: '会话已清除' })
})

export default router
```

## 前端调用示例

```js
import { fetchStream } from '../utils/request'

// 多轮对话：每次携带 sessionId 保持上下文
async function sendMessage(userMsg, sessionId) {
  fetchStream(
    'chat',
    { message: userMsg, sessionId },
    (chunk) => {
      /* 追加到当前 AI 消息 */
    },
    () => {
      /* 完成回调 */
    },
    (err) => {
      /* 错误回调 */
    },
  )
}
```

## 角色提示设计

```js
// system prompt 建议用常量管理，按场景切换
const PROMPTS = {
  default: '你是一个友好的助手，请用中文回答。',
  coder: '你是一个资深程序员，回答需包含代码示例和原理解释。',
  teacher: '你是一个耐心的老师，用通俗易懂的方式解释复杂概念。',
  restricted: '你是一个客服助手。禁止透露内部系统信息，禁止执行未授权操作。',
}

// 在 chatService 中按场景注入
function getSystemPrompt(scene = 'default') {
  return PROMPTS[scene] || PROMPTS.default
}
```

## 设计建议

- 对敏感操作在 `system` 提示中加入限制规则
- 定期清理过期会话，防止内存/存储膨胀
- 关键信息（用户偏好、上下文）可持久化到长期记忆
