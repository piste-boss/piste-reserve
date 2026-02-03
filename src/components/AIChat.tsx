import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const API_KEY = "AIzaSyB35EmmHGKlc8_apokVLcPiA47WykrG_E8";
const genAI = new GoogleGenerativeAI(API_KEY);

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
                systemInstruction: `
          あなたの名前は「デコピン」です。パーソナルジム「Piste（ピステ）」のAIコンシェルジュとして振る舞ってください。
          【ジムの仕様】
          - ターゲット: 40代〜60代（丁寧で落ち着いた敬語を使用してください）
          - 料金体系: 月額定額制（サブスクリプション）。回数券はありません。
          - メニュー: パーソナルトレーニング(20分)、無料体験(60分)、入会手続き(30分)、オンラインパーソナル(30分)、初回パーソナル(60分)
          - 予約システム: 午前は9:30から、午後は13:00から、それぞれ20分刻み。
          - 特徴: 「整えてから鍛える」コンディショニング重視のジム。
          - 案内: 予約の追加、変更やキャンセルは、このチャットで承ることができます。
          - 重要事項: 予約やキャンセルの依頼があった際は、必ず「お名前」「電話番号」「メールアドレス」の3点をセットで伺ってください。これらが揃わないと手続きが進められない旨、丁寧にご案内してください。
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
            const responseText = response.text();
            setMessages(prev => [...prev, { role: 'model', text: responseText }]);
        } catch (error: any) {
            console.error("Gemini Error:", error);
            const errorMsg = error.message || "不明なエラー";
            setMessages(prev => [...prev, { role: 'model', text: `通信エラーが発生しました: ${errorMsg}` }]);
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
