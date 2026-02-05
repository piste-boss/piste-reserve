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
import type { Session } from '@supabase/supabase-js';

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
  { id: 'online-30', label: 'オンライン', duration: 30 },
  { id: 'first-60', label: '初回パーソナル', duration: 60 },
];

const LIFF_ID = "2009052718-9rclRq3Z";

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('MENU');
  const [, setAdminClickCount] = useState(0);
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
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (data) {
      setProfile(data);
      if (data.line_user_id) {
        setIsLinked(true);
      }
    }
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
      alert('ログインメールを送信しました！');
    } catch (err) {
      alert('エラーが発生しました。');
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
        liff.login({ redirectUri: window.location.href });
        return;
      }
      const profileData = await liff.getProfile();
      const lineUserId = profileData.userId;

      await supabase.from('reservations').update({ line_user_id: lineUserId }).eq('id', lastReservationId);
      if (session) {
        await supabase.from('profiles').update({ line_user_id: lineUserId }).eq('id', session.user.id);
      }

      setIsLinked(true);
      alert("LINE連携が完了しました！");
    } catch (err) {
      alert("連携に失敗しました。");
    } finally {
      setIsLinking(false);
    }
  };

  const handleFormSubmit = async (formData: { name: string; email: string; phone: string }) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: existing } = await supabase.from('reservations')
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

      if (session) {
        await supabase.from('profiles').update({ name: formData.name, phone: formData.phone }).eq('id', session.user.id);
      }

      if (inserted && inserted.length > 0) setLastReservationId(inserted[0].id);
      setData({ ...data, ...formData });
      if (profile?.line_user_id) setIsLinked(true);
      nextStep('COMPLETE');
    } catch (err) {
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
              setStep('MENU');
              setAdminClickCount(prev => (prev + 1 >= 5 ? (setStep('ADMIN'), 0) : prev + 1));
            }}
          />
          <div style={{ width: '100px', display: 'flex', justifyContent: 'flex-end' }}>
            {session ? (
              <button
                onClick={() => nextStep('MYPAGE')}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: '1px solid #ddd',
                  backgroundColor: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                }}
                title="マイページ"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </button>
            ) : (
              <button
                onClick={() => nextStep('AUTH')}
                style={{ padding: '8px 20px', fontSize: '12px', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '20px', cursor: 'pointer', color: '#555', fontWeight: 'bold' }}
              >
                ログイン
              </button>
            )}
          </div>
        </div>
      </header>

      <main style={{ paddingBottom: '100px' }}>
        {step === 'MENU' && (
          <div className="card">
            {!session && (
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', border: '1px solid #eee' }}>
                💡 ログインするとスムーズに予約できます
                <button onClick={() => nextStep('AUTH')} style={{ color: 'var(--piste-green)', border: 'none', background: 'none', fontWeight: 'bold', marginLeft: '5px' }}>ログインへ</button>
              </div>
            )}
            <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>メニューを選択</h2>
            <select
              className="card" style={{ width: '100%', padding: '15px', fontSize: '16px' }}
              value={data.menu} onChange={(e) => setData({ ...data, menu: e.target.value })}
            >
              <option value="" disabled>メニューを選択...</option>
              {MENUS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} disabled={!data.menu} onClick={() => nextStep('DATE')}>次へ</button>
          </div>
        )}

        {step === 'AUTH' && (
          <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>ログイン</h2>
            <p style={{ fontSize: '13px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>メールアドレスを入力してください。</p>
            <form onSubmit={handleLogin}>
              <input
                type="email" required placeholder="example@piste.com" className="card"
                style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
                value={authEmail} onChange={(e) => setAuthEmail(e.target.value)}
              />
              <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={authLoading}>送信</button>
            </form>
            <button className="btn-secondary" style={{ width: '100%', marginTop: '10px' }} onClick={() => nextStep('MENU')}>戻る</button>
          </div>
        )}

        {step === 'MYPAGE' && (
          <MyPage
            onBack={() => {
              if (session) fetchProfile(session.user.id);
              nextStep('MENU');
            }}
            userEmail={session?.user.email || ''}
          />
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
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>予約完了！</h2>
            {!isLinked && (
              <button
                className="btn-primary"
                style={{ backgroundColor: '#06C755', marginTop: '20px' }}
                onClick={handleLineLinking}
                disabled={isLinking}
              >
                {isLinking ? '連携中...' : 'LINE連携する'}
              </button>
            )}
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => nextStep('MENU')}>トップへ</button>
          </div>
        )}

        {step === 'ADMIN' && <AdminDashboard />}
      </main>
      <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default App;
