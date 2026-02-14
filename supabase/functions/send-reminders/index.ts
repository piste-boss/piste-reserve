import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const LINE_CHANNEL_ACCESS_TOKEN = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    // 現在時刻から「3時間後」の予約を探す（15分のマージンを持たせる）
    const now = new Date();
    const threeHoursLater = new Date(now.getTime() + (3 * 60 * 60 * 1000));

    // YYYY-MM-DD
    const targetDate = threeHoursLater.toISOString().split('T')[0];
    // HH:mm (24時間形式)
    const targetTimeMin = new Date(threeHoursLater.getTime() - (7 * 60 * 1000)).toTimeString().substring(0, 5);
    const targetTimeMax = new Date(threeHoursLater.getTime() + (8 * 60 * 1000)).toTimeString().substring(0, 5);

    console.log(`リマインド検索: ${targetDate} ${targetTimeMin}〜${targetTimeMax}`);

    // 対象の予約を取得
    const { data: reservations, error } = await supabase
      .from('reservations')
      .select('*')
      .eq('reservation_date', targetDate)
      .gte('reservation_time', targetTimeMin)
      .lte('reservation_time', targetTimeMax)
      .eq('reminder_sent', false)
      .not('line_user_id', 'is', null);

    if (error) throw error;

    console.log(`送信対象件数: ${reservations?.length || 0}`);

    // メニュー一覧をDBから一括取得
    const { data: menuList } = await supabase.from('menus').select('id, label');
    const menuMap = new Map((menuList || []).map(m => [m.id, m.label]));

    for (const resv of reservations || []) {
      const menuName = menuMap.get(resv.menu_id) || getMenuName(resv.menu_id);
      const message = `【リマインド】\n本日 ${resv.reservation_time} からのご予約がございます。\n\nメニュー: ${menuName}\n\nお気をつけてお越しください。お待ちしております。`;

      await sendLineMessage(resv.line_user_id, message);

      // 送信済みフラグを更新
      await supabase
        .from('reservations')
        .update({ reminder_sent: true })
        .eq('id', resv.id);
    }

    return new Response(JSON.stringify({ message: "Reminder job finished", count: reservations?.length }), {
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
    return await res.json();
  } catch (e) {
    console.error("LINE送信失敗:", e);
  }
}
