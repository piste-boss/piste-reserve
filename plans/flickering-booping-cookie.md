# 予約画面UI改修プラン: 時間帯選択ステップの追加

## Context

現在の予約フローは「メニュー → カレンダー → 時間表示（20分間隔の全スロット一覧）」となっている。
時間スロットが大量に表示されるため、ユーザーが選びにくい。
1時間ごとの時間帯を先に選択させ、その後空き時間のみ表示するステップを追加することで、UXを改善する。

## 変更後のフロー

```
MENU → DATE → TIME_SLOT → TIME → FORM → COMPLETE
                ↑新規追加     ↑空きのみ表示
```

## 対象ファイル

1. **[App.tsx](src/App.tsx)** - ステップ管理・新ステップ追加
2. **新規: [ReservationTimeSlot.tsx](src/components/ReservationTimeSlot.tsx)** - 時間帯選択コンポーネント
3. **[ReservationTime.tsx](src/components/ReservationTime.tsx)** - 選択された時間帯内の空き時間のみ表示するよう修正

## 実装詳細

### 1. App.tsx の変更

- `Step` 型に `'TIME_SLOT'` を追加
- `ReservationData` に `timeSlot: string` フィールドを追加（例: `"09"`）
- DATE 選択時に `timeSlot` を空文字リセット: `setData({ ...data, date, timeSlot: '' })`
- `ReservationTimeSlot` コンポーネントをインポート・配置
- TIME ステップに `timeSlot` props を渡す

**ステップ遷移フロー:**
```
DATE → onSelect → TIME_SLOT
TIME_SLOT → onSelect → TIME（空き時間表示）
TIME_SLOT → onBack → DATE
TIME → onSelect → FORM
TIME → onBack → TIME_SLOT
FORM → onBack → TIME（現行維持。TIME→TIME_SLOT の連鎖で戻れる）
```

### 2. ReservationTimeSlot.tsx（新規作成）

**Props:**
```typescript
interface Props {
  date: string;
  duration: number;
  onSelect: (slotStartHour: string) => void;  // "09" 形式で開始時の hour を渡す
  onBack: () => void;
}
```

**時間帯一覧（11スロット）:**
```
9:00〜10:00 / 10:00〜11:00 / 11:00〜12:00 / 12:00〜13:00 / 13:00〜14:00
14:00〜15:00 / 15:00〜16:00 / 16:00〜17:00 / 17:00〜18:00 / 18:00〜19:00 / 19:00〜20:00
```

**満枠判定ロジック（duration考慮の範囲重複方式）:**
- Supabase から当日の予約データを取得（reservation_time, reservation_end_time）
- 各時間帯について、内部の20分間隔スロット（例: 9:00, 9:20, 9:40）を生成
- 各スロットに対し `duration` を加算した終了時刻を算出し、既存予約との重複判定を実施
  - 重複判定: `(スロット開始 < 既存終了) && (スロット終了 > 既存開始)`
- 過去時刻のスロットも除外対象
- **全スロットが予約済みor過去** → 「ご希望の時間帯は満枠です。」を表示しグレーアウト
- **1つでも空きあり** → 通常ボタンとして表示

**UI:**
- 1列のリスト形式でボタンを表示
- 各ボタンに時間帯テキスト（例: "9:00 〜 10:00"）
- 満枠の場合はグレーアウト + 「満枠」表示

### 3. ReservationTime.tsx の変更

**変更点:**
- Props に `timeSlot: string` を追加（開始時の hour、例: "09"）
- 既存の `generateTimes()` と `TIMES` 定数を削除
- 新しい `generateTimesForSlot(slotStartHour)` 関数で、選択時間帯内の20分間隔スロットのみ生成
- **空き時間のみ表示**: 予約済み・過去のスロットは非表示（ボタンを描画しない）
- 全て埋まっている場合は「この時間帯に空きはありません」メッセージを表示
- 見出しに選択中の時間帯を表示（例: "9:00〜10:00 の空き時間"）

**時間生成ロジック（変更後）:**
```typescript
const generateTimesForSlot = (slotStartHour: string) => {
  const startH = parseInt(slotStartHour, 10);
  const startMins = startH * 60;
  const endMins = startMins + 60;
  const times = [];
  for (let mins = startMins; mins < endMins; mins += 20) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
  }
  return times;
};
// 例: "09" → ["09:00", "09:20", "09:40"]
// 例: "13" → ["13:00", "13:20", "13:40"]
```

## 検証方法

1. メニュー選択 → カレンダー → 時間帯一覧が表示されること
2. 満枠の時間帯にはグレーアウト + 「ご希望の時間帯は満枠です。」が表示されること
3. 時間帯選択 → 空き時間のみ表示されること（予約済み・過去のスロットは非表示）
4. 空き時間選択 → フォーム入力に進むこと
5. 各ステップの「戻る」ボタンが正しく動作すること（FORM→TIME→TIME_SLOT→DATE）
6. 予約確定後のデータが正しく保存されること（reservation_time, reservation_end_time）
7. MyPage からの予約変更フローが正しく動作すること
8. duration=60 のメニューで、時間帯境界をまたぐ重複判定が正しく動作すること
9. `npm run build` が成功すること
