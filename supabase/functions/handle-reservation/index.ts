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

    // UPDATE時の重複通知・不要通知を防ぐチェック
    if (type === 'UPDATE') {
      const isDateChanged = record.reservation_date !== old_record.reservation_date;
      const isTimeChanged = record.reservation_time !== old_record.reservation_time;
      const isMenuChanged = record.menu_id !== old_record.menu_id;

      if (!isDateChanged && !isTimeChanged && !isMenuChanged) {
        console.log("重要な変更がないため、通知をスキップします。");
        return new Response(JSON.stringify({ message: "Update skipped" }), { status: 200 });
      }
    }

    const currentRecord = type === 'DELETE' ? old_record : record
    console.log(`予約データ検知 [${type}]:`, currentRecord.id, currentRecord.source)

    // GASへの同期
    if (currentRecord.source !== 'google-manual') {
      try {
        console.log("GAS送信開始:", GAS_WEBHOOK_URL);

        // LPからの予約も含め、GASには 'web' として送り、確実にカレンダー同期させる
        const payloadForGas = JSON.parse(JSON.stringify(body));
        if (payloadForGas.record && payloadForGas.record.source === 'lp-trial') {
          payloadForGas.record.source = 'web';
        }

        const gasRes = await fetch(GAS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadForGas),
        });

        const gasText = await gasRes.text();
        console.log("GASレスポンス:", gasText);

        let gasData;
        try {
          gasData = JSON.parse(gasText);
        } catch (e) {
          console.log("GASレスポンスはJSONではありませんでした");
        }

        if (type === 'INSERT' && gasData?.eventId) {
          const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseKey);

          await supabase
            .from('reservations')
            .update({ google_event_id: gasData.eventId })
            .eq('id', currentRecord.id);
        }
      } catch (e) {
        console.error("GAS同期エラー:", e);
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
      if (messageText) await sendLineMessage(lineUserId, messageText);
    }

    // 各種メール通知（管理者・ユーザー）
    if (RESEND_API_KEY) {
      const signature = `\n\n☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆☆\nPiste（ピステ）\nhttps://piste-i.com\ntel:09099480878\n〒447-0042\n愛知県碧南市中後町3ー3中央ビル1F`;

      // 管理者へ
      if (ADMIN_EMAIL) {
        let adminSubject = `【Piste】予約通知（${userName} 様）`;
        let adminBody = `お名前: ${userName} 様\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n電話: ${userPhone}\nメール: ${userEmail}`;
        await sendEmail(ADMIN_EMAIL, adminSubject, adminBody);
      }

      // ユーザーへ (LINE連携していない場合)
      if (!lineUserId && userEmail !== "不明") {
        let userSubject = `【Piste】予約確定のお知らせ`;
        let userBody = `${userName} 様\n\nご予約が確定いたしました。\n\n日時: ${dateStr} ${timeStr}〜\nメニュー: ${menuName}\n\n当日お会いできるのを楽しみにしております。${signature}`;
        await sendEmail(userEmail, userSubject, userBody);
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
        "Authorization": `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject: subject, text: text })
    });
    console.log("Email送信結果:", await res.json());
  } catch (e) {
    console.error("Email送信失敗:", e);
  }
}

function getMenuName(id: string) {
  const menus: Record<string, string> = {
    'personal-20': 'パーソナルトレーニング',
    'trial-60': '無料体験',
    'entry-30': '入会手続き',
    'online-30': 'オンライン',
    'first-60': '初回パーソナル',
  };
  return menus[id] || id;
}

async function sendLineMessage(userId: string, text: string) {
  try {
    await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
      },
      body: JSON.stringify({ to: userId, messages: [{ type: "text", text }] })
    });
  } catch (e) {
    console.error("LINE送信失敗:", e);
  }
}
