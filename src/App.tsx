import React, { useState, useEffect } from 'react';
import ReservationCalendar from './components/ReservationCalendar';
import ReservationTime from './components/ReservationTime';
import ReservationForm from './components/ReservationForm';
import MyPage from './components/MyPage';
import logo from './assets/logo.png';
import AIChat from './components/AIChat';
import AdminDashboard from './components/AdminDashboard';
import { supabase } from './lib/supabase';
import liff from '@line/liff';
import { Session } from '@supabase/supabase-js';

type Step = 'MENU' | 'DATE' | 'TIME' | 'FORM' | 'COMPLETE' | 'ADMIN' | 'AUTH' | 'MYPAGE';

interface ReservationData {
  menu: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
}

const MENUS = [
  { id: 'personal-20', label: 'パーソナルトレーニング', duration: 20 },
  { id: 'trial-60', label: '無料体験', duration: 60 },
  { id: 'entry-30', label: '入会手続き', duration: 30 },
  { id: 'online-30', label: 'オンラインパーソナル', duration: 30 },
  { id: 'first-60', label: '初回パーソナル', duration: 60 },
];

const LIFF_ID = "2009052718-9rclRq3Z";

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('MENU');
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ name?: string, phone?: string, email?: string, line_user_id?: string } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [data, setData] = useState<ReservationData>({
    menu: '', date: '', time: '', name: '', phone: '', email: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastReservationId, setLastReservationId] = useState<string | null>(null);

  // 認証状態の監視
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) setProfile(data);
  };

  const nextStep = (next: Step) => setStep(next);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      alert('ログインメールを送信しました！メールボックスをご確認ください。');
    } catch (err) {
      alert('エラーが発生しました。時間を置いてお試しください。');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLineLinking = async () => {
    if (!lastReservationId) return;
    setIsLinking(true);
    try {
      await liff.init({ liffId: LIFF_ID });
      if (!liff.isLoggedIn()) {
        liff.login();
        return;
      }
      const profileData = await liff.getProfile();
      const lineUserId = profileData.userId;

      // 予約とプロフィールの両方を更新
      await supabase.from('reservations').update({ line_user_id: lineUserId }).eq('id', lastReservationId);
      if (session) {
        await supabase.from('profiles').update({ line_user_id: lineUserId }).eq('id', session.user.id);
      }

      setIsLinked(true);
      alert("LINE連携が完了しました！通知をお送りします。");
    } catch (err) {
      console.error("LINE連携エラー:", err);
      alert("連携に失敗しました。");
    } finally {
      setIsLinking(false);
    }
  };

  const handleFormSubmit = async (formData: { name: string; email: string; phone: string }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      // 既存チェック
      const { data: existing } = await supabase.from('reservations').select('id')
        .eq('reservation_date', data.date).eq('reservation_time', data.time).eq('name', formData.name).limit(1);

      if (existing && existing.length > 0) {
        setLastReservationId(existing[0].id);
        setData({ ...data, ...formData });
        nextStep('COMPLETE');
        return;
      }

      const reservation = {
        ...formData,
        reservation_date: data.date,
        reservation_time: data.time,
        menu_id: data.menu,
        source: 'web',
        user_id: session?.user.id,
        line_user_id: profile?.line_user_id
      };

      const { data: inserted, error } = await supabase.from('reservations').insert([reservation]).select();
      if (error) throw error;

      // ログイン中ならプロフィールを更新（自動入力用）
      if (session) {
        await supabase.from('profiles').update({
          name: formData.name,
          phone: formData.phone
        }).eq('id', session.user.id);
      }

      if (inserted && inserted.length > 0) setLastReservationId(inserted[0].id);
      setData({ ...data, ...formData });
      if (profile?.line_user_id) setIsLinked(true); // 既に連携済みなら完了
      nextStep('COMPLETE');
    } catch (err) {
      console.error('Reservation Error:', err);
      alert('エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container">
      <header style={{ textAlign: 'center', padding: '20px 0', borderBottom: '1px solid #f0f0f0', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 20px' }}>
          <div style={{ width: '80px' }}></div>
          <img
            src={logo} alt="Piste Logo" style={{ height: '60px', cursor: 'pointer' }}
            onClick={() => {
              setAdminClickCount(prev => (prev + 1 >= 5 ? (setStep('ADMIN'), 0) : prev + 1));
            }}
          />
          <div style={{ width: '80px' }}>
            <button
              onClick={() => nextStep(session ? 'MYPAGE' : 'AUTH')}
              style={{ padding: '8px 12px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '20px', cursor: 'pointer', color: 'var(--piste-text-main)' }}
            >
              {session ? 'マイページ' : 'ログイン'}
            </button>
          </div>
        </div>
      </header>

      <main style={{ paddingBottom: '100px' }}>
        {step === 'MENU' && (
          <div className="card">
            {(!session && !profile) && (
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', border: '1px solid #eee' }}>
                💡 <strong>ログインすると便利です</strong><br />
                予約の確認や、次回からの入力が自動になります。
                <button onClick={() => nextStep('AUTH')} style={{ color: 'var(--piste-green)', border: 'none', background: 'none', fontWeight: 'bold', cursor: 'pointer', marginLeft: '5px' }}>ログインへ</button>
              </div>
            )}
            <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>メニューを選択してください</h2>
            <select
              className="card" style={{ width: '100%', padding: '15px', fontSize: '16px', borderRadius: '12px', border: '1px solid #ddd', backgroundColor: 'white', fontWeight: '600' }}
              value={data.menu} onChange={(e) => setData({ ...data, menu: e.target.value })}
            >
              <option value="" disabled>メニューを選択...</option>
              {MENUS.map((m) => <option key={m.id} value={m.id}>{m.label} ({m.duration}分)</option>)}
            </select>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} disabled={!data.menu} onClick={() => nextStep('DATE')}>次へ進む</button>
          </div>
        )}

        {step === 'AUTH' && (
          <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>ログイン</h2>
            <p style={{ fontSize: '13px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>メールアドレスを入力してください。パスワード不要のログインリンクをお送りします。</p>
            <form onSubmit={handleLogin}>
              <input
                type="email" required placeholder="example@piste.com" className="card"
                style={{ width: '100%', padding: '12px', marginBottom: '15px', border: '1px solid #ddd' }}
                value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={authLoading}>
                {authLoading ? '送信中...' : 'ログインメールを送る'}
              </button>
            </form>
            <button className="btn-secondary" style={{ width: '100%', marginTop: '10px', background: 'none', boxShadow: 'none' }} onClick={() => nextStep('MENU')}>戻る</button>
          </div>
        )}

        {step === 'MYPAGE' && (
          <MyPage session={session} onBack={() => nextStep('MENU')} userEmail={session?.user.email || ''} />
        )}

        {step === 'DATE' && <ReservationCalendar onSelect={(date) => { setData({ ...data, date }); nextStep('TIME'); }} onBack={() => nextStep('MENU')} />}
        {step === 'TIME' && <ReservationTime date={data.date} onSelect={(time) => { setData({ ...data, time }); nextStep('FORM'); }} onBack={() => nextStep('DATE')} />}
        {step === 'FORM' && (
          <ReservationForm
            initialData={profile ? { name: profile.name || '', phone: profile.phone || '', email: session?.user.email || '' } : undefined}
            onSubmit={handleFormSubmit} onBack={() => nextStep('TIME')} isSubmitting={isSubmitting}
          />
        )}

        {step === 'COMPLETE' && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ marginBottom: '10px' }}>予約が完了しました！</h2>
            <p style={{ color: 'var(--piste-text-muted)', fontSize: '14px', marginBottom: '20px' }}>
              {!isLinked ? 'LINE通知を有効にすると、リマインドが届きます。' : 'ご予約の詳細はLINEとメールにお送りしました。'}
            </p>

            {!isLinked && (
              <div className="card" style={{ textAlign: 'center', background: '#f0fff4', border: '1px solid #c6f6d5', padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', color: '#2f855a', marginBottom: '10px' }}>LINEで通知を受け取る</h3>
                <button
                  className="btn-primary" style={{ backgroundColor: '#06C755', borderColor: '#06C755', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}
                  disabled={isLinking} onClick={handleLineLinking}
                >
                  <span style={{ fontSize: '20px' }}>LINE</span> {isLinking ? '連携中...' : '通知を有効にする'}
                </button>
              </div>
            )}

            <div className="card" style={{ textAlign: 'left', fontSize: '14px', background: '#f8f9fa' }}>
              <div><strong>メニュー:</strong> {MENUS.find(m => m.id === data.menu)?.label}</div>
              <div><strong>日時:</strong> {data.date} {data.time}</div>
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => { setData({ menu: '', date: '', time: '', name: '', phone: '', email: '' }); nextStep('MENU'); setLastReservationId(null); setIsLinked(false); }}>
              トップに戻る
            </button>
          </div>
        )}

        {step === 'ADMIN' && (
          <div>
            <AdminDashboard />
            <div style={{ textAlign: 'center', marginTop: '20px' }}><button className="btn-secondary" onClick={() => setStep('MENU')}>予約画面に戻る</button></div>
          </div>
        )}
      </main>

      <div style={{ position: 'fixed', bottom: '20px', right: '20px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px', zIndex: 100 }}>
        <div className="card" style={{ padding: '12px 16px', fontSize: '13px', marginBottom: 0, boxShadow: 'var(--shadow-premium)', borderRadius: '16px 16px 4px 16px', maxWidth: '220px', border: '1px solid var(--piste-green)', backgroundColor: '#f0fff4' }}>
          <div style={{ fontWeight: 'bold', color: 'var(--piste-green)', marginBottom: '4px' }}>AIデコピンに相談</div>
          <div style={{ color: 'var(--piste-text-main)', cursor: 'pointer' }} onClick={() => setIsChatOpen(true)}>「キャンセルしたい」<br />「予約の空きは？」など</div>
        </div>
        <div style={{ backgroundColor: 'var(--piste-dark-blue)', color: 'white', padding: '12px 20px', borderRadius: '30px', boxShadow: 'var(--shadow-premium)', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setIsChatOpen(true)}>
          <div style={{ width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>デコピンに相談</span>
        </div>
      </div>
      <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default App;
