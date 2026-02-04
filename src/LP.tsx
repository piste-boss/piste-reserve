import React, { useState } from 'react';
import ReservationCalendar from './components/ReservationCalendar';
import ReservationTime from './components/ReservationTime';
import ReservationForm from './components/ReservationForm';
import { supabase } from './lib/supabase';
import logo from './assets/logo.png';
import AIChat from './components/AIChat';

type Step = 'DATE' | 'TIME' | 'FORM' | 'COMPLETE';

interface ReservationData {
    menu: string;
    date: string;
    time: string;
    name: string;
    phone: string;
    email: string;
}

const TRIAL_MENU = { id: 'trial-60', label: '無料体験', duration: 60 };

const LP: React.FC = () => {
    const [step, setStep] = useState<Step>('DATE');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [data, setData] = useState<ReservationData>({
        menu: TRIAL_MENU.id,
        date: '',
        time: '',
        name: '',
        phone: '',
        email: '',
    });

    const nextStep = (next: Step) => setStep(next);

    const handleDateSelect = (date: string) => {
        setData({ ...data, date });
        nextStep('TIME');
    };

    const handleTimeSelect = (time: string) => {
        setData({ ...data, time });
        nextStep('FORM');
    };

    const handleFormSubmit = async (formData: { name: string; email: string; phone: string }) => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            // 重複チェック
            const { data: existing } = await supabase
                .from('reservations')
                .select('id')
                .eq('reservation_date', data.date)
                .eq('reservation_time', data.time)
                .eq('name', formData.name)
                .limit(1);

            if (existing && existing.length > 0) {
                setData({ ...data, ...formData });
                nextStep('COMPLETE');
                return;
            }

            const reservation = {
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                reservation_date: data.date,
                reservation_time: data.time,
                menu_id: data.menu,
                source: 'lp-trial'
            };

            const { error } = await supabase
                .from('reservations')
                .insert([reservation]);

            if (error) {
                console.error('Reservation Error:', error);
                alert('予約の保存に失敗しました。時間をおいて再度お試しください。');
                return;
            }

            setData({ ...data, ...formData });
            nextStep('COMPLETE');
        } catch (err) {
            console.error('Unexpected error:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="container">
            <header style={{ textAlign: 'center', padding: '40px 0' }}>
                <img
                    src={logo}
                    alt="Piste Logo"
                    style={{ height: '100px', marginBottom: '15px' }}
                />
                <h1 style={{ color: 'var(--piste-dark-blue)', fontSize: '24px', fontWeight: 'bold', marginBottom: '10px' }}>
                    無料体験予約フォーム
                </h1>
                <p style={{ color: 'var(--piste-text-muted)', fontSize: '15px' }}>
                    Pisteのトレーニングを無料で体験いただけます。<br />
                    カレンダーからご希望の日時を選択してください。
                </p>
            </header>

            <main style={{ paddingBottom: '100px' }}>
                {step === 'DATE' && (
                    <ReservationCalendar
                        onSelect={handleDateSelect}
                    // onBack is not provided, so button won't show
                    />
                )}

                {step === 'TIME' && (
                    <ReservationTime
                        date={data.date}
                        onSelect={handleTimeSelect}
                        onBack={() => nextStep('DATE')}
                    />
                )}

                {step === 'FORM' && (
                    <ReservationForm
                        onSubmit={handleFormSubmit}
                        onBack={() => nextStep('TIME')}
                        isSubmitting={isSubmitting}
                    />
                )}

                {step === 'COMPLETE' && (
                    <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
                        <h2 style={{ marginBottom: '10px' }}>体験予約が完了しました！</h2>
                        <p style={{ color: 'var(--piste-text-muted)', fontSize: '14px', marginBottom: '30px' }}>
                            ご入力いただいたメールアドレスに確認メールを送信しました。<br />
                            当日お会いできるのを楽しみにしております。
                        </p>
                        <div className="card" style={{ textAlign: 'left', fontSize: '14px', background: '#f8f9fa' }}>
                            <div style={{ marginBottom: '5px' }}><strong>メニュー:</strong> {TRIAL_MENU.label}</div>
                            <div style={{ marginBottom: '5px' }}><strong>日付:</strong> {data.date}</div>
                            <div><strong>時間:</strong> {data.time}</div>
                        </div>
                        <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => {
                            window.location.reload();
                        }}>
                            トップに戻る
                        </button>
                    </div>
                )}
            </main>

            {/* AI Chat Bubble */}
            <div style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: 100
            }}>
                <div style={{
                    backgroundColor: 'var(--piste-dark-blue)',
                    color: 'white',
                    padding: '12px 20px',
                    borderRadius: '30px',
                    boxShadow: 'var(--shadow-premium)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer'
                }}
                    onClick={() => setIsChatOpen(true)}
                >
                    <div style={{ width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%' }}></div>
                    <span style={{ fontSize: '14px', fontWeight: '600' }}>デコピン（AI）に相談</span>
                </div>
            </div>
            <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
        </div>
    );
};

export default LP;
