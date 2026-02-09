import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const HolidayManager: React.FC = () => {
    const [holidays, setHolidays] = useState<string[]>([]);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const startDay = (y: number, m: number) => new Date(y, m, 1).getDay();

    const fetchHolidays = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('holidays')
            .select('date');

        if (error) {
            console.error('Error fetching holidays:', error);
        } else if (data) {
            setHolidays(data.map(d => d.date));
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchHolidays();
    }, []);

    const toggleHoliday = async (dateStr: string) => {
        const isHoliday = holidays.includes(dateStr);
        let newHolidays = [...holidays];

        if (isHoliday) {
            // Remove holiday
            const { error } = await supabase.from('holidays').delete().eq('date', dateStr);
            if (!error) {
                newHolidays = newHolidays.filter(d => d !== dateStr);
            }
        } else {
            // Add holiday
            const { error } = await supabase.from('holidays').insert([{ date: dateStr }]);
            if (!error) {
                newHolidays.push(dateStr);
            }
        }
        setHolidays(newHolidays);
    };

    const renderCalendar = () => {
        const days = [];
        const totalDays = daysInMonth(year, month);
        const firstDay = startDay(year, month);

        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`pad-${i}`} style={{ padding: '10px' }}></div>);
        }

        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const isHoliday = holidays.includes(dateStr);
            const isWeekend = new Date(year, month, d).getDay() === 0 || new Date(year, month, d).getDay() === 1; // Sun, Mon default closed?

            days.push(
                <button
                    key={d}
                    onClick={() => toggleHoliday(dateStr)}
                    style={{
                        padding: '5px',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: isHoliday ? '#ef4444' : (isWeekend ? '#fee2e2' : 'white'),
                        color: isHoliday ? 'white' : (isWeekend ? '#c53030' : 'var(--piste-text-main)'),
                        border: isHoliday ? 'none' : '1px solid #ddd',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto',
                        transition: 'all 0.2s'
                    }}
                >
                    {d}
                </button>
            );
        }
        return days;
    };

    return (
        <div className="card" style={{ maxWidth: '400px' }}>
            <h3>休日設定</h3>
            <p style={{ fontSize: '11px', color: '#666', marginBottom: '10px' }}>
                クリックで休日（赤）を設定・解除<br />
                <span style={{ color: '#c53030' }}>薄い赤</span>は定休日（日・月）
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>&lt;</button>
                <div style={{ fontWeight: 'bold' }}>{year}年 {month + 1}月</div>
                <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>&gt;</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
                {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                    <div key={d} style={{ fontSize: '11px', color: i === 0 ? 'red' : '#718096', marginBottom: '5px' }}>{d}</div>
                ))}
                {loading ? <div style={{ gridColumn: '1 / -1', padding: '20px' }}>読み込み中...</div> : renderCalendar()}
            </div>
        </div>
    );
};

export default HolidayManager;
