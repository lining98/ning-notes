# 召回策略

> 介绍 RAG 中的多种召回策略及 Node.js 实现，涵盖向量检索、关键词检索（BM25）与组合召回。

## 概述

召回（Retrieval）阶段从知识库中检索与用户查询最相关的候选文本，是决定 RAG 回答质量的关键环节。

三种核心策略：

- **向量检索（Dense）**：基于语义相似度，适合理解含义相近的查询
- **关键词检索（Sparse/BM25）**：基于词频匹配，适合精确术语查找
- **混合召回**：结合两者优势，互补短板

## 向量检索

- retrievalService.js

```js
import { embed } from './embeddingService.js'
import { search } from './vectorDbService.js'

// 基于向量相似度的语义检索
export async function vectorRetrieval(query, topK = 10, filter = {}) {
  const queryVec = await embed(query)
  const results = await search(queryVec, topK, filter)
  return results
}
```

## 关键词检索（BM25）

- bm25Service.js

```js
// 简易 BM25 实现，生产环境建议使用 Elasticsearch 或专用库
class BM25 {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1
    this.b = b
    this.documents = []
    this.docLengths = []
    this.avgDocLength = 0
    this.termDocFreq = new Map() // 词 → 出现该词的文档数
    this.totalDocs = 0
  }

  // 分词（简易中文按字符，英文按空格）
  tokenize(text) {
    return text
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0)
  }

  // 索引文档
  addDocuments(docs) {
    for (const doc of docs) {
      const tokens = this.tokenize(doc.content)
      this.documents.push(doc)
      this.docLengths.push(tokens.length)
      this.totalDocs++

      const uniqueTokens = new Set(tokens)
      for (const token of uniqueTokens) {
        const count = this.termDocFreq.get(token) || 0
        this.termDocFreq.set(token, count + 1)
      }
    }
    this.avgDocLength = this.docLengths.reduce((a, b) => a + b, 0) / this.totalDocs
  }

  // 计算 IDF
  idf(term) {
    const docFreq = this.termDocFreq.get(term) || 0
    if (docFreq === 0) return 0
    return Math.log((this.totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1)
  }

  // 对单条查询打分
  search(query, topK = 10) {
    const queryTokens = this.tokenize(query)
    const scores = this.documents.map((doc, idx) => {
      const docTokens = this.tokenize(doc.content)
      const docLen = this.docLengths[idx]
      let score = 0
      for (const term of queryTokens) {
        const tf = docTokens.filter((t) => t === term).length
        const idf = this.idf(term)
        score +=
          (idf * (tf * (this.k1 + 1))) /
          (tf + this.k1 * (1 - this.b + (this.b * docLen) / this.avgDocLength))
      }
      return { ...doc, score }
    })
    return scores.sort((a, b) => b.score - a.score).slice(0, topK)
  }
}

export const bm25Index = new BM25()

// 关键词检索入口
export async function keywordRetrieval(query, topK = 10) {
  return bm25Index.search(query, topK)
}
```

## 组合召回

- retrievalService.js（续）

```js
import { vectorRetrieval } from './retrievalService.js'
import { keywordRetrieval } from './bm25Service.js'

// 并行执行两种召回，合并去重
export async function hybridRetrieval(query, topK = 10) {
  const [vecResults, kwResults] = await Promise.all([
    vectorRetrieval(query, topK * 2),
    keywordRetrieval(query, topK * 2),
  ])

  // 按 ID 去重合并
  const merged = new Map()
  for (const r of vecResults) {
    merged.set(r.id, { ...r, source: 'vector' })
  }
  for (const r of kwResults) {
    if (!merged.has(r.id)) {
      merged.set(r.id, { ...r, source: 'keyword' })
    }
  }

  return Array.from(merged.values()).slice(0, topK)
}
```

## 控制器层

```js
import express from 'express'
import { vectorRetrieval, hybridRetrieval } from '../services/retrievalService.js'

const router = express.Router()

router.post('/search', async (req, res) => {
  const { query, topK = 5, mode = 'vector' } = req.body
  if (!query) {
    return res.status(400).json({ success: false, error: '缺少 query' })
  }

  let results
  if (mode === 'hybrid') {
    results = await hybridRetrieval(query, topK)
  } else {
    results = await vectorRetrieval(query, topK)
  }

  res.json({ success: true, total: results.length, results })
})

export default router
```

## 实践建议

- 短查询/精确术语优先用 BM25，长查询/语义理解优先用向量检索
- 对召回结果做多样性去重，避免返回重复内容
- 召回 topK 建议 10-20，再交给 rerank 精排至 3-5 条
