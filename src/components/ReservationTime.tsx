import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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
    const [bookedRanges, setBookedRanges] = useState<{ start: string, end: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBookedTimes = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('reservations')
                    .select('reservation_time, reservation_end_time')
                    .eq('reservation_date', date);

                if (error) {
                    console.error("Fetch Error:", error);
                    // 列がないなどのエラー時は、古い形式で再試行（バックアップ）
                    const { data: fallbackData } = await supabase
                        .from('reservations')
                        .select('reservation_time')
                        .eq('reservation_date', date);
                    if (fallbackData) {
                        setBookedRanges(fallbackData.map(r => ({ start: r.reservation_time.substring(0, 5), end: r.reservation_time.substring(0, 5) })));
                    }
                } else if (data) {
                    setBookedRanges(data.map(r => ({
                        start: r.reservation_time?.substring(0, 5) || "",
                        end: (r.reservation_end_time || r.reservation_time)?.substring(0, 5) || ""
                    })));
                }
            } catch (e) {
                console.error("Connection Error:", e);
            }
            setLoading(false);
        };

        fetchBookedTimes();
    }, [date]);

    const now = new Date();
    const isToday = date === now.toLocaleDateString('sv-SE');
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    return (
        <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>予約時間を選択</h2>
            <p style={{ fontSize: '14px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>選択日: {date}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
                {TIMES.map(t => {
                    const [h, m] = t.split(':').map(Number);
                    const slotMinutes = h * 60 + m;
                    const isPast = isToday && slotMinutes < currentMinutes;

                    const isBooked = bookedRanges.some(range => {
                        if (!range.start) return false;

                        const slotTime = t.substring(0, 5);
                        const start = range.start.substring(0, 5);
                        const end = range.end.substring(0, 5);

                        if (start === end) {
                            return slotTime === start;
                        }
                        return slotTime >= start && slotTime < end;
                    });

                    const isDisabled = isBooked || isPast || loading;

                    return (
                        <button
                            key={t}
                            className="card"
                            disabled={isDisabled}
                            style={{
                                margin: 0,
                                padding: '15px',
                                textAlign: 'center',
                                border: '1px solid #eee',
                                fontSize: '16px',
                                fontWeight: '600',
                                color: isBooked ? '#ef4444' : (isPast ? '#cbd5e0' : 'var(--piste-dark-blue)'),
                                backgroundColor: isBooked ? '#fee2e2' : (isPast ? '#f3f4f6' : 'white'),
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                opacity: isDisabled ? 1 : 1
                            }}
                            onClick={() => !isDisabled && onSelect(t)}
                        >
                            {t} {isBooked ? '×' : (isPast ? '-' : '')}
                        </button>
                    );
                })}
            </div>

            <button className="btn-primary" style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }} onClick={onBack}>
                戻る
            </button>
        </div>
    );
};

export default ReservationTime;
