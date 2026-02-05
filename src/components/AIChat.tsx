import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface Message {
    role: 'user' | 'model';
    text: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    lineUserId?: string;
    userContext?: {
        id?: string;
        name?: string;
        email?: string;
        phone?: string;
    } | null;
}

const AIChat: React.FC<Props> = ({ isOpen, onClose, lineUserId, userContext }) => {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'model', text: 'PisteのAI予約コンシェルジュ、デコピンです。予約の空き状況確認やキャンセル、確認などを承ります。何かお手伝いしましょうか？' }
    ]);
    const [history, setHistory] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSendMessage = async () => {
        if (!input.trim() || isTyping) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
        setInput('');
        setIsTyping(true);

        try {
            const { data, error } = await supabase.functions.invoke('ai-chat', {
                body: {
                    message: userMessage,
                    history: history,
                    lineUserId: lineUserId,
                    userContext: userContext
                }
            });

            if (error) throw error;

            if (data.text) {
                setMessages(prev => [...prev, { role: 'model', text: data.text }]);
                setHistory(data.history);
            }
        } catch (error: any) {
            console.error("AI Error:", error);
            setMessages(prev => [...prev, { role: 'model', text: "申し訳ありません。システムで一時的な不具合が発生しました。時間をおいて再度お試しください。" }]);
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
                        <div style={{ fontWeight: 'bold' }}>AI予約コンシェルジュ デコピン</div>
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
