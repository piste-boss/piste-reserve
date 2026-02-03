import React, { useState } from 'react';

interface Props {
    onSelect: (date: string) => void;
    onBack: () => void;
}

const ReservationCalendar: React.FC<Props> = ({ onSelect, onBack }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const startDay = (year: number, month: number) => new Date(year, month, 1).getDay();

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const days = [];
    const totalDays = daysInMonth(year, month);
    const firstDay = startDay(year, month);

    // Padding for start of month
    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`pad-${i}`} style={{ padding: '10px' }}></div>);
    }

    // Days of the month
    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        const isHoliday = dayOfWeek === 0 || dayOfWeek === 1; // Sun, Mon

        // In actual app, we would check for Japanese holidays here

        days.push(
            <button
                key={d}
                disabled={isHoliday || date < new Date()}
                style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: isHoliday ? '#f3f4f6' : 'white',
                    color: isHoliday ? '#cbd5e0' : 'var(--piste-text-main)',
                    border: '1px solid transparent',
                    cursor: isHoliday ? 'default' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    aspectRatio: '1/1'
                }}
                onClick={() => {
                    if (!isHoliday) {
                        onSelect(`${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`);
                    }
                }}
            >
                {d}
            </button>
        );
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>&lt;</button>
                <div style={{ fontWeight: 'bold' }}>{year}年 {month + 1}月</div>
                <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>&gt;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', textAlign: 'center', marginBottom: '20px' }}>
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                    <div key={d} style={{ fontSize: '12px', color: i === 0 ? 'red' : i === 1 ? '#718096' : '#718096' }}>{d}</div>
                ))}
                {days}
            </div>

            <div style={{ fontSize: '12px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>
                ※日は全休、月は不定休（デフォルトは休み設定）です。
            </div>

            <button className="btn-primary" style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }} onClick={onBack}>
                戻る
            </button>
        </div>
    );
};

export default ReservationCalendar;
