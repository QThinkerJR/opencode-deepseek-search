// 简体中文文案（现有界面文案的升格版，措辞尽量保持原样）。
//
// 键集合由 ./en.ts 的 `Key` 约束：缺键或多键都会编译失败。

import type { Messages } from "./en.ts"

export const zh = {
  // ---------- 侧边栏状态：完整措辞与窄宽度下的短式 ----------
  "state.loading": "正在读取…",
  "state.loadingShort": "正在读取…",
  "state.failed": "读取失败",
  "state.failedShort": "读取失败",
  "state.enabled": "已启用",
  "state.enabledShort": "已启用",
  "state.disabled": "已停用",
  "state.disabledShort": "已停用",
  "state.unpatched": "未接管内置 websearch",
  "state.unpatchedShort": "未接管",
  "state.missingKey": "未配置 API Key",
  "state.missingKeyShort": "缺 API Key",

  // ---------- 卡片上的可点击动作 ----------
  "action.disable": "停用",
  "action.enable": "启用",
  "action.release": "交还",
  "action.retry": "重试",

  // ---------- 桌面面板 ----------
  "panel.tooltip.refresh": "刷新用量",
  "panel.loading": "正在读取用量…",
  "panel.label.on": "停用（交还原生搜索）",
  "panel.label.off": "启用（由 DeepSeek 接管）",
  "panel.label.warn": "交还原生搜索",
  "panel.label.error": "重试",
  "panel.label.idle": "重试",

  // ---------- 宿主 chrome：命令、菜单、toast、对话框 ----------
  "command.open": "DeepSeek: 打开统计面板",
  "command.toggle": "DeepSeek: 启用/停用搜索接管",
  "menu.description": "搜索用量与接管开关",
  "toast.openSessionFirst": "请先打开一个会话",
  "toast.statusMalformed": "状态数据格式不符",
  "toast.modeMalformed": "模式切换结果格式不符",
  "dialog.title": "DeepSeek 搜索",
  "dialog.enable": "启用",
  "dialog.enableDesc": "接管内置 websearch",
  "dialog.disable": "停用",
  "dialog.disableDesc": "把内置 websearch 交还宿主",
  "dialog.refresh": "刷新",
  "dialog.refreshDesc": "重新读取状态与统计",

  // ---------- deepseek_mode 输出 ----------
  "mode.report": "当前搜索后端: {mode}（来源: {source}）{suffix}",
  "mode.source.override": "deepseek_mode 开关，已持久化",
  "mode.source.config": "配置文件 options.mode",
  "mode.suffix.patched": " · 内置 websearch 已由 DeepSeek 接管",
  "mode.suffix.notPatched": " · 未找到内置 websearch 工具，实际未能接管",
  "mode.suffix.native": " · 内置 websearch 保持原生",
  "mode.notFound":
    "未找到内置 {tool} 工具，无法在运行时切换。" +
    '请改用配置文件把 options.mode 设为 "{mode}"。',
  "mode.configCleared": "已清除持久化开关，回到配置文件设置（{mode}）。",
  "mode.persisted":
    "已持久化：重启 OpenCode 后仍为 {mode}。" +
    '要恢复配置文件设置，调用 deepseek_mode 并传 mode: "config"。',
  "mode.statusOnly": "status 只读取当前模式，不做切换。",
  "mode.invalid": "mode 只能是 status / deepseek / native / config，收到：{raw}",

  // ---------- 工具进度与记账提示 ----------
  "progress.fetch": "DeepSeek Fetch 抓取中: {url}",
  "fetch.source": "来源: {url}",
  "usage.reset": "已清零本地统计。",

  // ---------- deepseek_usage 报告 ----------
  "usage.report.title": "DeepSeek 用量（本地统计，按成功请求估算；当前模式 {mode}；单价 ¥{price}/1000 次）",
  "usage.report.line":
    "{label}: 搜索 {search} · 抓取 {fetch} · 空/失 {skipped}（空结果 {empty} / 失败 {failed}）· 估算 {cost}",
  "usage.report.note": "说明：空结果与失败请求不计费；DeepSeek 以账号侧账单为准，本统计不含其他机器或其他工具的调用。",
  "usage.label.today": "今日",
  "usage.label.month": "本月",
  "usage.label.total": "累计",
  "usage.summary.line": "搜索 {search} · 抓取 {fetch} · 空/失 {skipped} · {cost}",

  // ---------- 错误信息 ----------
  "error.missingKey":
    "未配置 DeepSeek API Key：请设置环境变量 DEEPSEEK_API_KEY" +
    '（PowerShell: [Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY","sk-...","User")），' +
    '或在插件 options 中写 "apiKey": "{env:DEEPSEEK_API_KEY}"，然后重启 opencode。',
  "error.http.400":
    "DeepSeek 请求参数无效（400）{upstream}。搜索词需 1~128 字符；Fetch 的 URL 需为合法的 http(s) 绝对地址。",
  "error.http.401": "DeepSeek API Key 无效（401）{upstream}。请检查 DEEPSEEK_API_KEY 环境变量或 options.apiKey。",
  "error.http.402": "DeepSeek 账户余额不足（402），失败请求不计费。请充值后重试。",
  "error.http.403": "DeepSeek Fetch 被目标站点安全策略拒绝（403）{upstream}。{hint}",
  "error.http.404": "DeepSeek 无法提取该链接的正文（404）{upstream}。请确认链接可访问。{hint}",
  "error.http.408": "DeepSeek 请求超时（408），已退避重试一次仍失败。请稍后重试。",
  "error.http.413": "DeepSeek 请求体过大（413）。请缩短输入。",
  "error.http.429": "DeepSeek 触发限速（429，账号级 Search 100 QPS / Fetch 25 QPS），已退避重试一次仍失败。请稍后再试。",
  "error.http.5xx":
    "DeepSeek 服务端错误（{status}），已退避重试一次仍失败。可把插件 options.mode 改为 \"native\" 暂用原生搜索。",
  "error.http.other": "DeepSeek 请求失败（HTTP {status}）{upstream}",
  "error.http.fetchHint": " 可改用内置 webfetch 工具抓取该页面。",
  "error.parse": "DeepSeek 返回了无法解析的响应（HTTP {status}）。请稍后重试。",
  "error.aborted": "DeepSeek 请求已取消。",
  "error.timeout": "DeepSeek 请求超时（{seconds} 秒），请重试。",
  "error.network": "无法连接 {base}（网络错误：{message}）。请检查网络或代理设置。",
  "error.validate.queryEmpty": "搜索词为空：DeepSeek Search 需要非空 query（1~128 字符）。",
  "error.validate.queryLong": "搜索词过长（{length} 字符，上限 {max}），请精简后重试。",
  "error.validate.urlScheme": "无效 URL：「{url}」。DeepSeek Fetch 仅支持 http/https 绝对地址。",
  "error.validate.urlLong": "URL 过长（{length} > {max} 字符）。",
  "error.validate.urlHost": "URL 缺少主机名：「{url}」。",
  "error.validate.urlUserinfo": "URL 不能包含用户名/密码（userinfo）。",
  "error.validate.urlParse": "无法解析 URL：「{url}」。",
  "error.fetch.truncated": "[DeepSeek Fetch 截断提示] 原文共 {raw} 字符，超出上限 {max}，此处仅保留前 {max} 字符。",
} satisfies Messages

/** 用量行阶梯：从最完整到最紧凑；每一条都是完整的一行。 */
export const zhUsageForms: readonly string[] = [
  "{label}  Search {search}  Fetch {fetch}  {cost}",
  "{label} Search {search} Fetch {fetch} {cost}",
  "{label}  Search {search}  Fetch {fetch}",
  "{label} Search {search} Fetch {fetch}",
  "{label}  {search}S  {fetch}F  {cost}",
  "{label}  {search}S  {fetch}F",
  "{label}  {search}S",
]

/** 缺 key 提示阶梯：最后一档仍然指明要设置什么。 */
export const zhHintForms: readonly string[] = [
  "设置 DEEPSEEK_API_KEY 后重启",
  "设置 API KEY 后重启",
  "设置 API KEY",
  "设置 KEY",
]
