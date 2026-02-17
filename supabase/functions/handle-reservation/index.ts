import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzfrCsbZkBW7koRl73ArqxFt9BlvEv3Wy_Ezld9L0uiOEsdBkmNf_6aKm7v_Ub9oiyt/exec";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const body = await req.json()
    const { type, record, old_record } = body

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 論理削除（status='cancelled'へのUPDATE）をキャンセルとして検出
    const isCancellation = type === 'UPDATE' && record.status === 'cancelled' && old_record.status !== 'cancelled';

    // UPDATE時の重複通知・不要通知を防ぐチェック（キャンセルは除く）
    if (type === 'UPDATE' && !isCancellation) {
      const isDateChanged = record.reservation_date !== old_record.reservation_date;
      const isTimeChanged = record.reservation_time !== old_record.reservation_time;
      const isMenuChanged = record.menu_id !== old_record.menu_id;

      if (!isDateChanged && !isTimeChanged && !isMenuChanged) {
        console.log("重要な変更がないため、通知をスキップします。");
        return new Response(JSON.stringify({ message: "Update skipped" }), { status: 200 });
      }
    }

    // キャンセル（論理削除）は通知上 DELETE として扱う
    const effectiveType = isCancellation ? 'DELETE' : type;

    const currentRecord = effectiveType === 'DELETE' ? (old_record || record) : record
    console.log(`予約データ検知 [${effectiveType}]:`, currentRecord.id, currentRecord.source)

    // 基本情報
    const dateStr = currentRecord.reservation_date;
    const timeStr = currentRecord.reservation_time;

    // メニュー名をDBから取得（GAS送信・通知の両方で使用）
    let menuName = currentRecord.menu_id;
    try {
      const { data: menuData } = await supabase
        .from('menus')
        .select('label')
        .eq('id', currentRecord.menu_id)
        .single();
      if (menuData?.label) {
        menuName = menuData.label;
      } else {
        // フォールバック（古い静的定義）
        const fallbackMenus: Record<string, string> = {
          'personal-20': 'パーソナルトレーニング',
          'trial-60': '無料体験',
          'entry-30': '入会手続き',
          'online-30': 'オンライン',
          'first-60': '初回パーソナル',
        };
        menuName = fallbackMenus[currentRecord.menu_id] || currentRecord.menu_id;
      }
    } catch (e) {
      console.error("メニュー名取得エラー:", e);
    }

    // GASへの同期（手動登録以外、または削除時）
    if (currentRecord.source !== 'google-manual' || effectiveType === 'DELETE') {
      try {
        console.log("GAS送信開始:", GAS_WEBHOOK_URL, "ID:", currentRecord.id);

        const payloadForGas = JSON.parse(JSON.stringify(body));
        // キャンセル（論理削除）の場合はGAS側にDELETEとして送信
        if (isCancellation) {
          payloadForGas.type = 'DELETE';
          payloadForGas.old_record = payloadForGas.old_record || payloadForGas.record;
        }
        // GAS側でメニュー名を利用できるようにペイロードに追加
        if (payloadForGas.record) {
          payloadForGas.record.menu_name = menuName;
        }
        if (payloadForGas.old_record) {
          payloadForGas.old_record.menu_name = menuName;
        }

        const gasRes = await fetch(GAS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadForGas),
        });

        const gasText = await gasRes.text();
        console.log("GAS生レスポンス:", gasText);

        let gasData;
        try {
          gasData = JSON.parse(gasText);
        } catch (e) {
          console.log("GASレスポンスがJSON形式ではありませんでした");
        }

        if (effectiveType === 'INSERT' && gasData?.eventId) {
          console.log("eventIdを取得成功。DB更新開始:", gasData.eventId);
          await supabase
            .from('reservations')
            .update({ google_event_id: gasData.eventId })
            .eq('id', currentRecord.id);
        } else if (gasData?.status === 'error') {
          console.error("GAS側でエラーが発生しました:", gasData.message);
        }
      } catch (e) {
        console.error("GAS同期エラー:", e);
      }
    }

    const userName = currentRecord.name || "不明";
    const userPhone = currentRecord.phone || "不明";
    const userEmail = currentRecord.email || "不明";

    // 電話番号正規化（ハイフン・スペース・全角スペース除去）
    const normalizePhone = (p: string) => (p || '').replace(/[-\s\u3000]/g, '');

    // profiles テーブルからユーザー情報を補完（管理者手動登録時に line_user_id / user_id が無い場合）
    let lineUserId = currentRecord.line_user_id;
    let matchedUserId = currentRecord.user_id;

    if (!lineUserId || !matchedUserId) {
      try {
        let profileMatch = null;

        // 1. メールアドレスで profiles を検索
        if (currentRecord.email) {
          const { data } = await supabase
            .from('profiles')
            .select('id, line_user_id')
            .eq('email', currentRecord.email)
            .single();
          if (data) profileMatch = data;
        }

        // 2. メールで見つからなければ電話番号で検索（正規化して比較）
        if (!profileMatch && currentRecord.phone) {
          const normalizedPhone = normalizePhone(currentRecord.phone);
          // まず完全一致で検索
          const { data } = await supabase
            .from('profiles')
            .select('id, line_user_id, phone')
            .eq('phone', currentRecord.phone)
            .single();
          if (data) {
            profileMatch = data;
          } else if (normalizedPhone) {
            // 完全一致で見つからなければ、電話番号が存在するprofilesを取得して正規化比較
            const { data: phoneProfiles } = await supabase
              .from('profiles')
              .select('id, line_user_id, phone')
              .not('phone', 'is', null);
            if (phoneProfiles) {
              profileMatch = phoneProfiles.find(
                (p: any) => normalizePhone(p.phone) === normalizedPhone
              ) || null;
            }
          }
        }

        if (profileMatch) {
          if (!lineUserId && profileMatch.line_user_id) {
            lineUserId = profileMatch.line_user_id;
            console.log("profilesからline_user_idを補完:", lineUserId);
          }
          if (!matchedUserId) {
            matchedUserId = profileMatch.id;
            console.log("profilesからuser_idを補完:", matchedUserId);
          }
        }
      } catch (e) {
        console.log("profiles検索エラー（無視可）:", e);
      }

      // 補完できた情報を予約レコードに書き戻す
      const updateFields: Record<string, string> = {};
      if (matchedUserId && !currentRecord.user_id) {
        updateFields.user_id = matchedUserId;
      }
      if (lineUserId && !currentRecord.line_user_id) {
        updateFields.line_user_id = lineUserId;
      }
      if (Object.keys(updateFields).length > 0) {
        try {
          await supabase
            .from('reservations')
            .update(updateFields)
            .eq('id', currentRecord.id);
          console.log("予約レコードを補完更新:", updateFields);
        } catch (e) {
          console.log("予約補完更新エラー（無視可）:", e);
        }
      }
    }

    // ユーザーへのLINE通知
    if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
      let messageText = "";
      if (effectiveType === 'INSERT') {
        messageText = `【Piste 予約確定】\nご予約ありがとうございます。\n\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n\n当日お会いできるのを楽しみにしております。`;
      } else if (effectiveType === 'UPDATE') {
        messageText = `【Piste 予約変更】\n予約内容が変更されました。\n\n新日時: ${dateStr} ${timeStr}〜\n新メニュー: ${menuName}`;
      } else if (effectiveType === 'DELETE') {
        const reasonStr = currentRecord.cancel_reason ? `\n理由: ${currentRecord.cancel_reason}` : "";
        messageText = `【Piste 予約キャンセル】\n予約のキャンセルを承りました。\n\n日時: ${dateStr} ${timeStr}${reasonStr}\n\nまたのご利用をお待ちしております。`;
      }
      if (messageText) await sendLineMessage(lineUserId, messageText);
    }

    // 各種メール通知（管理者・ユーザー）
    if (RESEND_API_KEY) {
      const lineLink = "https://liff.line.me/2009052718-9rclRq3Z";
      const lineNotice = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n【LINE連携のご案内】\nLINE連携をしていただくと、予約のリマインド通知をLINEで受け取れるほか、AIチャットでの予約確認・変更もよりスムーズになります。\nぜひ以下のリンクから連携をお願いいたします。\n${lineLink}\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;
      const signature = `${lineNotice}\n\n☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆\nPiste（ピステ）\nhttps://piste-i.com\ntel:09099480878\n〒447-0042\n愛知県碧南市中後町3ー3中央ビル1F`;

      // 管理者へ
      if (ADMIN_EMAIL) {
        let actionLabel = "";
        if (effectiveType === 'INSERT') actionLabel = "新規予約";
        else if (effectiveType === 'UPDATE') actionLabel = "予約変更";
        else if (effectiveType === 'DELETE') actionLabel = "キャンセル";

        const adminSubject = `【Piste】${actionLabel}通知（${userName} 様）`;
        let adminBody = `${actionLabel}内容:\nお名前: ${userName} 様\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n電話: ${userPhone}\nメール: ${userEmail}`;

        if (effectiveType === 'DELETE' && currentRecord.cancel_reason) {
          adminBody += `\nキャンセル理由: ${currentRecord.cancel_reason}`;
        }

        await sendEmail(ADMIN_EMAIL, adminSubject, adminBody);
      }

      // ユーザーへ (LINE連携していない場合)
      if (!lineUserId && userEmail !== "不明") {
        let userSubject = "";
        let userBody = "";

        if (effectiveType === 'INSERT') {
          userSubject = `【Piste】予約確定のお知らせ`;
          userBody = `${userName} 様\n\nご予約が確定いたしました。\n\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n\n当日お会いできるのを楽しみにしております。${signature}`;
        } else if (effectiveType === 'UPDATE') {
          userSubject = `【Piste】予約変更のお知らせ`;
          userBody = `${userName} 様\n\n予約内容が変更されました。\n\n新日時: ${dateStr} ${timeStr}〜\n新メニュー: ${menuName}\n\n当日お待ちしております。${signature}`;
        } else if (effectiveType === 'DELETE') {
          const reasonStr = currentRecord.cancel_reason ? `\n理由: ${currentRecord.cancel_reason}` : "";
          userSubject = `【Piste】予約キャンセルのお知らせ`;
          userBody = `${userName} 様\n\n予約のキャンセルを承りました。\n\n日時: ${dateStr} ${timeStr}${reasonStr}\n\nまたのご利用をお待ちしております。${signature}`;
        }

        if (userSubject && userBody) {
          await sendEmail(userEmail, userSubject, userBody);
        }
      }
    }

    return new Response(JSON.stringify({ message: "Success" }), { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }
})

async function sendEmail(to: string, subject: string, text: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`
      },
      body: JSON.stringify({ from: Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev", to: [to], subject: subject, text: text })
    });
    console.log("Email送信結果:", await res.json());
  } catch (e) {
    console.error("Email送信失敗:", e);
  }
}

async function sendLineMessage(userId: string, text: string) {
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN")}`
      },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] })
    });
  } catch (e) {
    console.error("LINE送信失敗:", e);
  }
}
