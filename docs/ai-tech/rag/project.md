# 知识库实战

> 通过完整端到端示例，演示从文档加载到 RAG 问答上线的全流程 Node.js 实现。

## 概述

本实战串联前面各模块，构建一个可运行的 RAG 知识库问答系统。

完整流程：

1. 文档加载与清洗
2. 文本切片（Chunk）
3. 向量化（Embedding）
4. 写入向量数据库
5. 查询 → 召回 → 重排 → 生成

## 项目结构

```
rag-project/
├── services/
│   ├── documentLoader.js    # 文档加载
│   ├── chunkService.js      # 文本切片
│   ├── embeddingService.js  # 向量化
│   ├── vectorDbService.js   # 向量库操作
│   ├── retrievalService.js  # 召回
│   ├── rerankService.js     # 重排
│   └── ragService.js        # RAG 主流程
├── routes/
│   ├── ingestRouter.js      # 入库路由
│   └── queryRouter.js       # 查询路由
└── app.js
```

## 第一步：文档加载

- services/documentLoader.js

```js
import fs from 'fs/promises'
import path from 'path'

// 从目录加载所有 .md 和 .txt 文件
export async function loadDocuments(dirPath) {
  const files = await fs.readdir(dirPath)
  const docs = []

  for (const file of files) {
    const ext = path.extname(file).toLowerCase()
    if (!['.md', '.txt', '.json'].includes(ext)) continue

    const filePath = path.join(dirPath, file)
    const content = await fs.readFile(filePath, 'utf-8')
    docs.push({
      name: file,
      path: filePath,
      content,
      type: ext.replace('.', ''),
    })
  }
  return docs
}
```

## 第二步：RAG 主流程服务

- services/ragService.js

```js
import { loadDocuments } from './documentLoader.js'
import { chunkBySlidingWindow, enrichChunks } from './chunkService.js'
import { embedBatch } from './embeddingService.js'
import { upsertVectors, createIndex } from './vectorDbService.js'
import { hybridSearchRRF } from './hybridSearchService.js'
import { rerank } from './rerankService.js'

class RagService {
  // 文档入库：加载 → 切片 → 向量化 → 写入向量库
  async ingestDirectory(dirPath) {
    const docs = await loadDocuments(dirPath)
    let totalChunks = 0

    for (const doc of docs) {
      // 1. 切片
      const rawChunks = chunkBySlidingWindow(doc.content, 500, 100)
      const chunks = enrichChunks(rawChunks, { name: doc.name, url: doc.path })

      // 2. 批量向量化
      const texts = chunks.map((c) => c.content)
      const vectors = await embedBatch(texts)

      // 3. 批量写入向量库
      const records = chunks.map((chunk, i) => ({
        id: chunk.id,
        vector: vectors[i],
        metadata: chunk.metadata,
      }))
      await upsertVectors(records)
      totalChunks += records.length

      console.log(`已入库: ${doc.name} (${records.length} 个切片)`)
    }

    return { success: true, documents: docs.length, chunks: totalChunks }
  }

  // RAG 问答：查询 → 召回 → 重排 → 生成
  async ask(query, llm, topK = 5) {
    // 1. 混合召回 Top-20
    const candidates = await hybridSearchRRF(query, 20)

    // 2. Rerank 精排至 Top-K
    const ranked = await rerank(query, candidates, topK)

    // 3. 构建 Prompt
    const context = ranked
      .map(
        (r, i) =>
          `[参考资料${i + 1}] 来源: ${r.document.metadata?.source || '未知'}\n${
            r.document.content
          }`,
      )
      .join('\n\n')

    const prompt = `请根据以下参考资料回答用户问题。如果参考资料中没有相关信息，请如实告知。

参考资料：
${context}

用户问题：${query}

请用中文回答，并在引用资料时注明来源。`

    // 4. 调用模型生成
    const response = await llm.invoke([
      { role: 'system', content: '你是一个知识库助手，请基于参考资料回答问题。' },
      { role: 'user', content: prompt },
    ])

    return {
      success: true,
      answer: response.content,
      sources: ranked.map((r) => ({
        id: r.document.id,
        source: r.document.metadata?.source,
        score: r.score,
        snippet: r.document.content.slice(0, 200),
      })),
    }
  }
}

export default new RagService()
```

## 第三步：路由层

- routes/ingestRouter.js

```js
import express from 'express'
import ragService from '../services/ragService.js'

const router = express.Router()

// 文档入库接口
router.post('/ingest', async (req, res) => {
  const { dirPath } = req.body
  if (!dirPath) {
    return res.status(400).json({ success: false, error: '缺少 dirPath' })
  }
  const result = await ragService.ingestDirectory(dirPath)
  res.json(result)
})

export default router
```

- routes/queryRouter.js

```js
import express from 'express'
import ragService from '../services/ragService.js'
import { ChatOpenAI } from '@langchain/openai'

const router = express.Router()

const llm = new ChatOpenAI({
  configuration: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  },
  model: 'gpt-4o-mini',
  temperature: 0.3,
})

// RAG 问答接口
router.post('/ask', async (req, res) => {
  const { query, topK = 5 } = req.body
  if (!query) {
    return res.status(400).json({ success: false, error: '缺少 query' })
  }
  const result = await ragService.ask(query, llm, topK)
  res.json(result)
})

export default router
```

## 应用入口

- app.js

```js
import express from 'express'
import ingestRouter from './routes/ingestRouter.js'
import queryRouter from './routes/queryRouter.js'
import { createIndex } from './services/vectorDbService.js'
import 'dotenv/config'

const app = express()
app.use(express.json())

app.use('/api/rag', ingestRouter)
app.use('/api/rag', queryRouter)

// 启动时创建索引
await createIndex('my-rag', 1536)

app.listen(3000, () => {
  console.log('RAG 服务已启动: http://localhost:3000')
})
```

## 上线建议

- 定期重建索引：文档更新后重新切片和向量化
- 监控召回质量：记录用户反馈，建立评估数据集
- 缓存热门查询：减少重复 embedding 和检索开销
- 流式输出：结合 SSE 实现实时打字效果，提升体验
