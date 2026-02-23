import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

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
];

// Gemini REST API を直接呼び出す
async function callGemini(systemInstruction: string, contents: any[]) {
    const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            tools,
            contents,
        }),
    });
    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText}`);
    }
    return await res.json();
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { message, history, userContext, lineUserId } = await req.json();
        console.log("[ai-chat] Received message:", message, "history length:", history?.length || 0);
        const todayStr = new Date().toISOString().split('T')[0];

        // メニュー情報をDBから動的取得
        const { data: dbMenus } = await supabase.from('menus').select('id, label, duration').order('created_at');
        const menuList = dbMenus || [];

        // システムプロンプト用のメニューマッピングを動的構築
        const menuIdMapping = menuList.map((m: any) => `- **${m.label}** → "${m.id}" (${m.duration}分)`).join('\n');
        const menuDurationMapping = menuList.map((m: any) => `- "${m.id}": ${m.duration}分`).join('\n');

        const userInfoPrompt = userContext ? `
【現在ログイン中のお客様情報】
お名前: ${userContext.name || '未設定'}
メール: ${userContext.email || '未設定'}
電話番号: ${userContext.phone || '未設定'}
※この情報はすでに把握しています。予約時に再度尋ねる必要はありません。
` : '【現在のお客様情報】非ログイン（ゲスト利用）';

        const systemInstruction = `あなたは「AI予約コンシェルジュ デコピン」です。丁寧で誠実な敬語で予約管理をサポートします。

${userInfoPrompt}

【最重要：ダブルブッキングの禁止】
- **重複予約（ダブルブッキング）は絶対に禁止です。**
- 予約を登録（add_reservation）する前に、必ず get_booked_times を実行して、その日時の空き状況を確認してください。
- 既にお客様が入っている時間帯には、絶対に予約を入れないでください。空いている別の時間を提案してください。

【メニューIDの扱い】
お客様に「メニューID」を尋ねたり、システム上のID名を伝えたりしないでください。
お客様の希望を聞き、以下のルールで自動的にIDを変換して処理してください。
※パーソナルトレーニングは時間を尋ねる必要はありません。自動的に確定させてください。

${menuIdMapping}

【所要時間のルール（重要）】
${menuDurationMapping}

全ての予約において、(選択した開始時間 + 所要時間) が、既存の予約の時間帯と1分でも重なってはいけません。
必ず get_booked_times で既存予約の「開始〜終了」時間を確認し、重複しない時間を案内してください。

【予約キャンセル：最重要】
- お客様からキャンセルの確定を得たら、**必ず直ちに cancel_reservation を実行してください**。
- 「キャンセルを承りました」と答える前に、必ずツールを実行して成功（Success）を確認してください。
- 予約を特定するため、まず find_user_reservations で予約IDを取得し、そのIDを cancel_reservation に正確に渡してください。

今日の日付: ${todayStr}`;

        // 会話履歴を構築
        const contents = [...(history || [])];
        contents.push({ role: "user", parts: [{ text: message }] });

        // Gemini呼び出し
        console.log("[ai-chat] Calling Gemini REST API...");
        let geminiRes = await callGemini(systemInstruction, contents);
        console.log("[ai-chat] Gemini response received");

        let candidate = geminiRes.candidates?.[0];
        if (!candidate) {
            console.error("[ai-chat] No candidates:", JSON.stringify(geminiRes));
            throw new Error("Gemini returned no candidates");
        }

        // Function Call ループ
        let modelParts = candidate.content.parts;
        let functionCalls = modelParts.filter((p: any) => p.functionCall);

        while (functionCalls.length > 0) {
            // モデルの応答を履歴に追加
            contents.push({ role: "model", parts: modelParts });

            const call = functionCalls[0].functionCall;
            const args = call.args;
            let toolResponseContent = "";

            if (call.name === "get_booked_times") {
                const { data } = await supabase.from('reservations').select('reservation_time, reservation_end_time').eq('reservation_date', args.date).neq('status', 'cancelled');
                toolResponseContent = JSON.stringify({ booked_ranges: data?.map((r: any) => `${r.reservation_time.substring(0, 5)}〜${(r.reservation_end_time || r.reservation_time).substring(0, 5)}`) || [] });
            }
            else if (call.name === "find_user_reservations") {
                console.log("Finding reservations for context:", userContext?.id || "guest");
                let query = supabase.from('reservations').select('*').gte('reservation_date', todayStr).neq('status', 'cancelled');

                if (userContext?.id) {
                    query = query.eq('user_id', userContext.id);
                } else {
                    if (args.name) query = query.ilike('name', `%${args.name}%`);
                    if (args.phone_last4) query = query.like('phone', `%${args.phone_last4}`);
                    if (args.email) query = query.eq('email', args.email);
                }

                const { data } = await query.order('reservation_date', { ascending: true }).limit(5);
                toolResponseContent = JSON.stringify({ found_reservations: data || [] });
            }
            else if (call.name === "add_reservation") {
                console.log("Checking for double booking:", args.date, args.time);

                const menuDurations = new Map(menuList.map((m: any) => [m.id, m.duration]));
                const duration = menuDurations.get(args.menu_id) || 20;

                const { data: booked } = await supabase
                    .from('reservations')
                    .select('reservation_time, reservation_end_time')
                    .eq('reservation_date', args.date)
                    .neq('status', 'cancelled');

                const newStart = args.time;
                const [nh, nm] = newStart.split(':').map(Number);
                const newEndMins = nh * 60 + nm + duration;
                const newEnd = `${Math.floor(newEndMins / 60).toString().padStart(2, '0')}:${(newEndMins % 60).toString().padStart(2, '0')}`;

                const hasOverlap = booked?.some((r: any) => {
                    const exStart = r.reservation_time.substring(0, 5);
                    const exEnd = (r.reservation_end_time || r.reservation_time).substring(0, 5);
                    return (newStart < exEnd && newEnd > exStart);
                });

                if (hasOverlap) {
                    console.log("Double booking (overlap) detected!");
                    toolResponseContent = JSON.stringify({
                        error: "Double booking error",
                        message: "申し訳ありません。ご提示いただいた時間は、所要時間を含めると別のお客様の予約と重なってしまいます。別の時間を提案してください。"
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
                        reservation_end_time: newEnd,
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

                const { error: cancelError } = await supabase
                    .from('reservations')
                    .update({ status: 'cancelled', cancel_reason: args.cancel_reason || null })
                    .eq('id', args.id);

                if (cancelError) {
                    console.error("Cancel error:", cancelError);
                    toolResponseContent = JSON.stringify({ error: cancelError.message });
                } else {
                    console.log("Cancel success");
                    toolResponseContent = JSON.stringify({ status: "Success", message: "予約をキャンセルしました。" });
                }
            }

            // ツール結果を履歴に追加して再呼び出し
            contents.push({
                role: "user",
                parts: [{ functionResponse: { name: call.name, response: { content: toolResponseContent } } }]
            });

            geminiRes = await callGemini(systemInstruction, contents);
            candidate = geminiRes.candidates?.[0];
            if (!candidate) throw new Error("Gemini returned no candidates after tool call");
            modelParts = candidate.content.parts;
            functionCalls = modelParts.filter((p: any) => p.functionCall);
        }

        // 最終応答のモデルパートを履歴に追加
        contents.push({ role: "model", parts: modelParts });

        // テキスト取得
        const textPart = modelParts.find((p: any) => p.text);
        const responseText = textPart?.text || "";

        return new Response(JSON.stringify({ text: responseText, history: contents }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error("[ai-chat] ERROR:", error?.message, error?.stack || error);
        return new Response(JSON.stringify({ error: error?.message || "Unknown error" }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
})
