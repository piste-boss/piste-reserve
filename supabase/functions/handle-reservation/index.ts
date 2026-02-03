import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// GASでデプロイしたWebアプリのURLをここに貼ってください
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbyexQ-6fM-PUi5qkbl1Q9a_yt-MiKvmJ4cPzr4ibg5tTN-v6LIPfwV2eIkuvoNZxZwX/exec";

serve(async (req) => {
  try {
    const { record } = await req.json()
    console.log("予約データを検知:", record)

    // GASにデータを送信
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
