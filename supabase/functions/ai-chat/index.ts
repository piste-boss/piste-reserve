import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI, SchemaType } from "https://esm.sh/@google/generative-ai@0.21.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const tools = [
    {
        functionDeclarations: [
            {
                name: "get_booked_times",
                description: "指定された日付の既存予約の時間一覧を取得します。",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        date: { type: "STRING", description: "確認したい日付 (YYYY-MM-DD)" }
                    },
                    required: ["date"]
                }
            },
            {
                name: "find_user_reservations",
                description: "お客様の既存予約を検索します。",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING" },
                        email: { type: "STRING" },
                        phone_last4: { type: "STRING" }
                    }
                }
            },
            {
                name: "add_reservation",
                description: "新規予約を登録します。",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        name: { type: "STRING" },
                        email: { type: "STRING" },
                        phone: { type: "STRING" },
                        date: { type: "STRING" },
                        time: { type: "STRING" },
                        menu_id: { type: "STRING" }
                    },
                    required: ["name", "email", "phone", "date", "time", "menu_id"]
                }
            },
            {
                name: "cancel_reservation",
                description: "予約を削除（取り消し）します。",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        id: { type: "STRING", description: "キャンセルする予約のID(UUID)" },
                        cancel_reason: { type: "STRING", description: "キャンセルの理由（任意）" }
                    },
                    required: ["id"]
                }
            }
        ]
    }
] as any;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { message, history, userContext, lineUserId } = await req.json();
        const todayStr = new Date().toISOString().split('T')[0];

        const userInfoPrompt = userContext ? `
【現在ログイン中のお客様情報】
お名前: ${userContext.name || '未設定'}
メール: ${userContext.email || '未設定'}
電話番号: ${userContext.phone || '未設定'}
※この情報はすでに把握しています。予約時に再度尋ねる必要はありません。
` : '【現在のお客様情報】非ログイン（ゲスト利用）';

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            tools: tools,
            systemInstruction: `あなたは「AI予約コンシェルジュ デコピン」です。丁寧で誠実な敬語で予約管理をサポートします。

${userInfoPrompt}

【最重要：ダブルブッキングの禁止】
- **重複予約（ダブルブッキング）は絶対に禁止です。**
- 予約を登録（add_reservation）する前に、必ず get_booked_times を実行して、その日時の空き状況を確認してください。
- 既にお客様が入っている時間帯には、絶対に予約を入れないでください。空いている別の時間を提案してください。

【メニューIDの扱い】
お客様に「メニューID」を尋ねたり、システム上のID名（personal-20など）を伝えたりしないでください。
お客様の希望を聞き、以下のルールで自動的にIDを変換して処理してください。

- **パーソナルトレーニング / パーソナル** → "personal-20" (※重要：時間を尋ねる必要はありません。自動的に20分コースとして確定させてください)
- **無料体験** → "trial-60"
- **初回パーソナル / 初めての利用** → "first-60"
- **入会手続き** → "entry-30"
- **オンラインパーソナル** → "online-30"

【プライバシーと本人認証】
- **重要：自分以外の情報を絶対に教えないでください。**
- 現在ログイン中のお客様 (${userContext?.name || 'ゲスト'}) 以外の予約情報は、いかなる場合も開示・検索してはいけません。
- 予約の確認やキャンセル依頼があった場合、まず find_user_reservations で予約を特定してください。
- ログイン中の場合は、自動的にその方の予約のみが検索対象となります。
- お客様に「予約ID」や「UUID」を尋ねないでください。

【予約キャンセル：最重要】
- お客様からキャンセルの確定を得たら、**必ず直ちに cancel_reservation を実行してください**。
- 「キャンセルを承りました」と答える前に、必ずツールを実行して成功（Success）を確認してください。
- 予約を特定するため、まず find_user_reservations で予約IDを取得し、そのIDを cancel_reservation に正確に渡してください。

今日の日付: ${todayStr}`
        });

        const chat = model.startChat({ history: history || [] });
        let result = await chat.sendMessage(message);
        let response = await result.response;
        let parts = response.candidates[0].content.parts;
        let calls = parts.filter((p: any) => p.functionCall);

        while (calls.length > 0) {
            const call = calls[0].functionCall;
            let toolResponseContent = "";
            const args = call.args;

            if (call.name === "get_booked_times") {
                const { data } = await supabase.from('reservations').select('reservation_time, reservation_end_time').eq('reservation_date', args.date);
                toolResponseContent = JSON.stringify({ booked_ranges: data?.map(r => `${r.reservation_time.substring(0, 5)}〜${(r.reservation_end_time || r.reservation_time).substring(0, 5)}`) || [] });
            }
            else if (call.name === "find_user_reservations") {
                console.log("Finding reservations for context:", userContext?.id || "guest");
                let query = supabase.from('reservations').select('*').gte('reservation_date', todayStr);

                if (userContext?.id) {
                    // ログイン中の場合は、そのユーザーIDの予約のみに限定（最重要）
                    query = query.eq('user_id', userContext.id);
                } else {
                    // ゲストの場合は名前や電話番号で検索（他人の情報を見せないようAIの指示と併用）
                    if (args.name) query = query.ilike('name', `%${args.name}%`);
                    if (args.phone_last4) query = query.like('phone', `%${args.phone_last4}`);
                    if (args.email) query = query.eq('email', args.email);
                }

                const { data } = await query.order('reservation_date', { ascending: true }).limit(5);
                toolResponseContent = JSON.stringify({ found_reservations: data || [] });
            }
            else if (call.name === "add_reservation") {
                console.log("Checking for double booking:", args.date, args.time);

                // バックエンド側での重複最終チェック（安全策）
                const { data: existing } = await supabase
                    .from('reservations')
                    .select('id')
                    .eq('reservation_date', args.date)
                    .eq('reservation_time', args.time);

                if (existing && existing.length > 0) {
                    console.log("Double booking detected!");
                    toolResponseContent = JSON.stringify({
                        error: "Double booking error",
                        message: "申し訳ありません。その時間は直前に別のお客様の予約が入りました。別の時間を提案してください。"
                    });
                } else {
                    console.log("Adding reservation for:", args.name || userContext?.name);
                    const { error } = await supabase.from('reservations').insert([{
                        user_id: userContext?.id,
                        name: args.name || userContext?.name,
                        email: args.email || userContext?.email,
                        phone: args.phone || userContext?.phone,
                        reservation_date: args.date,
                        reservation_time: args.time,
                        menu_id: args.menu_id,
                        source: 'ai-dekopin',
                        line_user_id: lineUserId
                    }]);
                    if (error) console.error("Add reservation error:", error);
                    toolResponseContent = error ? JSON.stringify({ error: error.message }) : JSON.stringify({ status: "Success", message: "予約を登録しました。" });
                }
            }
            else if (call.name === "cancel_reservation") {
                console.log("Canceling reservation with ID:", args.id);

                // 理由があれば先に更新してから削除（Webhookで理由を送るため）
                if (args.cancel_reason) {
                    const { error: upError } = await supabase.from('reservations').update({ cancel_reason: args.cancel_reason }).eq('id', args.id);
                    if (upError) console.error("Cancel reason update error:", upError);
                }

                const { error: delError, status } = await supabase.from('reservations').delete().eq('id', args.id);

                if (delError) {
                    console.error("Delete error:", delError);
                    toolResponseContent = JSON.stringify({ error: delError.message });
                } else {
                    console.log("Delete success status:", status);
                    toolResponseContent = JSON.stringify({ status: "Success", message: "予約をキャンセルしました。" });
                }
            }

            const toolCombinedResult = await chat.sendMessage([{
                functionResponse: { name: call.name, response: { content: toolResponseContent } }
            }]);
            response = await toolCombinedResult.response;
            calls = response.candidates[0].content.parts.filter((p: any) => p.functionCall);
        }

        return new Response(JSON.stringify({ text: response.text(), history: await chat.getHistory() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
})
