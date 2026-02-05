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
                        id: { type: "STRING" },
                        name: { type: "STRING" },
                        date: { type: "STRING" },
                        time: { type: "STRING" },
                        cancel_reason: { type: "STRING" }
                    },
                    required: ["id", "name", "date", "time"]
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
        const { message, history } = await req.json();
        const todayStr = new Date().toISOString().split('T')[0];

        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash",
            tools: tools,
            systemInstruction: `あなたはPisteのAIコンシェルジュ「デコピン」です。丁寧な敬語で予約管理をサポートします。今日の日付: ${todayStr}`
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
                let query = supabase.from('reservations').select('*').gte('reservation_date', todayStr);
                if (args.name) query = query.ilike('name', `%${args.name}%`);
                if (args.phone_last4) query = query.like('phone', `%${args.phone_last4}`);
                const { data } = await query.order('reservation_date', { ascending: true }).limit(5);
                toolResponseContent = JSON.stringify({ found_reservations: data || [] });
            }
            else if (call.name === "add_reservation") {
                const { error } = await supabase.from('reservations').insert([{ ...args, source: 'ai-dekopin' }]);
                toolResponseContent = error ? JSON.stringify({ error: error.message }) : JSON.stringify({ status: "Success" });
            }
            else if (call.name === "cancel_reservation") {
                if (args.cancel_reason) {
                    await supabase.from('reservations').update({ cancel_reason: args.cancel_reason }).eq('id', args.id);
                }
                const { error } = await supabase.from('reservations').delete().eq('id', args.id);
                toolResponseContent = error ? JSON.stringify({ error: error.message }) : JSON.stringify({ status: "Success" });
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
