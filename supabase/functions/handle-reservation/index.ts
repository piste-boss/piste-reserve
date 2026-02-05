import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwYgs-NLD0Jvqi3v3oWsa0uWGHJb-HbIvoVsHE6Wjqzns-Y6X-UJQqr3HstZ1-8ZeEL6A/exec";
const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");

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
        await fetch(GAS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...currentRecord, type: type?.toLowerCase() }),
        })
      } catch (e) {
        console.error("GAS送信エラー:", e)
      }
    }

    // LINE通知ロジック
    const lineUserId = currentRecord.line_user_id;
    if (lineUserId && LINE_CHANNEL_ACCESS_TOKEN) {
      let messageText = "";
      const dateStr = currentRecord.reservation_date;
      const timeStr = currentRecord.reservation_time;
      const menuName = getMenuName(currentRecord.menu_id);

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

