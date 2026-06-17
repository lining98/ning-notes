# 流式输出

> 介绍后端如何通过 SSE、WebSocket 或 HTTP chunked 将模型输出以流式方式发送给前端，以及前端如何按段渲染。

## 后端 SSE（Node.js express）

### 流式响应

- streamUtils.js

```js
export const createStreamRespose = (res) => {
  // 设置响应头
  res.setHeader('Content-Type', 'text/event-stream')
  // 确保客户端每次都是接受最新的数据
  res.setHeader('Cache-Control', 'no-cache')
  // 保持 http 连接为长连接
  res.setHeader('Connection', 'keep-alive')

  return {
    send: (data) => {
      try {
        console.log(`data: ${JSON.stringify(data)}\n\n`)
        res.write(`data: ${JSON.stringify(data)}\n\n`)
      } catch (error) {
        console.error('流式发送错误:', error)
      }
    },
    end: () => {
      try {
        res.write('event: end\ndata:{"done":true}\n\n')
        res.end()
      } catch (error) {
        console.error('流式响应结束失败:', error)
      }
    },
    error: (message) => {
      try {
        //通知客户端发生错误
        res.write(`data: ${JSON.stringify(message)}\n\n`)
        res.end()
      } catch (err) {
        console.error('流式数据错误:', err)
      }
    },
  }
}
```

- travelService.js

```js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import 'dotenv/config'

class TravelService {
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
      configuration: {
        apiKey: apiKey,
        baseURL: baseURL,
      },
      model,
      temperature: 0.7, // 输出间隔
      streaming: true, // 开启流式输出
    })
  }

  async chat(message, streamCallback) {
    // 组装参数
    const messages = [
      new SystemMessage(`你是一个友好的旅游助手，请用中文回答用户关于旅游的问题。`),
      new HumanMessage(message),
    ]
    try {
      // 调用大模型获取流式响应
      const stream = await this.llm.stream(messages)
      let fullResponse = ''
      for await (const chunk of stream) {
        const content = chunk.content || ''
        // 如果返回的字符串为空，跳过
        if (content.trim() === '') {
          continue
        }
        fullResponse += content
        if (streamCallback) {
          streamCallback(content)
        }
      }
      return {
        success: true,
        reply: fullResponse,
      }
    } catch (err) {
      //捕获接口调用大模型异常
      return {
        success: false,
        error: err.message,
      }
    }
  }
}

export default new TravelService()
```

### 流式响应示例

```js
import express from 'express'
import travelService from '../services/travelService.js'
import { createStreamRespose } from '../utils/streamUtils.js'

const router = express.Router()

router.post('/chat', async (req, res) => {
  const { message } = req.body
  if (!message) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数，请提供message',
    })
  }

  // 对SSE流式接口返回进行处理
  const stream = createStreamRespose(res)

  // 调用服务层的chat方法，传入用户消息和流式回调函数
  const result = await travelService.chat(message, (chunk) => {
    stream.send({ type: 'chunk', content: chunk })
  })

  //发送完成通知
  stream.send({ type: 'complete', data: result })
  stream.end()
})

export default router
```

## 前端调用

### 前端请求封装

```js
export async function fetchStream(url, data, onChunk, onComplete, onError) {
  // 创建一个请求控制器
  const controller = new AbortController()
  const httpUrl = `http://127.0.0.1:3000/api/xxxx/${url}`
  try {
    const response = await fetch(httpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
      signal: controller.signal,
    })

    // 获取响应体的可读流的读取器
    const reader = response.body.getReader()
    // 将二进制数据解码为字符串
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter((line) => line.trim())

      for (const line of lines) {
        // console.log(line);     // data: {"type":"chunk","content":"你好"}
        try {
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6)
            const jsonData = JSON.parse(jsonStr)
            if (jsonData.type === 'chunk') {
              onChunk(jsonData.content)
            } else if (jsonData.type === 'complete') {
              onComplete()
            } else if (jsonData.error) {
              onError(jsonData.error)
            }
          }
        } catch (error) {
          onError('流式数据解析异常，请检查后端返回格式是否正确')
        }
      }
    }
    return controller.abort()
  } catch (error) {
    onError(error.message)
  }
}
```

### 前端调用示例

```vue
<template>
  <div class="chat-input-area">
    <div class="chat-container" ref="chatContainer">
      <div class="message-list">
        <!-- <聊天气泡组件 v-for="message in messages" :key="message.id" :message="message" /> -->
        <div v-if="isStreaming">
          <van-loading type="spinner" color="#1e88e5" size="20" />
          <span>AI 正在思考中...</span>
        </div>
      </div>
    </div>
    <van-field
      v-model="inputMessage"
      placeholder="输入您的问题..."
      :disabled="isStreaming"
      @keyup.enter="sendMessage"
    >
      <template #button>
        <van-button
          type="primary"
          size="small"
          :disabled="!inputMessage.trim() || isStreaming"
          @click="sendMessage"
        >
          发送
        </van-button>
      </template>
    </van-field>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { fetchStream } from '../utils/request'
import { showToast } from 'vant'

const chatContainer = ref(null) // 聊天容器
const messages = ref([])
const inputMessage = ref('')

const isStreaming = ref(false)

// 置底的方法
const scrollToBottom = () => {
  chatContainer.value.scrollTop = chatContainer.value.scrollHeight
}

const sendMessage = () => {
  const msg = inputMessage.value.trim()
  if (!msg || isStreaming.value) return
  addUserMessage(msg)
  inputMessage.value = ''
  // 进行流式请求
  fetchAIResponse(msg)
}

// 获取AI响应
const fetchAIResponse = (userMsg) => {
  isStreaming.value = true
  messages.value.push({
    id: Date.now() + 1,
    role: 'ai',
    content: '',
    timestamp: new Date().toISOString(),
  })

  let fullResponse = ''
  fetchStream(
    url, // 后端接口路径
    { message: userMsg }, // 用户输入的内容
    (chunk) => {
      fullResponse += chunk
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'ai') {
        lastMsg.content = fullResponse
        isStreaming.value = false
      }
      scrollToBottom()
    },
    () => {
      // AI返回完成
      isStreaming.value = false
      scrollToBottom()
    },
    (errMsg) => {
      const lastMsg = messages.value[messages.value.length - 1]
      if (lastMsg && lastMsg.role === 'ai') {
        lastMsg.content = `抱歉，AI发生错误：${errMsg}`
      }
      isStreaming.value = false
      showToast('AI 回复异常，请稍后重试')
      scrollToBottom()
    },
  )
}

// 用户发送消息
const addUserMessage = (message) => {
  messages.value.push({
    id: Date.now(),
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  })
}
</script>
```
