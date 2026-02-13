# LINE連携 & プロフィール作成の修正プラン

## Context

マジックリンクでの新規登録時にプロフィール（名前・電話番号）が空になる問題と、LINE連携時に `line_user_id` が保存されない問題を修正する。

根本原因:
1. `signInWithOtp()` に `data` パラメータが渡されておらず、DBトリガーが空のプロフィールを作成する
2. `fetchProfile` が「プロフィールが存在するが空」のケースを扱えていない（トリガーが先に空行を作るため `!data` が false になり RPC がスキップされる）
3. LIFF初期化の useEffect にレースコンディションがあり、session/profile が揃う前に LINE ID 更新がスキップされる
4. MyPage からの LINE 連携でリダイレクト後にコンポーネントがマウントされず、連携処理が完了しない

## 修正対象ファイル

- `src/App.tsx` - メイン修正
- `src/components/MyPage.tsx` - LINE連携リダイレクトフロー修正
- `src/LP.tsx` - 軽微な安全化

## 修正方針

- RPC関数（`create_profile_securely`, `update_profile_line_id`）は Supabase ダッシュボードで既に作成済み（現コードが既に呼び出している）。引き続き使用するが、RLS が自己プロフィール更新を許可しているため、RPC 失敗時は直接 `.update()` にフォールバックする
- localStorage は同一ブラウザ内のフォールバックとして残す。クロスブラウザ対策は `signInWithOtp` の `data` パラメータで対応

---

## 修正内容

### 1. signInWithOtp に data パラメータ追加 (App.tsx:140-143)

```typescript
// Before
options: { emailRedirectTo: window.location.origin }

// After
options: {
  emailRedirectTo: window.location.origin,
  data: { name: authName, phone: authPhone }
}
```

これにより `auth.users.raw_user_meta_data` に name/phone が保存され、DBトリガー `handle_new_user()` が正しくプロフィールを作成する。**注意**: `data` パラメータはサーバー側の `raw_user_meta_data` に保存されるため、マジックリンクを別ブラウザで開いてもトリガーが正しい値を読める。

### 2. fetchProfile の空プロフィール対応 (App.tsx:84-125)

トリガーが空プロフィールを先に作成するケースに対応。

```typescript
const fetchProfile = async (userId: string) => {
  let { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // プロファイル未作成 OR 存在するが名前・電話が空（トリガーが空で作成した場合）
  const profileNeedsUpdate = !data || (!data.name && !data.phone);

  if (profileNeedsUpdate) {
    const tempAuthData = localStorage.getItem('tempAuthData');
    if (tempAuthData) {
      try {
        const { name, phone, email } = JSON.parse(tempAuthData);
        if (name && phone) {
          if (!data) {
            // プロフィール行が存在しない → RPC で作成
            const { data: newProfile, error } = await supabase.rpc('create_profile_securely', {
              _id: userId, _name: name, _phone: phone, _email: email
            });
            if (!error && newProfile) {
              data = newProfile;
            } else {
              console.error("RPC create error:", error);
            }
          } else {
            // プロフィール行は存在するが空 → 直接更新（RLS許可済み）
            const { error } = await supabase
              .from('profiles')
              .update({ name, phone })
              .eq('id', userId);
            if (!error) {
              data = { ...data, name, phone };
            } else {
              console.error("Profile update error:", error);
            }
          }
          localStorage.removeItem('tempAuthData');
        }
      } catch (e) {
        console.error("Profile creation/update error", e);
      }
    }
  }

  if (data) {
    setProfile(data);
    if (data.line_user_id) {
      setIsLinked(true);
    }
  }
};
```

### 3. LIFF useEffect を2つに分割 (App.tsx:154-183)

新規ステート変数を追加:
```typescript
const [liffLineUserId, setLiffLineUserId] = useState<string | null>(null);
```

**useEffect A: LIFF SDK初期化（依存配列: `[]`、マウント時1回のみ）**

```typescript
useEffect(() => {
  const initLiff = async () => {
    try {
      await liff.init({ liffId: LIFF_ID });
      if (liff.isLoggedIn()) {
        const profileData = await liff.getProfile();
        setLiffLineUserId(profileData.userId);

        // 保留中の予約へのLINE ID紐付け
        const pendingReservationId = localStorage.getItem('pendingLineLinkReservationId');
        if (pendingReservationId) {
          const { error } = await supabase.from('reservations')
            .update({ line_user_id: profileData.userId })
            .eq('id', pendingReservationId);
          localStorage.removeItem('pendingLineLinkReservationId');
          if (!error) {
            setIsLinked(true);
            alert("LINE連携が完了しました！");
          }
        }

        // MyPageからのリダイレクト後の処理
        const pendingMyPageLink = localStorage.getItem('pendingLineLinkFromMyPage');
        if (pendingMyPageLink) {
          localStorage.removeItem('pendingLineLinkFromMyPage');
          // プロフィールへの保存は useEffect B が担当
          // MyPage への遷移
          setStep('MYPAGE');
        }
      }
    } catch (err) {
      console.error("LIFF init error", err);
    }
  };
  initLiff();
}, []);
```

**useEffect B: プロフィールへのLINE ID同期（依存配列: `[session, profile, liffLineUserId]`）**

依存チェーン: auth state change → session設定 → fetchProfile呼び出し → profile設定 → useEffect B 発火

```typescript
useEffect(() => {
  if (!session || !profile || !liffLineUserId) return;
  if (profile.line_user_id) return; // 既に連携済み

  const syncLineId = async () => {
    try {
      const { error } = await supabase.rpc('update_profile_line_id', {
        _id: session.user.id,
        _line_user_id: liffLineUserId
      });
      if (error) {
        console.warn("RPC failed, trying direct update:", error);
        await supabase.from('profiles')
          .update({ line_user_id: liffLineUserId })
          .eq('id', session.user.id);
      }
      setProfile(prev => prev ? { ...prev, line_user_id: liffLineUserId } : null);
      setIsLinked(true);
    } catch (err) {
      console.error("Profile LINE ID sync error:", err);
    }
  };
  syncLineId();
}, [session, profile, liffLineUserId]);
```

### 4. handleLineLinking の改善 (App.tsx:185-228)

`liffLineUserId` ステートを利用し、`liff.getProfile()` の再呼び出しを削減。profile ステート更新を追加。

```typescript
const handleLineLinking = async () => {
  if (!lastReservationId) return;
  setIsLinking(true);
  try {
    let lineUserId = liffLineUserId;
    if (!liff.isLoggedIn() || !lineUserId) {
      localStorage.setItem('pendingLineLinkReservationId', lastReservationId);
      liff.login({ redirectUri: window.location.href });
      return;
    }

    const { error: resError } = await supabase.from('reservations')
      .update({ line_user_id: lineUserId })
      .eq('id', lastReservationId);
    if (resError) throw new Error(`Reservation update failed: ${resError.message}`);

    if (session) {
      const { error: profError } = await supabase.rpc('update_profile_line_id', {
        _id: session.user.id, _line_user_id: lineUserId
      });
      if (profError) {
        console.warn("RPC failed, trying direct update:", profError);
        const { error: directError } = await supabase.from('profiles')
          .update({ line_user_id: lineUserId })
          .eq('id', session.user.id);
        if (directError) throw new Error(`Profile update failed: ${directError.message}`);
      }
      setProfile(prev => prev ? { ...prev, line_user_id: lineUserId } : null);
    }
    setIsLinked(true);
    alert("LINE連携が完了しました！");
  } catch (err: any) {
    console.error("LINE Linking Error:", err);
    alert(`連携に失敗しました。\n${err.message || JSON.stringify(err)}`);
  } finally {
    setIsLinking(false);
  }
};
```

### 5. handleFormSubmit の安全化 (App.tsx:265, 277)

```typescript
// Before
line_user_id: profile?.line_user_id || (liff.isLoggedIn() ? liff.getContext()?.userId : null)
// After
line_user_id: profile?.line_user_id || liffLineUserId || null

// Before
if (profile?.line_user_id || (liff.isLoggedIn() && liff.getContext()?.userId)) setIsLinked(true);
// After
if (profile?.line_user_id || liffLineUserId) setIsLinked(true);
```

### 6. MyPage LINE連携のリダイレクト対応 (MyPage.tsx:52-80)

```typescript
const handleLineLink = async () => {
  setIsLiffLoading(true);
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const liff = (await import('@line/liff')).default;
    const LIFF_ID = "2009052718-9rclRq3Z";
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      // フラグを保存してApp.tsxのLIFF initに処理を委任
      localStorage.setItem('pendingLineLinkFromMyPage', 'true');
      liff.login({ redirectUri: window.location.origin });
      return;
    }

    // 既にLIFFログイン済みの場合は直接更新
    const lineProfile = await liff.getProfile();
    const { error: rpcError } = await supabase.rpc('update_profile_line_id', {
      _id: user.id, _line_user_id: lineProfile.userId
    });
    if (rpcError) {
      console.warn("RPC failed, using direct update:", rpcError);
      const { error } = await supabase
        .from('profiles')
        .update({ line_user_id: lineProfile.userId })
        .eq('id', user.id);
      if (error) throw error;
    }
    alert('LINE連携が完了しました！');
    fetchData();
  } catch (err) {
    console.error('LINE link error:', err);
    alert('連携に失敗しました。');
  } finally {
    setIsLiffLoading(false);
  }
};
```

リダイレクト後の処理は App.tsx の useEffect A が `pendingLineLinkFromMyPage` フラグを検知し、`setStep('MYPAGE')` でマイページに遷移。useEffect B がプロフィールの `line_user_id` を更新。

### 7. LP.tsx の安全化 (LP.tsx:136)

```typescript
// Before
line_user_id: liff.isLoggedIn() ? liff.getContext()?.userId : null
// After
line_user_id: liff.isLoggedIn() ? (liff.getContext()?.userId || null) : null
```

---

## 検証方法

1. **新規ユーザー登録**: AUTH画面で名前・電話・メール入力 → マジックリンク送信 → リンククリック → Supabase の profiles テーブルに名前・電話が入っているか確認
2. **クロスブラウザ**: Chrome で入力 → マジックリンクを Safari で開く → profiles に名前・電話が入るか確認
3. **LINE連携（COMPLETE画面）**: 予約完了 → LINE連携ボタン → LINE認証 → `reservations.line_user_id` と `profiles.line_user_id` が設定されるか確認
4. **LINE連携（マイページ）**: マイページ → 連携ボタン → LINE認証 → リダイレクト後にマイページが表示され `profiles.line_user_id` が設定されるか確認
5. **LINE連携解除**: マイページ → 解除ボタン → `profiles.line_user_id` が null になるか確認（変更なし、既存動作の確認）
