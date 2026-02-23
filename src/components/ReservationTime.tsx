import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    date: string;
    onSelect: (time: string) => void;
    onBack: () => void;
    duration?: number;
    timeSlot: string; // "09" 形式の開始時 hour
}

const generateTimesForSlot = (slotStartHour: string) => {
    const startH = parseInt(slotStartHour, 10);
    const startMins = startH * 60;
    const endMins = startMins + 60;
    const times = [];
    for (let mins = startMins; mins < endMins; mins += 20) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        times.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
    return times;
};

const ReservationTime: React.FC<Props> = ({ date, onSelect, onBack, duration = 20, timeSlot }) => {
    const [bookedRanges, setBookedRanges] = useState<{ start: string, end: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchBookedTimes = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('reservations')
                    .select('reservation_time, reservation_end_time')
                    .eq('reservation_date', date)
                    .or('status.is.null,status.neq.cancelled');

                if (error) {
                    console.error("Fetch Error:", error);
                    const { data: fallbackData } = await supabase
                        .from('reservations')
                        .select('reservation_time')
                        .eq('reservation_date', date)
                        .or('status.is.null,status.neq.cancelled');
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

    const times = generateTimesForSlot(timeSlot);
    const startH = parseInt(timeSlot, 10);
    const slotLabel = `${startH}:00〜${startH + 1}:00`;

    const availableTimes = times.filter(t => {
        const [h, m] = t.split(':').map(Number);
        const slotMinutes = h * 60 + m;

        if (isToday && slotMinutes < currentMinutes) return false;

        const slotEndMins = slotMinutes + (duration || 20);
        const slotEnd = `${Math.floor(slotEndMins / 60).toString().padStart(2, '0')}:${(slotEndMins % 60).toString().padStart(2, '0')}`;

        const isBooked = bookedRanges.some(range => {
            if (!range.start) return false;
            const existingStart = range.start.substring(0, 5);
            const existingEnd = range.end.substring(0, 5);
            return (t < existingEnd && slotEnd > existingStart);
        });

        return !isBooked;
    });

    return (
        <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>{slotLabel} の空き時間</h2>
            <p style={{ fontSize: '14px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>選択日: {date}</p>

            {loading ? (
                <p style={{ textAlign: 'center', color: 'var(--piste-text-muted)' }}>読み込み中...</p>
            ) : availableTimes.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#ef4444', marginBottom: '20px', fontSize: '15px' }}>
                    この時間帯に空きはありません
                </p>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    {availableTimes.map(t => (
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
                                color: 'var(--piste-dark-blue)',
                                backgroundColor: 'white',
                                cursor: 'pointer',
                            }}
                            onClick={() => onSelect(t)}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            )}

            <button className="btn-primary" style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }} onClick={onBack}>
                戻る
            </button>
        </div>
    );
};

export default ReservationTime;
