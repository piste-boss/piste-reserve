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

// MENUS constant removed in favor of dynamic fetching


const LIFF_ID = "2009052718-9rclRq3Z";

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('MENU');
  const [, setAdminClickCount] = useState(0);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Dynamic Menus State
  const [menus, setMenus] = useState<{ id: string, label: string, duration: number }[]>([
    { id: 'personal-20', label: 'パーソナルトレーニング', duration: 20 },
    { id: 'trial-60', label: '無料体験', duration: 60 },
    { id: 'entry-30', label: '入会手続き', duration: 30 },
    { id: 'online-30', label: 'オンライン', duration: 30 },
    { id: 'first-60', label: '初回パーソナル', duration: 60 },
  ]);

  useEffect(() => {
    const fetchMenus = async () => {
      const { data } = await supabase.from('menus').select('*').order('created_at');
      if (data && data.length > 0) {
        setMenus(data);
      }
    };
    fetchMenus();
  }, []);

  const [isLinking, setIsLinking] = useState(false);
  const [isLinked, setIsLinked] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ name?: string, phone?: string, email?: string, line_user_id?: string } | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authName, setAuthName] = useState('');
  const [authPhone, setAuthPhone] = useState('');
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
    let { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    // 初回ログイン時（プロファイル未作成）かつローカルストレージに情報がある場合
    if (!data) {
      const tempAuthData = localStorage.getItem('tempAuthData');
      if (tempAuthData) {
        try {
          const { name, phone, email } = JSON.parse(tempAuthData);
          if (name && phone) {
            const { data: newProfile, error } = await supabase
              .from('profiles')
              .insert([{ id: userId, name, phone, email }])
              .select()
              .single();

            if (!error && newProfile) {
              data = newProfile;
              localStorage.removeItem('tempAuthData'); // 完了したら削除
            }
          }
        } catch (e) {
          console.error("Profile creation error", e);
        }
      }
    }

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
      // 一時的にローカルストレージに保存（ログイン後にプロフィール作成するため）
      localStorage.setItem('tempAuthData', JSON.stringify({
        name: authName,
        phone: authPhone,
        email: authEmail
      }));

      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) throw error;
      alert('ログインメールを送信しました！');
    } catch (err) {
      console.error(err);
      alert('エラーが発生しました。');
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profileData = await liff.getProfile();
          const lineUserId = profileData.userId;

          // リダイレクト後に保留中の連携があれば実行
          const pendingReservationId = localStorage.getItem('pendingLineLinkReservationId');
          if (pendingReservationId) {
            await supabase.from('reservations').update({ line_user_id: lineUserId }).eq('id', pendingReservationId);
            localStorage.removeItem('pendingLineLinkReservationId');
            setIsLinked(true);
            alert("LINE連携が完了しました！");
          }

          // プロフィールにLINE IDがなければ更新
          if (session && profile && !profile.line_user_id) {
            await supabase.from('profiles').update({ line_user_id: lineUserId }).eq('id', session.user.id);
            setProfile(prev => prev ? { ...prev, line_user_id: lineUserId } : null);
            setIsLinked(true);
          }
        }
      } catch (err) {
        console.error("LIFF init error", err);
      }
    };
    initLiff();
  }, [session, profile]);

  const handleLineLinking = async () => {
    if (!lastReservationId) return;
    setIsLinking(true);
    try {
      if (!liff.isLoggedIn()) {
        // リダイレクト前に予約IDを保存
        localStorage.setItem('pendingLineLinkReservationId', lastReservationId);
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

      const selectedMenu = menus.find(m => m.id === data.menu);
      const duration = selectedMenu?.duration || 30;

      const [hours, minutes] = data.time.split(':').map(Number);
      const startDate = new Date();
      startDate.setHours(hours, minutes, 0);
      const endDate = new Date(startDate.getTime() + duration * 60000);
      const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

      const reservation = {
        ...formData,
        reservation_date: data.date,
        reservation_time: data.time,
        reservation_end_time: endTime,
        menu_id: data.menu,
        source: 'web',
        user_id: session?.user.id,
        line_user_id: profile?.line_user_id || (liff.isLoggedIn() ? liff.getContext()?.userId : null)
      };

      const { data: inserted, error } = await supabase.from('reservations').insert([reservation]).select();
      if (error) throw error;

      if (session) {
        await supabase.from('profiles').update({ name: formData.name, phone: formData.phone }).eq('id', session.user.id);
      }

      if (inserted && inserted.length > 0) setLastReservationId(inserted[0].id);
      setData({ ...data, ...formData });
      if (profile?.line_user_id || (liff.isLoggedIn() && liff.getContext()?.userId)) setIsLinked(true);
      nextStep('COMPLETE');
    } catch (err) {
      alert('エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'ADMIN') {
    return <AdminDashboard />;
  }

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
            <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>ご希望のご予約メニューを選択してください</h2>
            <select
              className="card" style={{ width: '100%', padding: '15px', fontSize: '16px' }}
              value={data.menu} onChange={(e) => setData({ ...data, menu: e.target.value })}
            >
              <option value="" disabled>メニューを選択...</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} disabled={!data.menu} onClick={() => nextStep('DATE')}>次へ</button>
          </div>
        )}

        {step === 'AUTH' && (
          <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>ログイン</h2>
            <p style={{ fontSize: '13px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>情報を入力してください。</p>
            <form onSubmit={handleLogin}>
              <input
                type="text" required placeholder="お名前" className="card"
                style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
                value={authName} onChange={(e) => setAuthName(e.target.value)}
              />
              <input
                type="tel" required placeholder="電話番号" className="card"
                style={{ width: '100%', padding: '12px', marginBottom: '15px' }}
                value={authPhone} onChange={(e) => setAuthPhone(e.target.value)}
              />
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
        {step === 'TIME' && (
          <ReservationTime
            date={data.date}
            duration={menus.find(m => m.id === data.menu)?.duration || 30}
            onSelect={(time) => { setData({ ...data, time }); nextStep('FORM'); }}
            onBack={() => nextStep('DATE')}
          />
        )}
        {step === 'FORM' && (
          <ReservationForm
            initialData={profile ? { name: profile.name || '', phone: profile.phone || '', email: session?.user.email || '' } : undefined}
            onSubmit={handleFormSubmit} onBack={() => nextStep('TIME')} isSubmitting={isSubmitting}
          />
        )}

        {step === 'COMPLETE' && (
          <div className="card" style={{ textAlign: 'center' }}>
            <h2>予約が完了しました。</h2>

            <div style={{ margin: '20px 0', padding: '15px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'left' }}>
              <h3 style={{ fontSize: '15px', color: '#166534', marginBottom: '8px', fontWeight: 'bold' }}>🔔 LINE通知を受け取るには</h3>
              <p style={{ fontSize: '14px', color: '#15803d', lineHeight: '1.6' }}>
                予約完了やリマインドの通知を受け取るには、Piste公式アカウントの<strong>友だち追加</strong>が必要です。<br />
                まだの方は、以下のボタンから追加をお願いします。
              </p>
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <a
                  href="https://line.me/R/ti/p/@hiy2187j"
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-block',
                    backgroundColor: '#06C755',
                    color: 'white',
                    padding: '10px 20px',
                    borderRadius: '20px',
                    textDecoration: 'none',
                    fontWeight: 'bold',
                    fontSize: '14px'
                  }}
                >
                  友だち追加する
                </a>
              </div>
            </div>

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


      </main>
      <button
        onClick={() => setIsChatOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          padding: '12px 24px',
          borderRadius: '30px',
          backgroundColor: 'var(--piste-dark-blue)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: 'bold',
          transition: 'all 0.3s ease'
        }}
        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
      >
        <div style={{ width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%' }}></div>
        デコピン（AI）に予約相談する
      </button>
      <AIChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        lineUserId={profile?.line_user_id}
        userContext={profile ? {
          id: session?.user.id,
          name: profile.name,
          email: session?.user.email,
          phone: profile.phone
        } : null}
      />
    </div>
  );
};

export default App;
