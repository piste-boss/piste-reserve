import React from 'react';

interface Props {
    date: string;
    onSelect: (time: string) => void;
    onBack: () => void;
}

const TIMES = [
    '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

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
