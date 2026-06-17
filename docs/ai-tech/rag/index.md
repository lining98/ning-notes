# RAG 知识库

本章节面向开发者，覆盖 RAG（检索增强生成）的完整技术栈：Embedding 原理、向量数据库、文本切片、召回策略、重排序、混合检索与端到端实战。

## 概述

RAG（Retrieval-Augmented Generation）将检索组件与生成模型结合，通过检索相关知识片段来增强模型回答的准确性与可解释性，有效解决 LLM 的"幻觉"问题和知识截止日期限制。

典型流程：

```
文档加载 → 文本切片 → 向量化（Embedding） → 写入向量数据库
                                                      ↓
用户提问 → 向量化 → 向量检索 → 重排序 → 拼接 Prompt → LLM 生成回答
```

核心优势：

- **知识可更新**：更新文档即可，无需重新训练模型
- **可解释性**：回答可追溯到具体来源文档
- **领域适配**：注入私有知识库，解决通用模型领域盲区

## 快速须知

- 选择 Embedding 模型时需保持一致，不同模型向量不可混用
- 切片质量直接影响检索精度，建议根据文档类型选择切分策略
- 混合检索（向量 + 关键词）通常优于单一策略
- 生产环境需监控召回质量并建立反馈闭环

## 本节子页面

- [Embedding 原理](/ai-tech/rag/embedding) — 向量化概念与模型选型
- [向量数据库](/ai-tech/rag/vector-db) — Pinecone 等向量库的 CRUD 操作
- [文本切片 Chunk](/ai-tech/rag/chunk) — 四种切片策略与元数据管理
- [召回策略](/ai-tech/rag/retrieval) — 向量检索、BM25 与组合召回
- [重排序 Rerank](/ai-tech/rag/rerank) — Cohere/Jina/本地三种精排方案
- [混合检索](/ai-tech/rag/hybrid-search) — RRF、加权融合、分层检索
- [知识库实战](/ai-tech/rag/project) — 端到端 RAG 问答系统搭建
