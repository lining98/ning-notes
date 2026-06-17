# 文本切片 Chunk

> 介绍文本切片的多种策略及其 Node.js 实现，涵盖固定长度、滑动窗口、语义切分与元数据管理。

## 概述

将长文档切分为较小片段（chunk）是 RAG 的关键预处理步骤。切片质量直接影响检索精度：

- 太小：语义不完整，丢失上下文
- 太大：向量稀释，检索精度下降

核心权衡：**上下文完整性** vs **向量质量**。

## 切片策略

### 策略一：固定长度切分

- chunkService.js

```js
// 按字符数固定切分，最简单直接
export function chunkBySize(text, chunkSize = 500) {
  const chunks = []
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push({
      content: text.slice(i, i + chunkSize),
      index: chunks.length,
      startChar: i,
      endChar: Math.min(i + chunkSize, text.length),
    })
  }
  return chunks
}
```

### 策略二：滑动窗口（推荐）

- chunkService.js（续）

```js
// 带重叠的滑动窗口，保留上下文连贯性
export function chunkBySlidingWindow(text, chunkSize = 500, overlap = 100) {
  const chunks = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push({
      content: text.slice(start, end),
      index: chunks.length,
      startChar: start,
      endChar: end,
    })
    start += chunkSize - overlap
  }
  return chunks
}
```

### 策略三：语义切分（按段落/句子）

- chunkService.js（续）

```js
// 按自然段落切分，保留语义完整性
export function chunkByParagraph(text, maxChunkSize = 1000) {
  const paragraphs = text.split(/\n\s*\n/)
  const chunks = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    // 如果当前块加上新段落不超过上限，则合并
    if (current.length + trimmed.length <= maxChunkSize) {
      current += (current ? '\n\n' : '') + trimmed
    } else {
      if (current) chunks.push(current)
      current = trimmed
    }
  }
  if (current) chunks.push(current)

  return chunks.map((content, index) => ({ content, index }))
}
```

### 策略四：Markdown 结构切分

- chunkService.js（续）

```js
// 按 Markdown 标题层级切分，保留文档结构
export function chunkByMarkdown(markdown) {
  const sections = markdown.split(/^(?=#{1,3}\s)/m)
  const chunks = []

  for (const section of sections) {
    const trimmed = section.trim()
    if (!trimmed) continue

    // 提取标题作为元数据
    const titleMatch = trimmed.match(/^(#{1,3})\s+(.+)/m)
    const title = titleMatch ? titleMatch[2] : '未命名'
    const level = titleMatch ? titleMatch[1].length : 0

    chunks.push({
      content: trimmed,
      index: chunks.length,
      metadata: { title, level },
    })
  }
  return chunks
}
```

## 元数据管理

- chunkService.js（续）

```js
// 为切片统一附加元数据，便于回溯和过滤
export function enrichChunks(chunks, source) {
  return chunks.map((chunk, i) => ({
    id: `${source.name}_chunk_${i}`,
    content: chunk.content,
    metadata: {
      source: source.name,
      sourceUrl: source.url || '',
      chunkIndex: i,
      totalChunks: chunks.length,
      startChar: chunk.startChar,
      endChar: chunk.endChar,
      ...chunk.metadata,
    },
  }))
}
```

## 控制器层示例

```js
import express from 'express'
import { chunkBySlidingWindow, enrichChunks } from '../services/chunkService.js'

const router = express.Router()

router.post('/chunk', async (req, res) => {
  const { text, source, chunkSize = 500, overlap = 100 } = req.body
  if (!text) {
    return res.status(400).json({ success: false, error: '缺少 text' })
  }
  const rawChunks = chunkBySlidingWindow(text, chunkSize, overlap)
  const chunks = enrichChunks(rawChunks, source || { name: 'unknown' })
  res.json({ success: true, total: chunks.length, chunks })
})

export default router
```

## 实践建议

- 中文文本建议 chunkSize 500-800 字符，overlap 100-200 字符
- 代码/技术文档优先使用 Markdown 结构切分
- 元数据中记录 source 和位置，便于生成答案时引用原文
- 切片后统计 token 数，确保不超过 embedding 模型输入上限
