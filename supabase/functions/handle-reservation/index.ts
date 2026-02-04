import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// GASでデプロイしたWebアプリのURLをここに貼ってください
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbwYgs-NLD0Jvqi3v3oWsa0uWGHJb-HbIvoVsHE6Wjqzns-Y6X-UJQqr3HstZ1-8ZeEL6A/exec";

serve(async (req) => {
  try {
    const { record } = await req.json()
    console.log("予約データ検知:", record.id, record.source)

    // 【重要】カレンダーから同期されたデータ（google-manual）の場合は、
    // 再びカレンダーに書き込む必要がないため、ここで終了する
    if (record.source === 'google-manual') {
      console.log("カレンダーからの同期データのため、GASへの送信をスキップします。")
      return new Response(JSON.stringify({ message: "Skipped: Source is google-manual" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      })
    }

    // GASにデータを送信（WEB予約やAI予約のみ送信）
    const response = await fetch(GAS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    })

    const result = await response.text()
    console.log("GASからのレスポンス:", result)

    return new Response(JSON.stringify({ message: "Success", gasResponse: result }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    })
  }
})
