# AI Workflow 工具接口

本文档定义 Dify 或其他 AI Workflow 平台可调用的本地工具接口。

## 查询候选资源子图

`POST /api/resource-graph/query-candidates`

请求示例：

```json
{
  "taskIntent": {
    "missionType": "侦察打击",
    "operationArea": "台湾东部海域",
    "side": "blue",
    "objectives": ["建立前出侦察", "压制海上目标"],
    "constraints": ["不进入禁入区"]
  },
  "requirementPlan": {
    "requiredCapabilities": ["air_recon", "ew_support", "long_range_strike"],
    "requiredChains": ["command", "communication", "detection", "strike"],
    "preferredResourceTypes": ["air-recon", "air-jammer", "air-multirole"]
  }
}
```

## 校验资源编排

`POST /api/resource-graph/validate-orchestration`

请求示例：

```json
{
  "id": "orchestration-demo-001",
  "taskIntent": {
    "missionType": "侦察打击",
    "operationArea": "台湾东部海域",
    "side": "blue",
    "objectives": ["建立前出侦察", "压制海上目标"],
    "constraints": ["不进入禁入区"]
  },
  "requirementPlan": {
    "requiredCapabilities": ["air_recon", "long_range_strike"],
    "requiredChains": ["command", "communication", "detection", "strike"],
    "preferredResourceTypes": ["air-recon", "air-multirole"]
  },
  "selectedResources": [
    {
      "resourceId": "platform-blue-recon-001",
      "role": "reconnaissance",
      "reason": "具备电子侦察能力",
      "evidenceIds": ["rel-recon-detects-zone"]
    },
    {
      "resourceId": "platform-blue-strike-001",
      "role": "strike",
      "reason": "具备远程打击能力",
      "evidenceIds": ["rel-strike-covers-zone"]
    }
  ],
  "chains": [
    {
      "chainType": "detection",
      "relationshipIds": ["rel-recon-detects-zone"],
      "explanation": "电子侦察平台覆盖目标海域"
    },
    {
      "chainType": "strike",
      "relationshipIds": ["rel-strike-covers-zone"],
      "explanation": "远程打击编队覆盖目标海域"
    }
  ],
  "evidence": [
    {
      "id": "rel-recon-detects-zone",
      "type": "relationship",
      "label": "侦察覆盖关系",
      "source": "resource-graph"
    }
  ],
  "summary": "基于真实资源图谱生成侦察打击草案。"
}
```

## 生成想定草案

`POST /api/scenario/generate-from-orchestration`

请求体使用 `validate-orchestration` 的同一份资源编排草案。

## 校验并暂存想定草案

`POST /api/scenario/validate-and-stage`

请求体使用 `generate-from-orchestration` 返回的草案。
