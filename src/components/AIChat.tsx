import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { supabase } from '../lib/supabase';

interface Message {
    role: 'user' | 'model';
    text: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(API_KEY);

const tools = [
    {
        functionDeclarations: [
            {
                name: "get_booked_times",
                description: "指定された日付の既存予約（ブロック中）の時間一覧を取得します。案内可能な空き時間を探すのに必須のステップです。",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        date: { type: SchemaType.STRING, description: "確認したい日付 (YYYY-MM-DD)" }
                    },
                    required: ["date"]
                }
            },
            {
                name: "find_user_reservations",
                description: "お客様の既存予約を検索します。名前、電話番号の下4桁(phone_last4)、メールアドレスが提供された場合に使用します。",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: { type: SchemaType.STRING, description: "お客様の名前" },
                        email: { type: SchemaType.STRING, description: "メールアドレス" },
                        phone_last4: { type: SchemaType.STRING, description: "電話番号の下4桁" }
                    }
                }
            },
            {
                name: "add_reservation",
                description: "新規予約を登録します。※キャンセル後には絶対に呼び出さないでください。",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: { type: SchemaType.STRING, description: "名前" },
                        email: { type: SchemaType.STRING, description: "メール" },
                        phone: { type: SchemaType.STRING, description: "電話番号" },
                        date: { type: SchemaType.STRING, description: "予約日 (YYYY-MM-DD)" },
                        time: { type: SchemaType.STRING, description: "開始時間 (HH:mm)" },
                        menu_id: { type: SchemaType.STRING, description: "メニューID (personal-20, trial-60, entry-30, online-30, first-60)" }
                    },
                    required: ["name", "email", "phone", "date", "time", "menu_id"]
                }
            },
            {
                name: "cancel_reservation",
                description: "予約を削除（取り消し）します。削除する予約のID(id)が必要です。",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        id: { type: SchemaType.STRING, description: "予約ID(UUID)" },
                        name: { type: SchemaType.STRING, description: "名前" },
                        date: { type: SchemaType.STRING, description: "日付" },
                        time: { type: SchemaType.STRING, description: "時間" },
                        cancel_reason: { type: SchemaType.STRING, description: "キャンセル理由（任意）" }
                    },
                    required: ["id", "name", "date", "time"]
                }
            }
        ]
    }
] as any;

const AIChat: React.FC<Props> = ({ isOpen, onClose }) => {
    const todayStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'model', text: 'PisteのAIコンシェルジュ、デコピンです。予約の空き状況確認やキャンセル、確認などを承ります。何かお手伝いしましょうか？' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<any>(null);

    useEffect(() => {
        if (!chatRef.current) {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash",
                tools: tools,
                systemInstruction: `
          あなたは「Piste（ピステ）のAIコンシェルジュ、デコピン」です。
          
          【最優先：言葉遣い】
          - ID名（personal-20など）はシステム上の名前です。お客様には絶対に以下の名称を使ってください。
            * personal-20 -> 「パーソナルトレーニング」
            * trial-60 -> 「無料体験」
            * entry-30 -> 「入会手続き」
            * online-30 -> 「オンラインパーソナル」
            * first-60 -> 「初回パーソナル」
          - 40代〜60代の方が親しみやすい、丁寧で誠実な敬語を使用してください。

          【機能の遂行】
          - ツール（find, get_booked等）を呼び出した際は、必ずその結果（「〇〇件見つかりました」「予約を取り消しました」など）を最後まで報告してください。「確認します」で会話を終えないでください。
          - 予約キャンセル(cancel_reservation)後は、絶対に新規予約(add_reservation)を呼び出さないでください。キャンセルは「削除」を意味します。

          【本人認証と検索】
          - 「名前」＋「電話番号の下4桁」があれば照会(find_user_reservations)可能です。
          - お客様から予約の確認やキャンセルの依頼があった場合、まずは \`find_user_reservations\` で予約を特定してください。
          - キャンセル希望の際、対象の予約が1件に特定できている場合は、その詳細（日時など）を提示し、差し支えなければキャンセル理由（任意）を伺った上で、お客様の最終確認（「はい、おねがいします」など）を得てから \`cancel_reservation\` を実行してください。無理に理由を聞き出す必要はありません。
          - 複数の予約が見つかった場合は、どの予約をキャンセルするか（例：2月5日の分、など）をお客様に確認してください。
          - お客様に「予約ID」や「UUID」を尋ねたり、それらの存在を明かしたりしないでください。それらはシステム内部で処理するためのもので、お客様には不要な情報です。
          - 現在の日付: ${todayStr}

          【厳禁】
          - 会話やツールの引数に "undefined" や "null" を含めないでください。不完全な情報は無視してください。
          - キャンセル時にIDが不明な場合は、勝手に推測せず、必ず \`find_user_reservations\` を再度呼び出すか、質問してお客様から情報を引き出してください。
        `
            });
            chatRef.current = model.startChat({ history: [] });
        }
    }, [todayStr]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSendMessage = async () => {
        if (!input.trim() || !chatRef.current || isTyping) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInput('');
        setIsTyping(true);

        try {
            let result = await chatRef.current.sendMessage(userMessage);
            let response = await result.response;
            let parts = response.candidates[0].content.parts;
            let calls = parts.filter((p: any) => p.functionCall);

            // 会話が途中で止まらないように、テキストがあれば追加
            const initialText = response.text();
            if (initialText && calls.length === 0) {
                setMessages(prev => [...prev, { role: 'model', text: initialText }]);
                setIsTyping(false);
                return;
            }

            while (calls.length > 0) {
                const call = calls[0].functionCall;
                let toolResponseContent = "";
                const args = call.args;

                // undefined/nullの文字列化を徹底ガード
                const isInvalid = (v: any) => v === undefined || v === null || String(v).toLowerCase() === "undefined" || String(v).toLowerCase() === "null" || v === "";

                if (call.name === "get_booked_times") {
                    const { data } = await supabase.from('reservations').select('reservation_time, reservation_end_time').eq('reservation_date', args.date);
                    const booked = data?.map(r => `${r.reservation_time.substring(0, 5)}〜${(r.reservation_end_time || r.reservation_time).substring(0, 5)}`) || [];
                    toolResponseContent = JSON.stringify({ booked_ranges: booked });
                }
                else if (call.name === "find_user_reservations") {
                    let query = supabase.from('reservations').select('*').gte('reservation_date', todayStr);
                    if (args.name && !isInvalid(args.name)) query = query.ilike('name', `%${args.name}%`);
                    if (args.phone_last4 && !isInvalid(args.phone_last4)) query = query.like('phone', `%${args.phone_last4}`);
                    const { data } = await query.order('reservation_date', { ascending: true }).limit(5);
                    toolResponseContent = JSON.stringify({ found_reservations: data || [] });
                }
                else if (call.name === "add_reservation") {
                    // 必須項目に不備がある場合はエラーを返す
                    if (isInvalid(args.name) || isInvalid(args.date) || isInvalid(args.time) || isInvalid(args.email)) {
                        toolResponseContent = JSON.stringify({ error: "必要な情報（お名前・メール等）が不足しているため登録できませんでした。" });
                    } else {
                        // 重複チェック
                        const { data: existing } = await supabase
                            .from('reservations')
                            .select('id')
                            .eq('reservation_date', args.date)
                            .eq('reservation_time', args.time)
                            .eq('name', args.name)
                            .limit(1);

                        if (existing && existing.length > 0) {
                            toolResponseContent = JSON.stringify({ status: "Success", message: "既に同じ内容の予約が存在します。" });
                        } else {
                            const { error } = await supabase.from('reservations').insert([{
                                name: args.name, email: args.email, phone: args.phone,
                                reservation_date: args.date, reservation_time: args.time,
                                menu_id: args.menu_id, source: 'ai-dekopin'
                            }]);
                            toolResponseContent = error ? JSON.stringify({ error: error.message }) : JSON.stringify({ status: "Success", message: "予約が完了しました。" });
                        }
                    }
                }
                else if (call.name === "cancel_reservation") {
                    console.log("Attempting cancel_reservation with args:", args);
                    if (isInvalid(args.id)) {
                        toolResponseContent = JSON.stringify({ error: "予約を確認できませんでした。IDが無効です。" });
                    } else {
                        // 削除前に既存データを取得
                        const { data: record, error: fetchError } = await supabase.from('reservations').select('*').eq('id', args.id).single();

                        if (fetchError) {
                            console.error("Fetch before delete error:", fetchError);
                            toolResponseContent = JSON.stringify({ error: "予約データの取得に失敗しました。" });
                        } else {
                            // キャンセル理由があれば先に更新
                            if (args.cancel_reason) {
                                await supabase.from('reservations').update({ cancel_reason: args.cancel_reason }).eq('id', args.id);
                                // メッセージ通知用にrecordにも反映
                                (record as any).cancel_reason = args.cancel_reason;
                            }
                            const { error: deleteError } = await supabase.from('reservations').delete().eq('id', args.id);
                            if (!deleteError) {
                                console.log("Successfully deleted from DB:", args.id);
                                // GAS通知
                                try {
                                    // GASはリダイレクトを伴うため、ブラウザからのPOSTは 'no-cors' が一般的ですが、
                                    // 確実に届くよう、まずはfetchを投げます。
                                    fetch("https://script.google.com/macros/s/AKfycbwYgs-NLD0Jvqi3v3oWsa0uWGHJb-HbIvoVsHE6Wjqzns-Y6X-UJQqr3HstZ1-8ZeEL6A/exec", {
                                        method: "POST",
                                        mode: "no-cors",
                                        headers: { "Content-Type": "text/plain" }, // GAS ignores json content-type sometimes
                                        body: JSON.stringify({
                                            ...record,
                                            type: 'cancel'
                                        })
                                    }).catch(e => console.error("GAS fetch error:", e));
                                } catch (e) {
                                    console.error("GAS notification error:", e);
                                }
                                toolResponseContent = JSON.stringify({ status: "Success", message: "予約の取り消しが完了しました。" });
                            } else {
                                console.error("Delete Error:", deleteError);
                                toolResponseContent = JSON.stringify({ error: deleteError.message });
                            }
                        }
                    }
                }

                const toolCombinedResult = await chatRef.current.sendMessage([{
                    functionResponse: { name: call.name, response: { content: toolResponseContent } }
                }]);
                response = await toolCombinedResult.response;
                calls = response.candidates[0].content.parts.filter((p: any) => p.functionCall);
            }

            const finalText = response.text();
            if (finalText) {
                setMessages(prev => [...prev, { role: 'model', text: finalText }]);
            }
        } catch (error: any) {
            console.error("AI Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: "申し訳ありません。システムで一時的な不具合が発生しました。ブラウザを更新して再度お試しください。" }]);
        } finally {
            setIsTyping(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end', zIndex: 1000 }} onClick={onClose}>
            <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '500px', height: '80vh', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.3s ease' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--piste-dark-blue)', color: 'white' }}>
                    <div>
                        <div style={{ fontWeight: 'bold' }}>PisteのAIコンシェルジュ デコピン</div>
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>リアルタイム予約管理システム</div>
                    </div>
                    <button onClick={onClose} style={{ color: 'white', backgroundColor: 'transparent', border: 'none', fontSize: '24px', cursor: 'pointer' }}>✕</button>
                </div>
                <div ref={scrollRef} style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px', backgroundColor: '#f9fafb' }}>
                    {messages.map((m, i) => (
                        <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', backgroundColor: m.role === 'user' ? 'var(--piste-green)' : 'white', color: m.role === 'user' ? 'white' : 'var(--piste-text-main)', padding: '12px 16px', borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', maxWidth: '85%', fontSize: '14px', lineHeight: '1.6', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', whiteSpace: 'pre-wrap' }}>
                            {m.text}
                        </div>
                    ))}
                    {isTyping && <div style={{ alignSelf: 'flex-start', color: '#718096', fontSize: '12px', marginLeft: '10px' }}>デコピンが確認中...</div>}
                </div>
                <div style={{ padding: '15px 20px', borderTop: '1px solid #eee', display: 'flex', gap: '10px', backgroundColor: 'white' }}>
                    <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="メッセージを入力..." rows={1} style={{ flex: 1, padding: '12px 15px', borderRadius: '15px', border: '1px solid #e2e8f0', outline: 'none', resize: 'none', fontSize: '14px', maxHeight: '100px', overflowY: 'auto' }} />
                    <button onClick={handleSendMessage} style={{ backgroundColor: 'var(--piste-green)', color: 'white', width: '45px', height: '45px', borderRadius: '50%', border: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' }}>➤</button>
                </div>
            </div>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
        </div>
    );
};

export default AIChat;
