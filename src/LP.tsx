import React, { useState, useEffect } from 'react';
import ReservationCalendar from './components/ReservationCalendar';
import ReservationTime from './components/ReservationTime';
import ReservationForm from './components/ReservationForm';
import { supabase } from './lib/supabase';
import logo from './assets/logo.png';
import AIChat from './components/AIChat';

import liff from '@line/liff';

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
const LIFF_ID = "2009052718-9rclRq3Z";

const LP: React.FC = () => {
    const [step, setStep] = useState<Step>('DATE');
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLinking, setIsLinking] = useState(false);
    const [isLinked, setIsLinked] = useState(false);
    const [lastReservationId, setLastReservationId] = useState<string | null>(null);

    const [data, setData] = useState<ReservationData>({
        menu: TRIAL_MENU.id,
        date: '',
        time: '',
        name: '',
        phone: '',
        email: '',
    });

    useEffect(() => {
        const initLiff = async () => {
            try {
                await liff.init({ liffId: LIFF_ID });
                if (liff.isLoggedIn()) {
                    const profileData = await liff.getProfile();
                    const lineUserId = profileData.userId;

                    const pendingReservationId = localStorage.getItem('pendingLineLinkReservationId_LP');
                    if (pendingReservationId) {
                        await supabase.from('reservations').update({ line_user_id: lineUserId }).eq('id', pendingReservationId);
                        localStorage.removeItem('pendingLineLinkReservationId_LP');
                        setIsLinked(true);
                        alert("LINE連携が完了しました！");
                    }
                }
            } catch (err) {
                console.error("LIFF init error", err);
            }
        };
        initLiff();
    }, []);

    const handleLineLinking = async () => {
        if (!lastReservationId) return;
        setIsLinking(true);
        try {
            if (!liff.isLoggedIn()) {
                localStorage.setItem('pendingLineLinkReservationId_LP', lastReservationId);
                liff.login({ redirectUri: window.location.href });
                return;
            }
            const profileData = await liff.getProfile();
            const lineUserId = profileData.userId;

            await supabase.from('reservations').update({ line_user_id: lineUserId }).eq('id', lastReservationId);
            setIsLinked(true);
            alert("LINE連携が完了しました！");
        } catch (err) {
            console.error(err);
            alert("連携に失敗しました。");
        } finally {
            setIsLinking(false);
        }
    };

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
            const { data: existing } = await supabase
                .from('reservations')
                .select('id')
                .eq('reservation_date', data.date)
                .eq('reservation_time', data.time)
                .eq('name', formData.name)
                .limit(1);

            if (existing && existing.length > 0) {
                setLastReservationId(existing[0].id);
                setData({ ...data, ...formData });
                nextStep('COMPLETE');
                return;
            }

            const [hours, minutes] = data.time.split(':').map(Number);
            const startDate = new Date();
            startDate.setHours(hours, minutes, 0);
            const endDate = new Date(startDate.getTime() + TRIAL_MENU.duration * 60000);
            const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

            const reservation = {
                name: formData.name,
                email: formData.email,
                phone: formData.phone,
                reservation_date: data.date,
                reservation_time: data.time,
                reservation_end_time: endTime,
                menu_id: data.menu,
                source: 'web',
                user_id: null, // メインアプリに合わせて明示的にnullを入れる
                line_user_id: liff.isLoggedIn() ? liff.getContext()?.userId : null
            };

            const { data: inserted, error } = await supabase
                .from('reservations')
                .insert([reservation])
                .select();

            if (error) {
                console.error('Reservation Error:', error);
                alert('予約の保存に失敗しました。時間をおいて再度お試しください。');
                return;
            }

            if (inserted && inserted.length > 0) {
                setLastReservationId(inserted[0].id);
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
        <div className="container" style={{ padding: '0 15px' }}>
            {/* Minimal Header */}
            <header style={{
                textAlign: 'center',
                padding: '20px 0',
                marginBottom: step === 'DATE' ? '0' : '20px'
            }}>
                <img
                    src={logo}
                    alt="Piste Logo"
                    style={{ height: '50px', objectFit: 'contain' }}
                />
            </header>

            <main style={{ paddingBottom: '100px' }}>
                {step === 'DATE' && (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <h1 style={{
                                color: 'var(--piste-dark-blue)',
                                fontSize: '20px',
                                fontWeight: '800',
                                marginBottom: '8px',
                                letterSpacing: '-0.02em'
                            }}>
                                無料体験予約
                            </h1>
                            <p style={{ color: 'var(--piste-text-muted)', fontSize: '13px' }}>
                                カレンダーから希望日を選んでください
                            </p>
                        </div>
                        <ReservationCalendar onSelect={handleDateSelect} />
                    </>
                )}

                {step === 'TIME' && (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>時間を選択</h2>
                            <p style={{ color: 'var(--piste-text-muted)', fontSize: '13px' }}>{data.date}</p>
                        </div>
                        <ReservationTime
                            date={data.date}
                            duration={TRIAL_MENU.duration}
                            onSelect={handleTimeSelect}
                            onBack={() => nextStep('DATE')}
                        />
                    </>
                )}

                {step === 'FORM' && (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: '700' }}>お客様情報の入力</h2>
                        </div>
                        <ReservationForm
                            onSubmit={handleFormSubmit}
                            onBack={() => nextStep('TIME')}
                            isSubmitting={isSubmitting}
                        />
                    </>
                )}

                {step === 'COMPLETE' && (
                    <div className="card" style={{ textAlign: 'center', padding: '40px 20px', border: 'none', boxShadow: 'var(--shadow-premium)' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
                        <h2 style={{ marginBottom: '10px' }}>体験予約が完了しました！</h2>
                        <p style={{ color: 'var(--piste-text-muted)', fontSize: '14px', marginBottom: '30px' }}>
                            ご入力いただいたメールアドレスに確認メールを送信しました。<br />
                            当日お会いできるのを楽しみにしております。
                        </p>
                        <div className="card" style={{ textAlign: 'left', fontSize: '14px', background: 'var(--piste-gray-light)', border: 'none' }}>
                            <div style={{ marginBottom: '5px' }}><strong>メニュー:</strong> {TRIAL_MENU.label}</div>
                            <div style={{ marginBottom: '5px' }}><strong>日付:</strong> {data.date}</div>
                            <div><strong>時間:</strong> {data.time}</div>
                        </div>

                        {!isLinked && (
                            <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#f0fff4', borderRadius: '15px', border: '1px solid #c6f6d5' }}>
                                <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#2f855a', marginBottom: '12px' }}>
                                    💡 LINE連携で当日までのリマインドを受け取れます
                                </p>
                                <button
                                    className="btn-primary"
                                    style={{ backgroundColor: '#06C755', border: 'none', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: 'none' }}
                                    onClick={handleLineLinking}
                                    disabled={isLinking}
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                                        <path d="M24 10.3c0-4.6-5.4-8.3-12-8.3S0 5.7 0 10.3c0 4.1 4.3 7.5 10.1 8.2.4.1.9.3 1.1.7l.4 1.7s.1.5.5.5.4-.3.4-.3l.4-2.1c.1-.4.4-.7.8-.8 5.7-.7 10.3-4.1 10.3-8.2z" />
                                    </svg>
                                    {isLinking ? '連携中...' : 'LINE連携する'}
                                </button>
                            </div>
                        )}

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
