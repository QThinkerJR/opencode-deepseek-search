# 一键切换 deepseek / native 搜索后端。
#
#   .\tools\switch-mode.ps1 status     # 看当前模式
#   .\tools\switch-mode.ps1 native     # 切回原生搜索
#   .\tools\switch-mode.ps1 deepseek   # 切回 DeepSeek
#
# 只修改 opencode.jsonc 里本插件的 options.mode，保存即生效（插件会原地重跑），
# 不重启、不重连。每次写入前留一份 <config>.bak-switch。

param(
  [Parameter(Position = 0)]
  [ValidateSet("deepseek", "native", "status")]
  [string]$Mode = "status",
  [string]$ConfigPath = (Join-Path $HOME ".config\opencode\opencode.jsonc"),
  [string]$PackageMatch = "opencode-deepseek-search"
)

$json = Get-Content -LiteralPath $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$entry = @(
  $json.plugins |
    Where-Object { $_ -isnot [string] -and $_.package -like "*$PackageMatch*" }
)

if ($entry.Count -ne 1) {
  throw "在 $ConfigPath 的 plugins 里没找到唯一的 $PackageMatch 条目（实际找到 $($entry.Count) 个）。请先按 README 配置该插件。"
}

$current = $entry[0].options.mode
if (-not $current) { $current = "deepseek（默认）" }

if ($Mode -eq "status") {
  "当前模式: $current"
  exit 0
}

if (-not $entry[0].options) {
  $entry[0] | Add-Member -NotePropertyName options -NotePropertyValue ([pscustomobject]@{}) -Force
}
$entry[0].options | Add-Member -NotePropertyName mode -NotePropertyValue $Mode -Force

Copy-Item -LiteralPath $ConfigPath -Destination "$ConfigPath.bak-switch" -Force
($json | ConvertTo-Json -Depth 20) | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

"已切换: $current -> $Mode（保存即生效，无需重启）"
