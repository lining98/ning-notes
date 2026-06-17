# 重排序 Rerank

> 介绍 Rerank 的核心原理、主流方案以及 Node.js 调用 Cohere / Jina Rerank API 的完整示例。

## 概述

Rerank（重排序）对召回阶段返回的候选文档进行二次精排，使用更精确但计算成本更高的模型，提升最终结果的相关性。

核心思路：

- **召回阶段**：用轻量模型快速筛选 Top-N（如 50 条）
- **重排阶段**：用精确模型对 Top-N 重新打分，取 Top-K（如 3-5 条）

## 方案对比

| 方案                 | 精度 | 速度 | 适用场景           |
| -------------------- | ---- | ---- | ------------------ |
| Cohere Rerank        | 高   | 快   | 通用场景，API 调用 |
| Jina Reranker        | 高   | 快   | 多语言，API 调用   |
| BGE-Reranker（本地） | 高   | 中   | 隐私敏感，本地部署 |
| cross-encoder        | 最高 | 慢   | 小批量精排         |

## Node 示例（Cohere Rerank）

### 服务层

- rerankService.js

```js
import { CohereClient } from 'cohere-ai'
import 'dotenv/config'

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY })

// 调用 Cohere Rerank API 对候选文档重排序
export async function rerank(query, documents, topN = 5) {
  const response = await cohere.rerank({
    query,
    documents: documents.map((d) => d.content),
    topN,
    model: 'rerank-v3.5',
    returnDocuments: false,
  })

  return response.results.map((r) => ({
    index: r.index,
    score: r.relevanceScore,
    document: documents[r.index],
  }))
}
```

### Jina Rerank 备选方案

- rerankService.js（续）

```js
// Jina Reranker API（多语言支持好，中文效果好）
export async function rerankWithJina(query, documents, topN = 5) {
  const response = await fetch('https://api.jina.ai/v1/rerank', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.JINA_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'jina-reranker-v2-base-multilingual',
      query,
      documents: documents.map((d) => d.content),
      top_n: topN,
    }),
  })

  const data = await response.json()
  return data.results.map((r) => ({
    index: r.index,
    score: r.relevance_score,
    document: documents[r.index],
  }))
}
```

### 本地 BGE-Reranker 方案

- rerankService.js（续）

```js
// 使用 Transformers.js 本地运行 BGE-Reranker
export async function rerankLocal(query, documents, topN = 5) {
  const { pipeline } = await import('@xenova/transformers')

  const reranker = await pipeline('text-classification', 'Xenova/bge-reranker-base')

  const pairs = documents.map((doc) => ({
    text: query,
    text_pair: doc.content,
  }))

  const results = await reranker(pairs, { topk: topN })
  return results
    .map((r, i) => ({ index: i, score: r.score, document: documents[i] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
}
```

### 控制器层

```js
import express from 'express'
import { rerank } from '../services/rerankService.js'

const router = express.Router()

router.post('/rerank', async (req, res) => {
  const { query, documents, topN = 5 } = req.body
  if (!query || !documents || !Array.isArray(documents)) {
    return res.status(400).json({ success: false, error: '缺少 query 或 documents' })
  }

  const results = await rerank(query, documents, topN)
  res.json({ success: true, results })
})

export default router
```

## 完整 RAG 检索管道

```js
import { vectorRetrieval } from '../services/retrievalService.js'
import { rerank } from '../services/rerankService.js'

// 召回 → 重排 完整管道
export async function retrieveAndRerank(query, topK = 5, recallSize = 20) {
  // 第一步：向量召回 Top-20
  const candidates = await vectorRetrieval(query, recallSize)

  // 第二步：Rerank 精排至 Top-5
  const ranked = await rerank(query, candidates, topK)

  return ranked
}
```

## 性能权衡

- 在线场景优先用 API 方案（Cohere/Jina），延迟低
- 离线/批量处理可用本地模型，成本更低
- 召回数量建议 20-50，rerank 后取 3-5 条注入 prompt
