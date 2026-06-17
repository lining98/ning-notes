# 结构化输出

> 当模型需要返回结构化数据以便后端程序化处理时，建议使用明确的 schema 或 JSON 模板。

## 概述

结构化输出是指让 LLM 返回**符合预定义格式**（如 JSON）的数据，而非自由文本。典型场景：

- 信息提取（从文本中抽取姓名、日期、金额等）
- 表单填充、报表生成
- 下游 API 调用（模型输出直接作为另一个接口的入参）
- 分类/打分/判断（返回固定字段的结果）

## node 示例(express)

### 服务层

- travelService.js

````js
import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import 'dotenv/config'

class TravelService {
  constructor() {
    this.llm = null
    this.initLLM()
  }

  initLLM() {
    const provider = process.env.MODEL_PROVIDER
    let apiKey, baseURL, model
    if (provider === 'SILICONFLOW') {
      apiKey = process.env.SILICONFLOW_API_KEY
      baseURL = process.env.SILICONFLOW_BASE_URL
      model = process.env.SILICONFLOW_MODEL
    } else if (provider === 'DEEPSEEK') {
      apiKey = process.env.DEEPSEEK_API_KEY
      baseURL = process.env.DEEPSEEK_BASE_URL
      model = process.env.DEEPSEEK_MODEL
    } else {
      throw new Error('不支持的模型提供者')
    }

    this.llm = new ChatOpenAI({
      configuration: {
        apiKey: apiKey,
        baseURL: baseURL,
      },
      model,
      temperature: 0.7, // 输出间隔
      streaming: true, // 开启流式输出
    })
  }

  async recommend(city, budget, days) {
    if (budget < 100 || days < 1 || days > 30) {
      throw new Error('预算不能低于100元，天数必须在1到30之间')
    }
    const message = this.getTravelPrompt(city, budget, days)
    try {
      const response = await this.llm.invoke(message)
      console.log(response)
      // 获取模型输出的文本内容
      const fullResponse = response.content || ''
      try {
        const jsonMatch =
          fullResponse.match(/```json\n([\s\S]*?)\n```/) ||
          fullResponse.match(/```\n([\s\S]*?)\n```/) ||
          fullResponse.match(/\{[\s\S]*\}/)

        // 处理之后的json数据
        return JSON.parse(jsonMatch[1])
      } catch (error) {
        return {
          success: false,
          error: 'JSON解析失败',
          rawResponse: error.message,
        }
      }
    } catch (err) {
      return {
        success: false,
        error: err.message,
      }
    }
  }

  getTravelPrompt(city, budget, days) {
    return [
      new HumanMessage(`你是一个专业的旅游规划师，擅长根据用户的需求生成详细的旅行行程。
        请根据以下信息为用户生成一份详细的旅游规划：
        - 目的地城市：${city}
        - 预算：${budget}元
        - 旅行天数：${days}天

        要求：
        1. 每天的行程安排（上午、下午、晚上）
        2. 每个景点的详细介绍
        3. 交通建议
        4. 预算分配明细
        5. 注意事项

        请以JSON格式输出,结构如下：
        {
          "success": true,
          "city": "城市名",
          "days": 天数,
          "totalBudget": 总预算,
          "dailyItinerary": [
            {
              "day": 1,
              "date": "第1天",
              "morning": {
                "spot": "景点名称",
                "duration": "游览时长",
                "ticket": "门票价格",
                "transportation": "交通方式",
                "description": "景点介绍"
              },
              "afternoon": {
                "spot": "景点名称",
                "duration": "游览时长",
                "ticket": "门票价格",
                "transportation": "交通方式",
                "description": "景点介绍"
              },
              "evening": {
                "spot": "活动名称",
                "duration": "活动时长",
                "ticket": "费用",
                "transportation": "交通方式",
                "description": "活动介绍"
              }
            }
          ],
          "budgetBreakdown": {
            "accommodation": 住宿费用,
            "food": 餐饮费用,
            "transportation": 交通费用,
            "tickets": 门票费用,
            "other": 其他费用
          },
          "tips": ["提示1", "提示2", "提示3"],
          "warnings": ["注意事项1", "注意事项2"]
        }

        请确保JSON格式正确,可以被解析。`),
    ]
  }
}

export default new TravelService()
````

### 控制器层

```js
import express from 'express'
import travelService from '../services/travelService.js'

const router = express.Router()

router.post('/recommend', async (req, res) => {
  console.log(req.body)
  const { city, budget, days } = req.body
  if (!city || !budget || !days) {
    return res.status(400).json({
      success: false,
      error: '缺少必要参数，请提供city、budget和days',
    })
  }
  const result = await travelService.recommend(city, budget, days)
  return res.json(result)
})

export default router
```

校验建议：使用 JSON Schema 或自定义校验器，当校验失败时返回可解释的错误并回退到人工处理或重试。
