# OpenCode V2 的 DeepSeek 搜索插件

把 DeepSeek Search / Fetch 接进 OpenCode V2：**内置 `websearch` 工具直接走 DeepSeek**，另带干净的 Markdown
抓取工具与本地用量/费用统计。改一个选项即可切回原生搜索。

与已占用的同名 V1 包的区别：本项目面向 **V2 插件 API**、支持**后端切换**（`mode: "deepseek" | "native"`）、
自带**本地用量与费用估算**。

> 已在 `opencode 2.2.5` + `@opencode/plugin@2.2.5`（Windows）实测。Search/Fetch 的接口事实来自
> <https://api-docs.deepseek.com/zh-cn/guides/search>。

## 前置条件

- `opencode >= 2.2.5`（V2 插件 API）
- Node.js `>= 22.18`（插件直接发布 TypeScript 源码）
- 具备 Search/Fetch 权限的 DeepSeek API Key

## 安装

先把 key 写进用户级环境变量（Windows）：

```powershell
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "sk-...", "User")
```

然后在 `opencode.jsonc` 中加入插件：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@qthinker/opencode-deepseek-search"]
}
```

带选项（推荐，`mode` 就在这里）：

```jsonc
{
  "plugins": [
    {
      "package": "@qthinker/opencode-deepseek-search",
      "options": {
        "mode": "deepseek",
        "count": 5,
        "apiKey": "{env:DEEPSEEK_API_KEY}"
      }
    }
  ]
}
```

本地开发直接指向仓库目录（config 里的条目必须是**目录**，不能是单个文件）：

```jsonc
{
  "plugins": [
    { "package": "D:/MyDev/opencode-deepseek-search", "options": { "mode": "deepseek" } }
  ]
}
```

`opencode plugin list` 里应出现 `deepseek-search`。**改配置立即生效**：插件会原位置重跑，不需要 `/reload`
或重启服务。

## 选项

| 选项 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `mode` | `"deepseek" \| "native"` | `deepseek` | `websearch` 工具用哪个后端 |
| `apiKey` | string | `DEEPSEEK_API_KEY` | 通常写 `"{env:DEEPSEEK_API_KEY}"`；环境变量未设置时为 `""` |
| `count` | 1–50 | `5` | 每次返回条数（不影响单价） |
| `fetchMaxChars` | 500–200000 | `30000` | `deepseek_fetch` 截断上限，截断处有明示 |
| `pricePerThousand` | 0–10000 | `5` | 元/千次，仅用于本地费用估算 |

## 具体提供什么

**`websearch`（名字与入参都不变）**：`deepseek` 模式下把内置工具改接到 DeepSeek，模型无需任何提示词改动。
结果只带 `summary`（600–800 字，本就写给模型读）或退化的 `snippet`，**永不返回网页全文**，也从不请求
`need_content`。

> 为什么是改接工具而不是设 provider 默认值：在 2.2.5 里，插件调用 `websearch.default.set()` 会被更晚注册的
> 内置 config 插件覆盖，工具仍然用内置 provider。所以插件直接接管内置工具。若某些版本找不到该工具，
> provider 注册仍在，可用配置 `"websearch": { "provider": "deepseek" }` 强制路由。

**`deepseek_fetch`**：一个 URL 进，干净 Markdown 出，带标题与来源行；超长页面按 `fetchMaxChars` 截断并以
`[DeepSeek Fetch 截断提示]` 结尾。不会覆盖内置 `webfetch`。

**`deepseek_usage`**：直接问模型「我搜了几次、花了多少钱」。

## 用量与费用

| 计数 | 触发条件 | 计费 |
|---|---|---|
| `search` | HTTP 200 且 `results` 非空 | ¥0.005/次 |
| `fetch` | HTTP 200 且正文非空 | ¥0.005/次 |
| `empty` | HTTP 200 但结果/正文为空 | 不计费 |
| `failed` | 网络错误，或重试一次后仍非 200 | 不计费 |

费用以整数微元累加，不会累积误差；`count` 不影响单价。`deepseek_usage({ "reset": true })` 报完后清零。

- 存在 `ctx.storage` 的 `usage/v1` 键下，保留最近 60 天，天键为本地时区。
- 存储是**全局**的（整台机器的 OpenCode），**跨重启保留**。
- **本地统计 ≠ 账号账单**：只统计本机本插件；其他工具、其他机器不计入，多开 server 可能丢计数（后写覆盖）。

## 限速与成本

账号级 Search 100 QPS、Fetch 25 QPS（Fetch 另按目标域名限速）。单次请求 ¥0.005。仅在 408/429/5xx 时退避重试
一次，优先 `Retry-After`（上限 5 秒），可被取消。

## 隐私

query 与 URL 会发往 `https://api.deepseek.com`。其余数据不出本机，用量账本留在本地 OpenCode 存储中；
API Key 不写日志。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| `未配置 DeepSeek API Key` | 设置 `DEEPSEEK_API_KEY`，并重启一次 OpenCode 服务（新进程才会继承） |
| `401` key 无效 | 检查 key 与 `apiKey`/环境变量指向 |
| `402` 余额不足 | 充值；失败请求不计费 |
| `429` 触发限速 | 已退避重试一次，稍后再试 |
| Fetch 报 `403` / `404` | 站点策略拦截或无正文可提取，可改用内置 `webfetch` |
| 后端看起来还是原生 | `mode` 为 `native`，或未找到内置 `websearch` 工具；配置 `"websearch": { "provider": "deepseek" }` |

## 许可证

MIT。与 DeepSeek 官方无隶属关系。
