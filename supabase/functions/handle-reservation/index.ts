import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwYgs-NLD0Jvqi3v3oWsa0uWGHJb-HbIvoVsHE6Wjqzns-Y6X-UJQqr3HstZ1-8ZeEL6A/exec";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL");
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";

serve(async (req) => {
  try {
    const body = await req.json()
    const { type, record, old_record } = body

    // 実際に処理するレコードを選択（削除時はold_recordを使用）
    const currentRecord = type === 'DELETE' ? old_record : record
    console.log(`予約データ検知 [${type}]:`, currentRecord.id, currentRecord.source)

    // GASへの同期（既存ロジック維持）
    if (currentRecord.source !== 'google-manual') {
      try {
        console.log("GAS送信開始:", GAS_WEBHOOK_URL);
        const gasRes = await fetch(GAS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...currentRecord, type: type?.toLowerCase() }),
        });
        const gasData = await gasRes.json();
        console.log(`GAS送信結果:`, gasData);

        // GASが eventId を返してきた場合、Supabaseを更新
        if (type === 'INSERT' && gasData.eventId) {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseKey);

          const { error: updateError } = await supabase
            .from('reservations')
            .update({ google_event_id: gasData.eventId })
            .eq('id', currentRecord.id);

          if (updateError) console.error("EventID更新失敗:", updateError);
          else console.log("EventID更新成功:", gasData.eventId);
        }
      } catch (e) {
        console.error("GAS送信・更新エラー:", e);
      }
    }

    // 基本情報
    const dateStr = currentRecord.reservation_date;
    const timeStr = currentRecord.reservation_time;
    const menuName = getMenuName(currentRecord.menu_id);
    const userName = currentRecord.name || "不明";
    const userPhone = currentRecord.phone || "不明";
    const userEmail = currentRecord.email || "不明";

    // ユーザーへのLINE通知
    const lineUserId = currentRecord.line_user_id;
    if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
      let messageText = "";
      if (type === 'INSERT') {
        messageText = `【Piste 予約確定】\nご予約ありがとうございます。\n\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n\n当日お会いできるのを楽しみにしております。`;
      } else if (type === 'UPDATE') {
        messageText = `【Piste 予約変更】\n予約内容が変更されました。\n\n新日時: ${dateStr} ${timeStr}〜\n新メニュー: ${menuName}`;
      } else if (type === 'DELETE') {
        const reasonStr = currentRecord.cancel_reason ? `\n理由: ${currentRecord.cancel_reason}` : "";
        messageText = `【Piste 予約キャンセル】\n予約のキャンセルを承りました。\n\n日時: ${dateStr} ${timeStr}${reasonStr}\n\nまたのご利用をお待ちしております。`;
      }

      if (messageText) {
        await sendLineMessage(lineUserId, messageText);
      }
    }

    // 管理者へのメール通知
    if (ADMIN_EMAIL && RESEND_API_KEY) {
      let subject = "";
      let emailBody = "";

      if (type === 'INSERT') {
        subject = `【Piste】予約が入りました（${userName} 様）`;
        emailBody = `予約が入りました。\n\nお名前: ${userName} 様\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n電話: ${userPhone}\nメール: ${userEmail}`;
      } else if (type === 'UPDATE') {
        subject = `【Piste】予約変更のお知らせ（${userName} 様）`;
        emailBody = `予約内容が変更されました。\n\nお名前: ${userName} 様\n変更後日時: ${dateStr} ${timeStr}〜\n変更後メニュー: ${menuName}\n電話: ${userPhone}`;
      } else if (type === 'DELETE') {
        const reasonStr = currentRecord.cancel_reason ? `理由: ${currentRecord.cancel_reason}` : "理由: なし";
        subject = `【Piste】予約キャンセルのお知らせ（${userName} 様）`;
        emailBody = `予約がキャンセルされました。\n\nお名前: ${userName} 様\n予約されていた日時: ${dateStr} ${timeStr}\nメニュー: ${menuName}\n${reasonStr}`;
      }

      if (subject && emailBody) {
        await sendEmail(ADMIN_EMAIL, subject, emailBody);
      }
    }

    return new Response(JSON.stringify({ message: "Success" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    console.error("Error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})

async function sendEmail(to: string, subject: string, text: string) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: subject,
        text: text
      })
    });
    const data = await res.json();
    console.log("Email送信結果:", data);
  } catch (e) {
    console.error("Email送信失敗:", e);
  }
}

function getMenuName(id: string) {
  const menus: Record<string, string> = {
    'personal-20': 'パーソナルトレーニング',
    'trial-60': '無料体験',
    'entry-30': '入会手続き',
    'online-30': 'オンラインパーソナル',
    'first-60': '初回パーソナル',
  };
  return menus[id] || id;
}

async function sendLineMessage(userId: string, text: string) {
  try {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }]
      })
    });
    const data = await res.json();
    console.log("LINE送信結果:", data);
  } catch (e) {
    console.error("LINE送信失敗:", e);
  }
}

