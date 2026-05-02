import React, { useState, useEffect } from 'react';
import ReservationCalendar from './components/ReservationCalendar';
import ReservationTime from './components/ReservationTime';
import ReservationTimeSlot from './components/ReservationTimeSlot';
import ReservationForm from './components/ReservationForm';
import MyPage from './components/MyPage';
import logo from './assets/logo.png';
import AIChat from './components/AIChat';
import AdminDashboard from './components/AdminDashboard';
import { supabase } from './lib/supabase';
import liff from '@line/liff';
import type { Session } from '@supabase/supabase-js';

type Step = 'MENU' | 'DATE' | 'TIME_SLOT' | 'TIME' | 'FORM' | 'COMPLETE' | 'ADMIN' | 'AUTH' | 'MYPAGE';

interface ReservationData {
  menu: string;
  date: string;
  timeSlot: string;
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
    menu: '', date: '', timeSlot: '', time: '', name: '', phone: '', email: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastReservationId, setLastReservationId] = useState<string | null>(null);
  const [liffLineUserId, setLiffLineUserId] = useState<string | null>(null);
  const [changingReservationId, setChangingReservationId] = useState<string | null>(null);

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

    // プロファイル未作成 OR 存在するが名前・電話が空（トリガーが空で作成した場合）
    const profileNeedsUpdate = !data || (!data.name && !data.phone);

    if (profileNeedsUpdate) {
      const tempAuthData = localStorage.getItem('tempAuthData');
      if (tempAuthData) {
        try {
          const { name, phone, email } = JSON.parse(tempAuthData);
          if (name && phone) {
            if (!data) {
              // プロフィール行が存在しない → RPC で作成
              const { data: newProfile, error } = await supabase.rpc('create_profile_securely', {
                _id: userId, _name: name, _phone: phone, _email: email
              });
              if (!error && newProfile) {
                data = newProfile;
              } else {
                console.error("RPC create error:", error);
              }
            } else {
              // プロフィール行は存在するが空 → 直接更新（RLS許可済み）
              const { error } = await supabase
                .from('profiles')
                .update({ name, phone })
                .eq('id', userId);
              if (!error) {
                data = { ...data, name, phone };
              } else {
                console.error("Profile update error:", error);
              }
            }
            localStorage.removeItem('tempAuthData');
          }
        } catch (e) {
          console.error("Profile creation/update error", e);
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
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: authName, phone: authPhone }
        }
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

  // useEffect A: LIFF SDK初期化（マウント時1回のみ）
  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const profileData = await liff.getProfile();
          setLiffLineUserId(profileData.userId);

          // 保留中の予約へのLINE ID紐付け
          const pendingReservationId = localStorage.getItem('pendingLineLinkReservationId');
          if (pendingReservationId) {
            const { error } = await supabase.from('reservations')
              .update({ line_user_id: profileData.userId })
              .eq('id', pendingReservationId);
            localStorage.removeItem('pendingLineLinkReservationId');
            if (!error) {
              setIsLinked(true);
              alert("LINE連携が完了しました！");
            }
          }

          // MyPageからのリダイレクト後の処理
          const pendingMyPageLink = localStorage.getItem('pendingLineLinkFromMyPage');
          if (pendingMyPageLink) {
            localStorage.removeItem('pendingLineLinkFromMyPage');
            setStep('MYPAGE');
          }
        }
      } catch (err) {
        console.error("LIFF init error", err);
      }
    };
    initLiff();
  }, []);

  // useEffect B: プロフィールへのLINE ID同期（session, profile, liffLineUserIdが揃った時）
  useEffect(() => {
    if (!session || !profile || !liffLineUserId) return;
    if (profile.line_user_id) return;

    const syncLineId = async () => {
      try {
        const { error } = await supabase.rpc('update_profile_line_id', {
          _id: session.user.id,
          _line_user_id: liffLineUserId
        });
        if (error) {
          console.warn("RPC failed, trying direct update:", error);
          const { error: directError } = await supabase.from('profiles')
            .update({ line_user_id: liffLineUserId })
            .eq('id', session.user.id);
          if (directError) {
            console.error("Direct profile update also failed:", directError);
            return;
          }
        }
        setProfile(prev => prev ? { ...prev, line_user_id: liffLineUserId } : null);
        setIsLinked(true);
      } catch (err) {
        console.error("Profile LINE ID sync error:", err);
      }
    };
    syncLineId();
  }, [session, profile, liffLineUserId]);

  const handleLineLinking = async () => {
    if (!lastReservationId) return;
    setIsLinking(true);
    try {
      const lineUserId = liffLineUserId;
      if (!liff.isLoggedIn() || !lineUserId) {
        localStorage.setItem('pendingLineLinkReservationId', lastReservationId);
        liff.login({ redirectUri: window.location.href });
        return;
      }

      const { error: resError } = await supabase.from('reservations')
        .update({ line_user_id: lineUserId })
        .eq('id', lastReservationId);
      if (resError) throw new Error(`Reservation update failed: ${resError.message}`);

      if (session) {
        const { error: profError } = await supabase.rpc('update_profile_line_id', {
          _id: session.user.id,
          _line_user_id: lineUserId
        });
        if (profError) {
          console.warn("RPC failed, trying direct update:", profError);
          const { error: directError } = await supabase.from('profiles')
            .update({ line_user_id: lineUserId })
            .eq('id', session.user.id);
          if (directError) throw new Error(`Profile update failed: ${directError.message}`);
        }
        setProfile(prev => prev ? { ...prev, line_user_id: lineUserId } : null);
      }

      setIsLinked(true);
      alert("LINE連携が完了しました！");
    } catch (err: any) {
      console.error("LINE Linking Error:", err);
      alert(`連携に失敗しました。\n${err.message || JSON.stringify(err)}`);
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
        .neq('status', 'cancelled')
        .limit(1);

      if (existing && existing.length > 0) {
        setLastReservationId(existing[0].id);
        setData({ ...data, ...formData });
        nextStep('COMPLETE');
        return;
      }

      const selectedMenu = menus.find(m => m.id === data.menu);
      const duration = selectedMenu?.duration || 20;

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
        line_user_id: profile?.line_user_id || liffLineUserId || null
      };

      const { data: inserted, error } = await supabase.from('reservations').insert([reservation]).select();
      if (error) throw error;

      if (session) {
        await supabase.from('profiles').update({ name: formData.name, phone: formData.phone }).eq('id', session.user.id);
      }

      if (inserted && inserted.length > 0) setLastReservationId(inserted[0].id);

      // 予約変更の場合、旧予約をキャンセル
      if (changingReservationId) {
        await supabase
          .from('reservations')
          .update({ status: 'cancelled', cancel_reason: '予約変更のため' })
          .eq('id', changingReservationId);
        setChangingReservationId(null);
      }

      setData({ ...data, ...formData });
      if (profile?.line_user_id || liffLineUserId) setIsLinked(true);
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
            <div style={{ background: '#fff7ed', padding: '15px', borderRadius: '12px', marginBottom: '20px', fontSize: '14px', lineHeight: '1.7', border: '1px solid #fed7aa', color: '#9a3412', fontWeight: 'bold' }}>
              満枠のため新規会員募集は終了しました。再開予定はインスタグラムにて告知しますので、フォローしてお待ちください。
            </div>
            {!session && (
              <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px', marginBottom: '20px', fontSize: '13px', border: '1px solid #eee' }}>
                💡 ログインするとスムーズに予約できます
                <button onClick={() => nextStep('AUTH')} style={{ color: 'var(--piste-green)', border: 'none', background: 'none', fontWeight: 'bold', marginLeft: '5px' }}>ログインへ</button>
              </div>
            )}
            <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>ご希望の予約メニューを選択して下さい</h2>
            <select
              className="card" style={{ width: '100%', padding: '15px', fontSize: '16px' }}
              value={data.menu} onChange={(e) => setData({ ...data, menu: e.target.value })}
            >
              <option value="" disabled>メニューを選択...</option>
              {menus.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} disabled={!data.menu} onClick={() => nextStep('DATE')}>次へ</button>
            {session && (
              <p style={{ fontSize: '12px', color: '#e53e3e', fontWeight: 'bold', textAlign: 'center', marginTop: '15px' }}>
                ご予約の変更・キャンセルは<br />画面右上のマイページよりお願いします
              </p>
            )}
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
            onChangeReservation={(reservation) => {
              setChangingReservationId(reservation.id);
              setData({ ...data, menu: reservation.menu_id });
              nextStep('DATE');
            }}
          />
        )}
        {step === 'DATE' && <ReservationCalendar onSelect={(date) => { setData({ ...data, date, timeSlot: '' }); nextStep('TIME_SLOT'); }} onBack={() => nextStep('MENU')} />}
        {step === 'TIME_SLOT' && (
          <ReservationTimeSlot
            date={data.date}
            duration={menus.find(m => m.id === data.menu)?.duration || 20}
            onSelect={(slotStartHour) => { setData({ ...data, timeSlot: slotStartHour }); nextStep('TIME'); }}
            onBack={() => nextStep('DATE')}
          />
        )}
        {step === 'TIME' && (
          <ReservationTime
            date={data.date}
            duration={menus.find(m => m.id === data.menu)?.duration || 20}
            timeSlot={data.timeSlot}
            onSelect={(time) => { setData({ ...data, time }); nextStep('FORM'); }}
            onBack={() => nextStep('TIME_SLOT')}
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
