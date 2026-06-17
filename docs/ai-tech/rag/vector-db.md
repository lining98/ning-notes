# 向量数据库

> 介绍向量数据库的核心概念、选型对比，以及 Node.js 中使用 Pinecone 的完整 CRUD 示例。

## 概述

向量数据库专门存储和检索高维向量，通过近似最近邻（ANN）算法实现高效相似度搜索。

核心概念：

- **索引类型**：Flat（精确暴力搜索）、IVF（倒排索引）、HNSW（分层可导航小世界图）
- **距离度量**：cosine（余弦）、euclidean（欧氏）、dotproduct（内积）
- **元数据过滤**：在向量检索基础上叠加标量条件过滤

## 选型对比

| 数据库   | 部署方式  | 特点                          |
| -------- | --------- | ----------------------------- |
| Pinecone | 云服务    | 全托管、零运维、易上手        |
| Chroma   | 本地/云   | 开源轻量、适合开发调试        |
| Milvus   | 自托管    | 分布式、高性能、支持 GPU 索引 |
| Weaviate | 自托管/云 | 内置向量化模块、GraphQL 接口  |
| FAISS    | 本地库    | Meta 出品、纯 ANN 算法库      |

## Node 示例（Pinecone）

### 初始化与索引管理

- vectorDbService.js

```js
import { Pinecone } from '@pinecone-database/pinecone'
import 'dotenv/config'

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY })

// 创建索引（只需执行一次，dimension 需与 embedding 模型维度一致）
export async function createIndex(name = 'my-rag', dimension = 1536) {
  const existing = await pc.listIndexes()
  if (existing.indexes?.some((idx) => idx.name === name)) {
    console.log('索引已存在:', name)
    return
  }
  await pc.createIndex({
    name,
    dimension,
    metric: 'cosine',
    spec: {
      serverless: { cloud: 'aws', region: 'us-east-1' },
    },
  })
}

// 获取索引实例
export function getIndex(name = 'my-rag') {
  return pc.index(name)
}
```

### 数据操作

- vectorDbService.js（续）

```js
// 批量插入/更新向量
export async function upsertVectors(records, indexName = 'my-rag') {
  const index = getIndex(indexName)
  await index.upsert(
    records.map((r) => ({
      id: r.id,
      values: r.vector,
      metadata: r.metadata || {},
    })),
  )
}

// 相似度搜索（支持元数据过滤）
export async function search(queryVector, topK = 5, filter = {}, indexName = 'my-rag') {
  const index = getIndex(indexName)
  const result = await index.query({
    vector: queryVector,
    topK,
    filter,
    includeMetadata: true,
    includeValues: false,
  })
  return result.matches.map((m) => ({
    id: m.id,
    score: m.score,
    metadata: m.metadata,
  }))
}

// 按 ID 删除
export async function deleteByIds(ids, indexName = 'my-rag') {
  const index = getIndex(indexName)
  await index.deleteMany(ids)
}

// 按元数据过滤删除
export async function deleteByFilter(filter, indexName = 'my-rag') {
  const index = getIndex(indexName)
  await index.deleteMany(filter)
}
```

### 控制器层

```js
import express from 'express'
import { embed } from '../services/embeddingService.js'
import { upsertVectors, search, deleteByIds } from '../services/vectorDbService.js'

const router = express.Router()

// 写入知识库
router.post('/ingest', async (req, res) => {
  const { id, text, metadata } = req.body
  if (!id || !text) {
    return res.status(400).json({ success: false, error: '缺少 id 或 text' })
  }
  const vector = await embed(text)
  await upsertVectors([{ id, vector, metadata }])
  res.json({ success: true, message: '写入成功' })
})

// 批量写入
router.post('/ingest-batch', async (req, res) => {
  const { items } = req.body
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ success: false, error: '缺少 items 数组' })
  }
  const records = []
  for (const item of items) {
    const vector = await embed(item.text)
    records.push({ id: item.id, vector, metadata: item.metadata })
  }
  await upsertVectors(records)
  res.json({ success: true, count: records.length })
})

// 检索
router.post('/search', async (req, res) => {
  const { query, topK = 5, filter = {} } = req.body
  if (!query) {
    return res.status(400).json({ success: false, error: '缺少 query' })
  }
  const queryVec = await embed(query)
  const results = await search(queryVec, topK, filter)
  res.json({ success: true, results })
})

// 删除
router.delete('/vectors/:id', async (req, res) => {
  await deleteByIds([req.params.id])
  res.json({ success: true })
})

export default router
```

## 性能优化建议

- 批量 upsert 减少网络往返，单批建议 100-500 条
- 使用 metadata 过滤缩小搜索范围，避免全库扫描
- HNSW 索引调参：增大 `M` 提高召回率但增加内存，增大 `efConstruction` 提高构建质量
- 对高频查询结果做缓存，减少重复向量检索
