# 混合检索

> 介绍混合检索的核心原理、融合策略，以及 Node.js 中结合向量检索与 BM25 的完整实现。

## 概述

混合检索（Hybrid Search）结合**稀疏检索**（关键词匹配）与**稠密检索**（语义向量），在多种场景下比单一策略更稳健：

- 向量检索擅长语义理解，但对专有名词/冷门术语可能漏检
- 关键词检索精确匹配术语，但无法理解同义词和语义变化
- 混合检索互补短板，提升整体召回率

## 融合策略

### 策略一：RRF（倒数排名融合）

RRF 不依赖绝对分数，只基于排名位置融合，避免不同检索器分数尺度不一致的问题。

- hybridSearchService.js

```js
import { vectorRetrieval } from './retrievalService.js'
import { keywordRetrieval } from './bm25Service.js'

// RRF 融合算法
function rrfFusion(resultsList, k = 60) {
  const scoreMap = new Map()

  for (const results of resultsList) {
    for (let rank = 0; rank < results.length; rank++) {
      const { id } = results[rank]
      const rrfScore = 1 / (k + rank + 1)
      const existing = scoreMap.get(id)

      if (existing) {
        existing.score += rrfScore
        existing.sources++
      } else {
        scoreMap.set(id, {
          ...results[rank],
          score: rrfScore,
          sources: 1,
        })
      }
    }
  }

  return Array.from(scoreMap.values()).sort((a, b) => b.score - a.score)
}

// RRF 混合检索
export async function hybridSearchRRF(query, topK = 10) {
  const [vecResults, kwResults] = await Promise.all([
    vectorRetrieval(query, topK * 3),
    keywordRetrieval(query, topK * 3),
  ])

  const fused = rrfFusion([vecResults, kwResults])
  return fused.slice(0, topK)
}
```

### 策略二：加权分数融合

- hybridSearchService.js（续）

```js
// 加权分数融合（需先归一化各自分数到 0-1 区间）
function normalizeScores(results) {
  if (results.length === 0) return results
  const maxScore = Math.max(...results.map((r) => r.score))
  const minScore = Math.min(...results.map((r) => r.score))
  const range = maxScore - minScore || 1

  return results.map((r) => ({
    ...r,
    score: (r.score - minScore) / range,
  }))
}

// 加权混合检索
export async function hybridSearchWeighted(query, topK = 10, vecWeight = 0.6) {
  const [vecResults, kwResults] = await Promise.all([
    vectorRetrieval(query, topK * 3),
    keywordRetrieval(query, topK * 3),
  ])

  const normVec = normalizeScores(vecResults)
  const normKw = normalizeScores(kwResults)
  const kwWeight = 1 - vecWeight

  const merged = new Map()

  for (const r of normVec) {
    merged.set(r.id, { ...r, score: r.score * vecWeight })
  }

  for (const r of normKw) {
    const existing = merged.get(r.id)
    if (existing) {
      existing.score += r.score * kwWeight
    } else {
      merged.set(r.id, { ...r, score: r.score * kwWeight })
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
```

### 策略三：分层检索

- hybridSearchService.js（续）

```js
// 先关键词精确匹配，再向量语义扩展
export async function hybridSearchLayered(query, topK = 10) {
  // 第一层：关键词精确匹配
  const kwResults = await keywordRetrieval(query, topK)

  // 第二层：如果关键词结果不足，用向量检索补充
  if (kwResults.length < topK) {
    const existingIds = new Set(kwResults.map((r) => r.id))
    const vecResults = await vectorRetrieval(query, topK * 2)
    const supplements = vecResults.filter((r) => !existingIds.has(r.id))
    return [...kwResults, ...supplements].slice(0, topK)
  }

  return kwResults
}
```

## 控制器层

```js
import express from 'express'
import { hybridSearchRRF, hybridSearchWeighted } from '../services/hybridSearchService.js'

const router = express.Router()

router.post('/search', async (req, res) => {
  const { query, topK = 10, mode = 'rrf', vecWeight = 0.6 } = req.body
  if (!query) {
    return res.status(400).json({ success: false, error: '缺少 query' })
  }

  let results
  if (mode === 'weighted') {
    results = await hybridSearchWeighted(query, topK, vecWeight)
  } else {
    results = await hybridSearchRRF(query, topK)
  }

  res.json({ success: true, total: results.length, results })
})

export default router
```

## 实践建议

- RRF 是首选方案，无需调参，对分数尺度不敏感
- 对精确术语查询（如错误码、产品名）提高关键词权重
- 对自然语言描述查询提高向量权重
- 冷启动时关键词检索可作为兜底，弥补 embedding 覆盖不足
