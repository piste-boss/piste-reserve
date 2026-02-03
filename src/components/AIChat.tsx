import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { supabase } from '../lib/supabase';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const API_KEY = "AIzaSyB35EmmHGKlc8_apokVLcPiA47WykrG_E8";
const genAI = new GoogleGenerativeAI(API_KEY);

// Tool Definition for Function Calling
const tools = [
    {
        functionDeclarations: [
            {
                name: "register_reservation",
                description: "予約またはキャンセルの依頼をデータベースに登録します。",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        name: { type: SchemaType.STRING, description: "お客様の名前" },
                        email: { type: SchemaType.STRING, description: "メールアドレス" },
                        phone: { type: SchemaType.STRING, description: "電話番号" },
                        date: { type: SchemaType.STRING, description: "予約日 (例: 2024-02-03)" },
                        time: { type: SchemaType.STRING, description: "予約時間 (例: 10:00)" },
                        menu_id: { type: SchemaType.STRING, description: "メニューID (personal-20, trial-60, entry-30, online-30, first-60)" },
                        type: { type: SchemaType.STRING, description: "種別 ('reservation' または 'cancel')" }
                    },
                    required: ["name", "email", "phone", "date", "time", "type"]
                }
            }
        ]
    }
];

const AIChat: React.FC<Props> = ({ isOpen, onClose }) => {
    const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([
        { role: 'model', text: 'こんにちは！AIコンシェルジュのデコピンです。予約の空き状況やキャンセルなどのご相談を承ります。何かお手伝いしましょうか？' }
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const chatRef = useRef<any>(null);

    useEffect(() => {
        if (!chatRef.current) {
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                tools: tools,
                systemInstruction: `
          あなたの名前は「デコピン」です。パーソナルジム「Piste（ピステ）」のAIコンシェルジュとして振る舞ってください。
          
          【本日の日付】
          - 現在の日付: 2026-02-03 (火曜日)
          - これを基準に「明日」「来週火曜」などの日付を特定してください。

          【ジムの仕様】
          - ターゲット: 40代〜60代（丁寧で落ち着いた敬語を使用してください）
          - 料金体系: 月額定額制（サブスクリプション）。
          - メニューとID: 
            - パーソナルトレーニング(20分): personal-20
            - 無料体験(60分): trial-60
            - 入会手続き(30分): entry-30
            - オンラインパーソナル(30分): online-30
            - 初回パーソナル(60分): first-60
          - 予約可能時間: 午前9:30〜、午後13:00〜（20分刻み）

          【重要ルール】
          1. 予約・キャンセルの際は、必ず以下の5項目をユーザーから聞き出してください。
             - お名前
             - 電話番号
             - メールアドレス
             - 希望日時 (日付と時間)
             - メニュー
          2. 全情報が揃ったら、必ず「お名前: 〇〇様、日時: 〇/〇 〇:〇〜、メニュー: 〇〇 で予約を確定してよろしいでしょうか？」と最終確認を行ってください。
          3. ユーザーが「はい」「お願いします」など同意したら、即座に 'register_reservation' 関数を実行してください。
          4. 関数に渡す 'date' は必ず 'YYYY-MM-DD' 形式に変換してください。
        `
            });
            chatRef.current = model.startChat({
                history: [],
            });
        }
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSendMessage = async () => {
        if (!input.trim() || !chatRef.current) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInput('');
        setIsTyping(true);

        try {
            const result = await chatRef.current.sendMessage(userMessage);
            const response = await result.response;

            // Handle Function Calling
            const calls = response.candidates[0].content.parts.filter((p: any) => p.functionCall);

            if (calls.length > 0) {
                const call = calls[0].functionCall;
                if (call.name === "register_reservation") {
                    const args = call.args;

                    // Temporary message to show progress
                    setMessages(prev => [...prev, { role: 'model', text: 'システムに予約情報を登録しています...' }]);

                    // Supabase Save
                    const { error } = await supabase.from('reservations').insert([{
                        name: args.name,
                        email: args.email,
                        phone: args.phone,
                        reservation_date: args.date,
                        reservation_time: args.time,
                        menu_id: args.menu_id || 'unknown',
                        source: `ai-dekopin-${args.type}`
                    }]);

                    if (error) throw error;

                    // Send tool result back to Gemini to get final response
                    const toolResult = {
                        functionResponse: {
                            name: "register_reservation",
                            response: { content: "Success: Reservation saved to database." }
                        }
                    };
                    const finalResult = await chatRef.current.sendMessage([toolResult]);
                    const finalResponse = await finalResult.response;

                    // Replace the "saving" message with the final confirmation
                    setMessages(prev => {
                        const newMsgs = [...prev];
                        newMsgs[newMsgs.length - 1] = { role: 'model', text: finalResponse.text() };
                        return newMsgs;
                    });
                }
            } else {
                setMessages(prev => [...prev, { role: 'model', text: response.text() }]);
            }
        } catch (error: any) {
            console.error("Gemini/Supabase Error:", error);
            const errorMsg = error.message || "不明なエラー";
            setMessages(prev => [...prev, { role: 'model', text: `申し訳ありません。手続き中にエラーが発生しました (${errorMsg})。` }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                width: '100%',
                maxWidth: '500px',
                height: '80vh',
                borderRadius: '20px 20px 0 0',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                animation: 'slideUp 0.3s ease'
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    padding: '20px',
                    borderBottom: '1px solid #eee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--piste-dark-blue)',
                    color: 'white'
                }}>
                    <div>
                        <div style={{ fontWeight: 'bold' }}>AIコンシェルジュ デコピン</div>
                        <div style={{ fontSize: '12px', opacity: 0.8 }}>オンラインでお答えします</div>
                    </div>
                    <button onClick={onClose} style={{ color: 'white', backgroundColor: 'transparent', fontSize: '24px' }}>✕</button>
                </div>

                {/* Chat Area */}
                <div ref={scrollRef} style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {messages.map((m, i) => (
                        <div key={i} style={{
                            alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: m.role === 'user' ? 'var(--piste-green)' : '#f0f2f5',
                            color: m.role === 'user' ? 'white' : 'var(--piste-text-main)',
                            padding: '12px 16px',
                            borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            maxWidth: '80%',
                            fontSize: '14px',
                            lineHeight: '1.6'
                        }}>
                            {m.text}
                        </div>
                    ))}
                    {isTyping && (
                        <div style={{ alignSelf: 'flex-start', color: '#718096', fontSize: '12px' }}>AIが入力中...</div>
                    )}
                </div>

                {/* Input Area */}
                <div style={{ padding: '20px', borderTop: '1px solid #eee', display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyPress={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder="メッセージを入力..."
                        style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '25px',
                            border: '1px solid #ddd',
                            outline: 'none'
                        }}
                    />
                    <button
                        onClick={handleSendMessage}
                        style={{
                            backgroundColor: 'var(--piste-green)',
                            color: 'white',
                            width: '45px',
                            height: '45px',
                            borderRadius: '50%',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center'
                        }}
                    >
                        ➤
                    </button>
                </div>
            </div>
            <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
        </div>
    );
};

export default AIChat;
