import React, { useState } from 'react';
import ReservationCalendar from './components/ReservationCalendar';
import ReservationTime from './components/ReservationTime';
import ReservationForm from './components/ReservationForm';

type Step = 'MENU' | 'DATE' | 'TIME' | 'FORM' | 'COMPLETE' | 'ADMIN';

interface ReservationData {
  menu: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
}

import logo from './assets/logo.png';
import AIChat from './components/AIChat';
import AdminDashboard from './components/AdminDashboard';
import { supabase } from './lib/supabase';

const MENUS = [
  { id: 'personal-20', label: 'パーソナルトレーニング', duration: 20 },
  { id: 'trial-60', label: '無料体験', duration: 60 },
  { id: 'entry-30', label: '入会手続き', duration: 30 },
  { id: 'online-30', label: 'オンラインパーソナル', duration: 30 },
  { id: 'first-60', label: '初回パーソナル', duration: 60 },
];

import liff from '@line/liff';

const LIFF_ID = "2009052718-9rclRq3Z";

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('MENU');
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [data, setData] = useState<ReservationData>({
    menu: '',
    date: '',
    time: '',
    name: '',
    phone: '',
    email: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextStep = (next: Step) => setStep(next);

  const handleDateSelect = (date: string) => {
    setData({ ...data, date });
    nextStep('TIME');
  };

  const handleTimeSelect = (time: string) => {
    setData({ ...data, time });
    nextStep('FORM');
  };

  const [lastReservationId, setLastReservationId] = useState<string | null>(null);

  // LINE連携処理
  const handleLineLinking = async () => {
    if (!lastReservationId) return;
    setIsLinking(true);

    try {
      await liff.init({ liffId: LIFF_ID });

      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }

      const profile = await liff.getProfile();
      const lineUserId = profile.userId;

      // Supabaseの予約レコードを更新
      const { error } = await supabase
        .from('reservations')
        .update({ line_user_id: lineUserId })
        .eq('id', lastReservationId);

      if (error) throw error;

      setIsLinked(true);
      alert("LINE連携が完了しました！通知をお送りします。");
    } catch (err) {
      console.error("LINE連携エラー:", err);
      alert("LINE連携に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setIsLinking(false);
    }
  };

  // ログイン後のリダイレクト処理（ページ読み込み時に実行）
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          // ログイン直後かチェックするためにURLパラメータ等を見ても良いが、
          // ここでは単純にプロフィールが取れれば連携処理を試みるパターンもあり
        }
      } catch (e) {
        console.error("LIFF Init Error", e);
      }
    };
    initLiff();
  }, []);

  const handleFormSubmit = async (formData: { name: string; email: string; phone: string }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      // 既存チェック
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

      const reservation = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        reservation_date: data.date,
        reservation_time: data.time,
        menu_id: data.menu,
        source: 'web'
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
    <div className="container">
      <header style={{ textAlign: 'center', padding: '30px 0' }}>
        <img
          src={logo}
          alt="Piste Logo"
          style={{ height: '80px', marginBottom: '10px', cursor: 'pointer' }}
          onClick={() => {
            const nextCount = adminClickCount + 1;
            if (nextCount >= 5) {
              setStep('ADMIN');
              setAdminClickCount(0);
            } else {
              setAdminClickCount(nextCount);
            }
          }}
        />
        <p style={{ color: 'var(--piste-text-muted)', fontSize: '14px', fontWeight: '500' }}>Piste 予約システム</p>
      </header>

      <main style={{ paddingBottom: '100px' }}>
        {step === 'MENU' && (
          <div className="card">
            <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>メニューを選択してください</h2>
            <div style={{ marginBottom: '20px' }}>
              <select
                className="card"
                style={{
                  width: '100%',
                  padding: '15px',
                  fontSize: '16px',
                  borderRadius: '12px',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  appearance: 'none',
                  backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22currentColor%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 15px center',
                  cursor: 'pointer',
                  color: 'var(--piste-dark-blue)',
                  fontWeight: '600'
                }}
                value={data.menu}
                onChange={(e) => setData({ ...data, menu: e.target.value })}
              >
                <option value="" disabled>メニューを選択...</option>
                {MENUS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.duration}分)
                  </option>
                ))}
              </select>
            </div>
            <button
              className="btn-primary"
              style={{ width: '100%' }}
              disabled={!data.menu}
              onClick={() => nextStep('DATE')}
            >
              次へ進む
            </button>
          </div>
        )}

        {step === 'DATE' && (
          <ReservationCalendar
            onSelect={handleDateSelect}
            onBack={() => nextStep('MENU')}
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
            <h2 style={{ marginBottom: '10px' }}>予約が完了しました！</h2>
            <p style={{ color: 'var(--piste-text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              当日お待ちしております。
            </p>

            {!isLinked ? (
              <div className="card" style={{
                textAlign: 'center',
                background: '#f0fff4',
                border: '1px solid #c6f6d5',
                padding: '20px',
                marginBottom: '20px'
              }}>
                <h3 style={{ fontSize: '16px', color: '#2f855a', marginBottom: '10px' }}>LINEでリマインドを受け取る</h3>
                <p style={{ fontSize: '12px', color: '#48bb78', marginBottom: '15px' }}>
                  予約の3時間前にLINEで通知をお送りします
                </p>
                <button
                  className="btn-primary"
                  style={{
                    backgroundColor: '#06C755',
                    borderColor: '#06C755',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    opacity: isLinking ? 0.7 : 1
                  }}
                  disabled={isLinking}
                  onClick={handleLineLinking}
                >
                  <span style={{ fontSize: '20px' }}>LINE</span> {isLinking ? '連携中...' : '通知を有効にする'}
                </button>
              </div>
            ) : (
              <div className="card" style={{
                textAlign: 'center',
                background: '#f0fff4',
                border: '1px solid #c6f6d5',
                padding: '15px',
                marginBottom: '20px',
                color: '#2f855a',
                fontSize: '14px',
                fontWeight: 'bold'
              }}>
                ✨ LINE通知を有効にしました！
              </div>
            )}

            <div className="card" style={{ textAlign: 'left', fontSize: '14px', background: '#f8f9fa' }}>
              <div style={{ marginBottom: '5px' }}><strong>メニュー:</strong> {MENUS.find(m => m.id === data.menu)?.label}</div>
              <div style={{ marginBottom: '5px' }}><strong>日付:</strong> {data.date}</div>
              <div><strong>時間:</strong> {data.time}</div>
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => {
              setData({ menu: '', date: '', time: '', name: '', phone: '', email: '' });
              setStep('MENU');
              setLastReservationId(null);
              setIsLinked(false);
            }}>
              トップに戻る
            </button>
          </div>
        )}

        {step === 'ADMIN' && (
          <div>
            <AdminDashboard />
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button className="btn-secondary" onClick={() => setStep('MENU')}>
                予約画面に戻る
              </button>
            </div>
          </div>
        )}
      </main>

      {/* AI Chat Bubble with Examples */}
      <div style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '10px',
        zIndex: 100
      }}>
        <div className="card" style={{
          padding: '12px 16px',
          fontSize: '13px',
          marginBottom: 0,
          boxShadow: 'var(--shadow-premium)',
          borderRadius: '16px 16px 4px 16px',
          maxWidth: '220px',
          border: '1px solid var(--piste-green)',
          backgroundColor: '#f0fff4'
        }}>
          <div style={{ fontWeight: 'bold', color: 'var(--piste-green)', marginBottom: '4px' }}>例えばこんな質問</div>
          <div style={{ color: 'var(--piste-text-main)', marginBottom: '4px', cursor: 'pointer' }}>「キャンセルしたいです。」</div>
          <div style={{ color: 'var(--piste-text-main)', cursor: 'pointer' }}>「2/3の空き情報を教えてください」</div>
        </div>

        <div style={{
          backgroundColor: 'var(--piste-dark-blue)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: '30px',
          boxShadow: 'var(--shadow-premium)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          transition: 'all 0.3s ease'
        }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
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

export default App;
