# OpenCode V2 的 DeepSeek 搜索插件

把 DeepSeek Search / Fetch 接进 OpenCode V2：**内置 `websearch` 工具直接走 DeepSeek**，另带干净的 Markdown
抓取、本地用量/费用统计，以及一个**持久化**的后端开关。

切回原生有三种方式：改配置 `mode`、让模型调 `deepseek_mode`、或跑仓库里的 `tools/switch-mode.ps1`。

与已占用的同名 V1 包的区别：本项目面向 **V2 插件 API**、支持**运行时切换后端**、自带**本地用量与费用估算**。

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
opencode service restart   # User 变量只进新进程
```

然后在 `opencode.jsonc` 中加入插件：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@qthinker/opencode-deepseek-search"]
}
```

带选项（推荐，`mode` 等都在这里）：

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
| `mode` | `"deepseek" \| "native"` | `deepseek` | `websearch` 的缺省后端；被 `deepseek_mode` 的持久化开关覆盖 |
| `apiKey` | string | `DEEPSEEK_API_KEY` | 通常写 `"{env:DEEPSEEK_API_KEY}"`；环境变量未设置时为 `""` |
| `count` | 1–50 | `5` | 每次返回条数（不影响单价） |
| `fetchMaxChars` | 500–200000 | `30000` | `deepseek_fetch` 截断上限，截断处有明示 |
| `pricePerThousand` | 0–10000 | `5` | 元/千次（整数），仅用于本地费用估算 |

## 提供的工具

| 工具 | 作用 |
|---|---|
| `websearch`（内置） | 名字/入参不变；`deepseek` 模式下由本插件供结果 |
| `deepseek_fetch` | 抓单页 → 干净 Markdown，超长按 `fetchMaxChars` 截断并提示 |
| `deepseek_usage` | 本地搜索/抓取次数与费用估算，`reset: true` 清零 |
| `deepseek_mode` | 查询/切换搜索后端，切换结果持久化 |

`websearch` 的改接**保留内置的权限确认与 `output` 结构**，审批提示与渲染都不变；结果只带 `summary`
（600–800 字，本就写给模型读）或退化的 `snippet`，**永不返回网页全文**，也从不请求 `need_content`。

## 切换搜索后端

### 三种方式

| 方式 | 操作 | 持久化 | 适用 |
|---|---|---|---|
| 配置 | 改 `options.mode`，保存即生效 | 是（在配置文件里） | 长期默认值 |
| 工具 | 让模型调 `deepseek_mode`，或自己调 | 是（插件存储 `mode/v1`） | 临时/在会话里切，不用改文件 |
| 脚本 | `.\tools\switch-mode.ps1 native` | 是（脚本改配置文件） | 命令行快速切，不用开编辑器 |

`deepseek_mode` 的四个动作：

| 调用 | 效果 |
|---|---|
| `deepseek_mode`（或 `{"mode": "status"}`） | 报告当前后端**与来源**（配置文件 / 持久化开关） |
| `deepseek_mode({"mode": "deepseek"})` | 内置 `websearch` 改走 DeepSeek |
| `deepseek_mode({"mode": "native"})` | 内置 `websearch` 回到原生后端 |
| `deepseek_mode({"mode": "config"})` | 清除持久化开关，回到 `options.mode` 的值 |

### 优先级

```
deepseek_mode 开关（storage: mode/v1）  >  options.mode  >  内置默认
```

- 开关存在 OpenCode 本地插件存储（`mode/v1`，**整机全局、跨重启保留**），**不会修改你的配置文件**；
- 正因为优先级更高，改了配置文件却没反应时，先问一句 `deepseek_mode`（它会告诉你来源），再用
  `mode: "config"` 清掉开关；
- 两种模式都注册 provider：任何一步失败的最坏结果是「维持上一个后端」，不会出现没搜索可用。

### native 模式下还有什么

`websearch` 完全不接管，回到你原本的后端；`deepseek_fetch`、`deepseek_usage`、`deepseek_mode` 仍然可用
（它们是新增工具，不影响原生搜索），provider 也仍注册，可用 `providerID: "deepseek"` 或配置
`"websearch": { "provider": "deepseek" }` 显式选用。

> 为什么是改接工具而不是设 provider 默认值：在 2.2.5 里，插件调用 `websearch.default.set()` 会被更晚注册的
> 内置 config 插件覆盖，工具仍然用内置 provider。所以插件直接接管内置工具：内置的权限确认照旧，只是
> deepseek 模式下不再弹出「选择搜索 provider」表单。若某些版本找不到该工具，`deepseek_mode` 会明确提示
> 「无法在运行时切换」，此时用配置 `websearch.provider` 兜底。

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

query 与 URL 会发往 `https://api.deepseek.com`。其余数据不出本机，用量账本与模式开关留在本地 OpenCode 存储中；
API Key 不写日志。

搜索结果与被抓取页面是**第三方文本**：应按数据处理，而不是当作指令——页面里可能夹带试图操纵模型的内容。

## 故障排查

| 现象 | 原因 / 处理 |
|---|---|
| 不确定搜索走哪个后端 | 调 `deepseek_mode`，它会同时报出**后端**与**来源** |
| 改了配置却没生效 | 存在持久化开关（来源会显示「持久化」）；调 `deepseek_mode({"mode": "config"})` 清除 |
| `未配置 DeepSeek API Key` | 设置 `DEEPSEEK_API_KEY`，并重启一次 OpenCode 服务（新进程才会继承） |
| `401` key 无效 | 检查 key 与 `apiKey`/环境变量指向 |
| `402` 余额不足 | 充值；失败请求不计费 |
| `429` 触发限速 | 已退避重试一次，稍后再试 |
| Fetch 报 `403` / `404` | 站点策略拦截或无正文可提取，可改用内置 `webfetch` |
| 搜索仍是原生后端 | `mode` 或持久化开关为 `native`；若两处都已完成仍如此，说明未找到内置 `websearch` 工具，用配置 `"websearch": { "provider": "deepseek" }` |

## 本地开发与自检

```powershell
cd D:\MyDev\opencode-deepseek-search
npm install
npm run typecheck     # tsc --noEmit
npm test              # node --test，纯函数单测（零成本）
npm run smoke         # 真实调用冒烟，无 DEEPSEEK_API_KEY 自动 skip
npm pack --dry-run    # 发布前产物审计
```

一键切换（仓库内脚本，改的是 `opencode.jsonc` 的 `options.mode`，写前备份 `opencode.jsonc.bak-switch`）：

```powershell
.\tools\switch-mode.ps1 status
.\tools\switch-mode.ps1 native
.\tools\switch-mode.ps1 deepseek
```

被 ExecutionPolicy 拦住时：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\switch-mode.ps1 native
```

加个别名更省事（`$PROFILE`）：

```powershell
function dsmode { & "D:\MyDev\opencode-deepseek-search\tools\switch-mode.ps1" @args }
```

目录结构：

```
index.ts              # 目录型插件入口，re-export src/index.ts
src/index.ts          # 插件本体：选项、注册、接管 websearch、三个工具
src/deepseek.ts       # HTTP 核心：超时/取消、单次退避重试、中文错误、结果映射
src/usage.ts          # 纯账本：微元计价、60 天裁剪、防御性解析、格式化
test/*.test.ts        # 纯函数单测
scripts/smoke.ts      # 真实 API 冒烟（5 步）
tools/switch-mode.ps1 # 命令行切换后端
.github/workflows/    # ci（typecheck + test）/ release（tag 触发，OIDC provenance）
```

两个形态上的坑（都已规避，改动时别踩回去）：

1. config 里的本地插件条目必须是**目录**，指向单个文件会被丢弃；
2. `package.json` 不要加 `exports`——带 `name`+`exports` 时 OpenCode 会改按包名解析该目录，
   解析结果落在目录外就被**静默丢弃**（日志无报错，`plugin list` 里直接消失）。

改完源码保存即热重载；验证手法：`opencode plugin list` + 实际搜一次看结果来源。

## 许可证

MIT。与 DeepSeek 官方无隶属关系。
