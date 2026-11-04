// 日本語の文言。状態語は体言止め、文はです・ます調で短く。
//
// キー集合は ./en.ts の `Key` で型付けされており、欠けても増えてもコンパイル
// エラーになる。製品名・Search / Fetch は英語のまま使う。

import type { Messages } from "./en.ts"

export const ja = {
  // ---------- サイドバーの状態：完全な語と、幅が足りないときの短縮語 ----------
  "state.loading": "読み込み中…",
  "state.loadingShort": "読み込み中…",
  "state.failed": "読み込み失敗",
  "state.failedShort": "失敗",
  "state.enabled": "有効",
  "state.enabledShort": "有効",
  "state.disabled": "無効",
  "state.disabledShort": "無効",
  "state.unpatched": "websearch 未引き継ぎ",
  "state.unpatchedShort": "未引き継ぎ",
  "state.missingKey": "APIキー未設定",
  "state.missingKeyShort": "キー未設定",

  // ---------- カード上の操作 ----------
  "action.disable": "停止",
  "action.enable": "有効化",
  "action.release": "返上",
  "action.retry": "再試行",

  // ---------- デスクトップパネル ----------
  "panel.tooltip.refresh": "使用量を更新",
  "panel.loading": "使用量を読み込み中…",
  "panel.label.on": "停止（ネイティブ検索に返上）",
  "panel.label.off": "有効化（DeepSeek が引き継ぐ）",
  "panel.label.warn": "ネイティブ検索に返上",
  "panel.label.error": "再試行",
  "panel.label.idle": "再試行",

  // ---------- ホスト側の表示：コマンド、メニュー、トースト、ダイアログ ----------
  "command.open": "DeepSeek: 使用量パネルを開く",
  "command.toggle": "DeepSeek: 検索の引き継ぎを切り替え",
  "menu.description": "検索使用量と引き継ぎスイッチ",
  "toast.openSessionFirst": "先にセッションを開いてください",
  "toast.statusMalformed": "状態データの形式が不正です",
  "toast.modeMalformed": "モード切り替え結果の形式が不正です",
  "dialog.title": "DeepSeek 検索",
  "dialog.enable": "有効化",
  "dialog.enableDesc": "組み込み websearch を引き継ぐ",
  "dialog.disable": "停止",
  "dialog.disableDesc": "組み込み websearch をホストに返上",
  "dialog.refresh": "更新",
  "dialog.refreshDesc": "状態と使用量を再読み込み",

  // ---------- deepseek_mode の出力 ----------
  "mode.report": "現在の検索バックエンド: {mode}（ソース: {source}）{suffix}",
  "mode.source.override": "deepseek_mode スイッチ（永続化済み）",
  "mode.source.config": "設定ファイルの options.mode",
  "mode.suffix.patched": " · 組み込み websearch は DeepSeek が処理",
  "mode.suffix.notPatched": " · 組み込み websearch が見つからず、引き継げませんでした",
  "mode.suffix.native": " · 組み込み websearch はネイティブのまま",
  "mode.notFound":
    "組み込み {tool} ツールが見つからないため、実行中は切り替えできません。" +
    "設定ファイルで options.mode を「{mode}」にしてください。",
  "mode.configCleared": "永続化スイッチを削除し、設定ファイルの値（{mode}）に戻しました。",
  "mode.persisted":
    "永続化しました: OpenCode を再起動しても {mode} のままです。" +
    "設定ファイルの値に戻すには、deepseek_mode に mode: \"config\" を渡してください。",
  "mode.statusOnly": "status は現在のモードを読むだけで、切り替えは行いません。",
  "mode.invalid": "mode は status / deepseek / native / config のいずれかです。受信値: {raw}",

  // ---------- 進捗と記録の通知 ----------
  "progress.fetch": "DeepSeek Fetch 取得中: {url}",
  "fetch.source": "出典: {url}",
  "usage.reset": "ローカル統計をクリアしました。",

  // ---------- deepseek_usage のレポート ----------
  "usage.report.title": "DeepSeek 使用量（ローカル集計・成功リクエストで概算。現在のモード {mode}、単価 ¥{price}/1000回）",
  "usage.report.line":
    "{label}: 検索 {search} · 取得 {fetch} · 空/失敗 {skipped}（空結果 {empty} / 失敗 {failed}）· 推定 {cost}",
  "usage.report.note":
    "注: 空結果と失敗は課金されません。請求は DeepSeek のアカウント側が正で、この集計は他のマシンや他ツールの呼び出しを含みません。",
  "usage.label.today": "今日",
  "usage.label.month": "今月",
  "usage.label.total": "合計",
  "usage.summary.line": "検索 {search} · 取得 {fetch} · 空/失敗 {skipped} · {cost}",

  // ---------- アカウント残高（カードの行とデスクトップのツールチップ） ----------
  "balance.label": "残高",
  "balance.breakdown": "付与 {granted} · チャージ {topped}",

  // ---------- エラー ----------
  "error.missingKey":
    "DeepSeek APIキーが未設定です。環境変数 DEEPSEEK_API_KEY を設定してください" +
    "（PowerShell: [Environment]::SetEnvironmentVariable(\"DEEPSEEK_API_KEY\",\"sk-...\",\"User\")）。" +
    "またはプラグイン options に \"apiKey\": \"{env:DEEPSEEK_API_KEY}\" を書き、opencode を再起動してください。",
  "error.http.400":
    "DeepSeek のリクエストパラメータが不正です（400）{upstream}。検索語は 1〜128 文字、Fetch の URL は有効な http(s) 絶対 URL が必要です。",
  "error.http.401": "DeepSeek APIキーが無効です（401）{upstream}。DEEPSEEK_API_KEY 環境変数か options.apiKey を確認してください。",
  "error.http.402": "DeepSeek アカウントの残高が不足しています（402）。失敗したリクエストは課金されません。チャージ後に再試行してください。",
  "error.http.403": "DeepSeek Fetch は対象サイトのセキュリティポリシーに拒否されました（403）{upstream}。{hint}",
  "error.http.404": "DeepSeek はこのリンクの本文を抽出できませんでした（404）{upstream}。リンクにアクセスできるか確認してください。{hint}",
  "error.http.408": "DeepSeek リクエストがタイムアウトしました（408）。バックオフ再試行も失敗しました。しばらくしてから再試行してください。",
  "error.http.413": "DeepSeek リクエストの本文が大きすぎます（413）。入力を短くしてください。",
  "error.http.429":
    "DeepSeek のレート制限に達しました（429。アカウント上限: Search 100 QPS / Fetch 25 QPS）。" +
    "バックオフ再試行も失敗しました。しばらくしてから再試行してください。",
  "error.http.5xx":
    "DeepSeek のサーバーエラーです（{status}）。バックオフ再試行も失敗しました。" +
    "一時的に options.mode を \"native\" にするとネイティブ検索を使えます。",
  "error.http.other": "DeepSeek リクエストが失敗しました（HTTP {status}）{upstream}",
  "error.http.fetchHint": " このページには組み込み webfetch ツールを使えます。",
  "error.parse": "DeepSeek が解析できないレスポンスを返しました（HTTP {status}）。しばらくしてから再試行してください。",
  "error.aborted": "DeepSeek リクエストはキャンセルされました。",
  "error.timeout": "DeepSeek リクエストがタイムアウトしました（{seconds} 秒）。再試行してください。",
  "error.network": "{base} に接続できません（ネットワークエラー: {message}）。ネットワークかプロキシの設定を確認してください。",
  "error.validate.queryEmpty": "検索語が空です。DeepSeek Search には空でない query（1〜128 文字）が必要です。",
  "error.validate.queryLong": "検索語が長すぎます（{length} 文字、上限 {max}）。短くして再試行してください。",
  "error.validate.urlScheme": "無効な URL:「{url}」。DeepSeek Fetch は http/https の絶対 URL のみ対応します。",
  "error.validate.urlLong": "URL が長すぎます（{length} > {max} 文字）。",
  "error.validate.urlHost": "URL にホスト名がありません:「{url}」。",
  "error.validate.urlUserinfo": "URL にユーザー名/パスワード（userinfo）を含められません。",
  "error.validate.urlParse": "URL を解析できません:「{url}」。",
  "error.fetch.truncated": "[DeepSeek Fetch 切り詰め] 元の本文は {raw} 文字で、上限 {max} 文字を超えています。先頭 {max} 文字のみ保持しました。",
} satisfies Messages

/**
 * 使用量行の階段：価値の高い順、同じ価値なら幅の広い順。各段は単体で完結する。
 * 金額は語や回数より上位なので、金額を含まない「語だけ」の段は廃止した。金額だけの
 * 行は件数を持たないため status-view.ts 側で組み立て、最後の 1 段の直前に試す。
 */
export const jaUsageForms: readonly string[] = [
  "{label}  Search {search}  Fetch {fetch}  {cost}",
  "{label} Search {search} Fetch {fetch} {cost}",
  "{label}  {search}S  {fetch}F  {cost}",
  "{label}  {search}S  {fetch}F",
  "{label} {search}S",
]

/** 残高行の階段：完全な形が先。`{amount}` は通貨記号込み。 */
export const jaBalanceForms: readonly string[] = ["残高 {amount}"]

/** APIキー未設定のヒント階段：最後の段でも何を設定するかは残る。 */
export const jaHintForms: readonly string[] = [
  "DEEPSEEK_API_KEY を設定して再起動",
  "DEEPSEEK_API_KEY を設定",
  "API KEY を設定",
  "KEY 設定",
]
