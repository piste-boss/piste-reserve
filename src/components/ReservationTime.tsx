import React from 'react';

interface Props {
    date: string;
    onSelect: (time: string) => void;
    onBack: () => void;
}

const generateTimes = () => {
    const times = [];
    // Morning: 09:30 - 12:30
    let mHour = 9, mMin = 30;
    while (mHour < 12 || (mHour === 12 && mMin <= 30)) {
        times.push(`${mHour.toString().padStart(2, '0')}:${mMin.toString().padStart(2, '0')}`);
        mMin += 20; if (mMin >= 60) { mHour++; mMin -= 60; }
    }
    // Afternoon: 13:00 - 20:40
    let aHour = 13, aMin = 0;
    while (aHour < 21) {
        times.push(`${aHour.toString().padStart(2, '0')}:${aMin.toString().padStart(2, '0')}`);
        aMin += 20; if (aMin >= 60) { aHour++; aMin -= 60; }
    }
    return times;
};

const TIMES = generateTimes();

const ReservationTime: React.FC<Props> = ({ date, onSelect, onBack }) => {
    return (
        <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>予約時間を選択</h2>
            <p style={{ fontSize: '14px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>選択日: {date}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
                {TIMES.map(t => (
                    <button
                        key={t}
                        className="card"
                        style={{
                            margin: 0,
                            padding: '15px',
                            textAlign: 'center',
                            border: '1px solid #eee',
                            fontSize: '16px',
                            fontWeight: '600',
                            color: 'var(--piste-dark-blue)'
                        }}
                        onClick={() => onSelect(t)}
                    >
                        {t}
                    </button>
                ))}
            </div>

            <button className="btn-primary" style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }} onClick={onBack}>
                戻る
            </button>
        </div>
    );
};

export default ReservationTime;
