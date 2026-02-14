# 修正プラン: メニュー名がハードコードIDで解決できず「パーソナルトレーニング」と表示されるバグ

## Context

管理画面(MenuManager)でメニューを登録・再作成すると、`id`を指定せずにinsertされるため、PostgreSQLが自動生成したUUIDがメニューIDとなる。しかし、マイページ・GASペイロード・リマインダー・AIチャット・LPでは旧来のハードコードされたID文字列（'trial-60', 'personal-20'等）でメニュー名を解決しようとしているため、UUIDとマッチせずフォールバック値が使われてしまう。

LINE通知だけはDBから動的にメニュー名を取得しているため正しく表示される。

## 修正箇所（5箇所）

### 1. MyPage.tsx — メニュー名をDBから取得
**ファイル**: `src/components/MyPage.tsx`

- `getMenuLabel` のハードコードマッピングを削除
- 既存の `fetchData()` 関数内でmenusテーブルからメニュー一覧を取得し、stateに保持
- 表示は `menus.find(m => m.id === menuId)?.label || menuId` （ReservationManagerの561行目と同じパターン）
- フォールバックは旧IDでも対応できるよう `|| menuId` とする（UUIDが表示されるだけで「パーソナルトレーニング」に化けることはない）

### 2. handle-reservation/index.ts — GASペイロードにmenu_name追加
**ファイル**: `supabase/functions/handle-reservation/index.ts`

- 現状: メニュー名取得（78-100行目）がGAS送信（37-71行目）の**後**にある
- 修正: メニュー名取得処理をGAS送信より前に移動
- `payloadForGas` の `record` に `menu_name` フィールドを追加してGASに送信
- これによりGAS側でmenu_nameを利用してカレンダーイベント名を設定可能になる

### 3. send-reminders/index.ts — メニュー名をDBから取得
**ファイル**: `supabase/functions/send-reminders/index.ts`

- `getMenuName()` のハードコードマッピングをDB取得に変更
- リマインダー処理の先頭でmenusテーブルから一括取得し、IDでlabelを引く
- フォールバックとして旧ハードコードマッピングも残す（レガシーデータ対応）

### 4. ai-chat/index.ts — メニュー情報をDBから動的取得
**ファイル**: `supabase/functions/ai-chat/index.ts`

- リクエスト処理の先頭でmenusテーブルからメニュー一覧を取得
- システムプロンプト内のメニューID・所要時間を、DBデータから動的に構築
- `menuDurations`（169-175行目）のハードコードマッピングもDBデータで置き換え

### 5. LP.tsx — メニュー情報をDBから動的取得
**ファイル**: `src/LP.tsx`

- `TRIAL_MENU` のハードコード定数を削除
- コンポーネントマウント時にmenusテーブルから「無料体験」メニュー（label = '無料体験'）を取得
- 取得できない場合はフォールバック定数を使用

## 修正しない箇所

- **App.tsx**: メニュー一覧は既にDBから取得済み
- **AdminDashboard.tsx**: DBから取得済み
- **GAS側スクリプト**: 外部のGoogle Apps Script。payloadに`menu_name`を含めることで今後GAS側で利用可能にする

## 検証方法

1. ローカルでビルドが通ることを確認 (`npm run build`)
2. マイページで予約一覧を表示し、正しいメニュー名が表示されることを確認
3. LP経由の予約で正しいmenu_idが保存されることを確認
