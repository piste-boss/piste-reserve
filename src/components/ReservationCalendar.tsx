import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    onSelect: (date: string) => void;
    onBack?: () => void;
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

    const [holidays, setHolidays] = useState<string[]>([]);

    useEffect(() => {
        const fetchHolidays = async () => {
            const { data } = await supabase.from('holidays').select('date');
            if (data) {
                setHolidays(data.map(d => d.date));
            }
        };
        fetchHolidays();
    }, []);

    // Padding for start of month
    for (let i = 0; i < firstDay; i++) {
        days.push(<div key={`pad-${i}`} style={{ padding: '10px' }}></div>);
    }

    // Days of the month
    for (let d = 1; d <= totalDays; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;

        const isHoliday = dayOfWeek === 0 || dayOfWeek === 1 || holidays.includes(dateStr); // Sun, Mon or Custom Holiday

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPast = date < today;
        const isDisabled = isHoliday || isPast;

        days.push(
            <button
                key={d}
                disabled={isDisabled}
                style={{
                    padding: '10px',
                    borderRadius: '50%',
                    backgroundColor: isDisabled ? '#f3f4f6' : 'white',
                    color: isDisabled ? '#cbd5e0' : 'var(--piste-text-main)',
                    border: '1px solid transparent',
                    cursor: isDisabled ? 'default' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    aspectRatio: '1/1'
                }}
                onClick={() => {
                    if (!isDisabled) {
                        onSelect(dateStr);
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

            {onBack && (
                <button className="btn-primary" style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }} onClick={onBack}>
                    戻る
                </button>
            )}
        </div>
    );
};

export default ReservationCalendar;
