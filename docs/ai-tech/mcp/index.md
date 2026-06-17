# MCP 开发

本章节面向开发者，深入介绍 MCP（Model Context Protocol）的协议原理、Server/Client 开发、工具注册与端到端实战。

## MCP 网站库

> [https://smithery.ai/](https://smithery.ai/)
>
> [https://mcp.so/](https://mcp.so/)

## 概述

MCP（Model Context Protocol）是 Anthropic 推出的开放协议，旨在标准化 AI 模型与外部工具、数据源之间的交互方式。可以理解为"AI 应用的 USB-C 接口"——统一标准，即插即用。

核心价值：

- **互操作性**：不同厂商的模型和工具通过统一协议互通
- **解耦**：Server 提供工具，Client（AI 应用）消费工具，各司其职
- **安全**：标准化的权限模型和能力声明，避免任意代码执行
- **可扩展**：新增工具只需实现 Server 端，无需修改 Client

## 架构模型

```
┌──────────────┐         JSON-RPC          ┌──────────────┐
│  MCP Client  │ ◄──────────────────────► │  MCP Server  │
│  (AI 应用)    │    initialize/capabilities │  (工具提供方)  │
│              │    tools/list              │              │
│  Claude/GPT  │    tools/call              │  数据库/API   │
│  等模型       │    notifications           │  文件系统     │
└──────────────┘                            └──────────────┘
```

核心概念：

- **Client**：AI 应用端，发起连接、发现工具、调用工具
- **Server**：工具提供端，注册工具、处理调用、返回结果
- **Transport**：传输层，支持 stdio（本地进程）和 HTTP/SSE（远程）
- **Capability**：能力声明，Server 告知 Client 自己支持哪些功能

## 快速须知

- MCP 基于 JSON-RPC 2.0 协议，通信格式为结构化 JSON
- 传输层支持 stdio（本地进程通信）和 HTTP + SSE（远程通信）
- 工具注册需声明名称、描述和参数 JSON Schema
- 生产环境需考虑认证、授权和速率限制

## 本节子页面

- [MCP 协议原理](/ai-tech/mcp/protocol) — 消息格式、生命周期、能力协商
- [MCP Server 开发](/ai-tech/mcp/server) — 工具注册、传输层、权限校验
- [MCP Client 开发](/ai-tech/mcp/client) — 连接管理、工具发现与调用
- [MCP 实战案例](/ai-tech/mcp/project) — 端到端 MCP 应用搭建
