export const AISidebar = [
  {
    text: 'AI应用开发',
    collapsed: true,
    link: '/ai-tech/application/',
    items: [
      { text: '流式输出', link: '/ai-tech/application/stream' },
      { text: '结构化输出', link: '/ai-tech/application/structured-output' },
      { text: '函数调用', link: '/ai-tech/application/function-calling' },
      { text: '多轮对话实现', link: '/ai-tech/application/chat-history' },
      { text: '上下文管理', link: '/ai-tech/application/context' },
    ],
  },

  {
    text: 'RAG知识库',
    collapsed: true,
    link: '/ai-tech/rag/',
    items: [
      { text: 'RAG介绍', link: '/ai-tech/rag/' },
      { text: 'Embedding原理', link: '/ai-tech/rag/embedding' },
      { text: '向量数据库', link: '/ai-tech/rag/vector-db' },
      { text: '文本切片Chunk', link: '/ai-tech/rag/chunk' },
      { text: '召回策略', link: '/ai-tech/rag/retrieval' },
      { text: '重排序Rerank', link: '/ai-tech/rag/rerank' },
      { text: '混合检索', link: '/ai-tech/rag/hybrid-search' },
      { text: '知识库实战', link: '/ai-tech/rag/project' },
    ],
  },
  {
    text: 'Agent开发',
    collapsed: true,
    link: '/ai-tech/agent/',
    items: [
      { text: 'Agent介绍', link: '/ai-tech/agent/' },
      { text: 'Agent架构', link: '/ai-tech/agent/architecture' },
      { text: 'Tool Calling', link: '/ai-tech/agent/tool-calling' },
      { text: 'Memory机制', link: '/ai-tech/agent/memory' },
      { text: 'Planning规划', link: '/ai-tech/agent/planning' },
      { text: 'ReAct模式', link: '/ai-tech/agent/react' },
      { text: 'Multi-Agent', link: '/ai-tech/agent/multi-agent' },
      { text: 'Agent实战项目', link: '/ai-tech/agent/project' },
    ],
  },
  {
    text: 'MCP开发',
    collapsed: true,
    link: '/ai-tech/mcp/',
    items: [
      { text: 'MCP介绍', link: '/ai-tech/mcp/' },
      { text: 'MCP协议原理', link: '/ai-tech/mcp/protocol' },
      { text: 'MCP Server开发', link: '/ai-tech/mcp/server' },
      { text: 'MCP Client开发', link: '/ai-tech/mcp/client' },
      { text: 'MCP实战案例', link: '/ai-tech/mcp/project' },
    ],
  },
]
