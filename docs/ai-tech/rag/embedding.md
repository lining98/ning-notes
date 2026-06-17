# Embedding 原理

> 介绍 Embedding（向量嵌入）的核心概念、模型选型、Node.js 调用示例以及相似度计算。

## 概述

Embedding 将文本映射到高维向量空间，语义相近的文本在向量空间中距离更近。这是 RAG 检索的核心基础。

核心概念：

- **向量维度**：常见 768（BERT）、1536（OpenAI ada-002）、3072（text-embedding-3-large）
- **相似度度量**：余弦相似度、欧氏距离、内积
- **归一化**：对向量做 L2 归一化后，内积等价于余弦相似度

## 模型选型

| 模型                          | 维度 | 特点                   |
| ----------------------------- | ---- | ---------------------- |
| OpenAI text-embedding-3-small | 1536 | 性价比高，支持缩短维度 |
| OpenAI text-embedding-3-large | 3072 | 精度最高               |
| BGE-M3（本地部署）            | 1024 | 支持中英文，可本地部署 |
| Cohere embed-v3               | 1024 | 多语言支持好           |

## Node 示例

### Embedding 调用

- embeddingService.js

```js
import OpenAI from 'openai'
import 'dotenv/config'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
})

// 单条文本向量化
export async function embed(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

// 批量向量化（节省 API 调用次数）
export async function embedBatch(texts) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  })
  return response.data.map((d) => d.embedding)
}
```

### 相似度计算

- similarityUtils.js

```js
// 余弦相似度（范围 -1 到 1，越接近 1 越相似）
export function cosineSimilarity(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0)
  const normA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0))
  const normB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0))
  return dot / (normA * normB)
}

// 欧氏距离（越小越相似）
export function euclideanDistance(a, b) {
  return Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0))
}

// L2 归一化
export function normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  return vec.map((v) => v / norm)
}

// 批量计算最相似的 Top-K
export function topKSimilarity(queryVec, candidates, k = 5) {
  return candidates
    .map(({ id, vector, metadata }) => ({
      id,
      score: cosineSimilarity(queryVec, vector),
      metadata,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
```

### 控制器层

```js
import express from 'express'
import { embed, embedBatch } from '../services/embeddingService.js'
import { cosineSimilarity } from '../utils/similarityUtils.js'

const router = express.Router()

router.post('/similarity', async (req, res) => {
  const { text1, text2 } = req.body
  if (!text1 || !text2) {
    return res.status(400).json({ success: false, error: '缺少 text1 或 text2' })
  }
  const [e1, e2] = await embedBatch([text1, text2])
  const score = cosineSimilarity(e1, e2)
  return res.json({ success: true, similarity: score })
})

export default router
```

## 注意事项

- 同一项目使用**同一模型**做 embedding，不同模型的向量不可混用
- 长文本先切片再向量化，避免超出模型最大输入长度
- 批量调用减少 API 延迟，但注意单次输入 token 上限
