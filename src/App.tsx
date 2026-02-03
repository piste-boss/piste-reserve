import React, { useState } from 'react';
import ReservationCalendar from './components/ReservationCalendar';
import ReservationTime from './components/ReservationTime';
import ReservationForm from './components/ReservationForm';

type Step = 'MENU' | 'DATE' | 'TIME' | 'FORM' | 'COMPLETE';

interface ReservationData {
  menu: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  email: string;
}

import logo from './assets/logo.png';

const MENUS = [
  { id: 'personal-20', label: 'パーソナルトレーニング', duration: 20 },
  { id: 'trial-60', label: '無料体験', duration: 60 },
  { id: 'entry-30', label: '入会手続き', duration: 30 },
  { id: 'online-30', label: 'オンラインパーソナル', duration: 30 },
  { id: 'first-60', label: '初回パーソナル', duration: 60 },
];

const App: React.FC = () => {
  const [step, setStep] = useState<Step>('MENU');
  const [data, setData] = useState<ReservationData>({
    menu: '',
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

  const handleFormSubmit = (formData: { name: string; email: string; phone: string }) => {
    setData({ ...data, ...formData });
    nextStep('COMPLETE');
  };

  return (
    <div className="container">
      <header style={{ textAlign: 'center', padding: '30px 0' }}>
        <img src={logo} alt="Piste Logo" style={{ height: '80px', marginBottom: '10px' }} />
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
          />
        )}

        {step === 'COMPLETE' && (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
            <h2 style={{ marginBottom: '10px' }}>予約が完了しました！</h2>
            <p style={{ color: 'var(--piste-text-muted)', fontSize: '14px', marginBottom: '30px' }}>
              ご入力いただいたメールアドレスに確認メールを送信しました。
            </p>
            <div className="card" style={{ textAlign: 'left', fontSize: '14px', background: '#f8f9fa' }}>
              <div style={{ marginBottom: '5px' }}><strong>メニュー:</strong> {MENUS.find(m => m.id === data.menu)?.label}</div>
              <div style={{ marginBottom: '5px' }}><strong>日付:</strong> {data.date}</div>
              <div><strong>時間:</strong> {data.time}</div>
            </div>
            <button className="btn-primary" style={{ width: '100%', marginTop: '20px' }} onClick={() => {
              setData({ menu: '', date: '', time: '', name: '', phone: '', email: '' });
              setStep('MENU');
            }}>
              トップに戻る
            </button>
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
        >
          <div style={{ width: '10px', height: '10px', backgroundColor: '#4ade80', borderRadius: '50%' }}></div>
          <span style={{ fontSize: '14px', fontWeight: '600' }}>AIコンシェルジュに相談</span>
        </div>
      </div>
    </div>
  );
};

export default App;
