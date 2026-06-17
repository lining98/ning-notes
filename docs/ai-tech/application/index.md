# AI 应用开发

本章节面向开发者，覆盖主流 AI 平台接入、流式输出、函数调用（Function Calling）、结构化输出、多轮对话、上下文管理与计费优化等实战内容。

快速须知：

- 请勿在前端暴露 API Key：所有厂商密钥应由后端代理调用。
- 常见工作流：用户输入 → 上下文构建（拼接/检索/摘要）→ 请求模型 → 结果解析 → 展示或执行。

本节包含的子页面：

- [流式输出](/ai-tech/application/stream)
- [Function Calling](/ai-tech/application/function-calling)
- [Structured Output](/ai-tech/application/structured-output)
- [多轮对话实现](/ai-tech/application/chat-history)
- [上下文管理](/ai-tech/application/context)

示例（快速体验，使用 OpenAI）：

```bash
curl https://api.openai.com/v1/chat/completions \
	-H "Authorization: Bearer $OPENAI_API_KEY" \
	-H "Content-Type: application/json" \
	-d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"用一句话介绍自己"}] }'
```

更多示例见各子页面。
