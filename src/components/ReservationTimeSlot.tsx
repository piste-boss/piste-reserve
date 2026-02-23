import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    date: string;
    duration: number;
    onSelect: (slotStartHour: string) => void;
    onBack: () => void;
}

const TIME_SLOTS = [
    { start: 9, label: '9:00 〜 10:00' },
    { start: 10, label: '10:00 〜 11:00' },
    { start: 11, label: '11:00 〜 12:00' },
    { start: 12, label: '12:00 〜 13:00' },
    { start: 13, label: '13:00 〜 14:00' },
    { start: 14, label: '14:00 〜 15:00' },
    { start: 15, label: '15:00 〜 16:00' },
    { start: 16, label: '16:00 〜 17:00' },
    { start: 17, label: '17:00 〜 18:00' },
    { start: 18, label: '18:00 〜 19:00' },
    { start: 19, label: '19:00 〜 20:00' },
];

const ReservationTimeSlot: React.FC<Props> = ({ date, duration, onSelect, onBack }) => {
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

    const isSlotFull = (startHour: number): boolean => {
        const slotTimes: string[] = [];
        const startMins = startHour * 60;
        for (let mins = startMins; mins < startMins + 60; mins += 20) {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            slotTimes.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        }

        const availableCount = slotTimes.filter(t => {
            const [h, m] = t.split(':').map(Number);
            const slotMinutes = h * 60 + m;

            if (isToday && slotMinutes < currentMinutes) return false;

            const slotEndMins = slotMinutes + (duration || 30);
            const slotEnd = `${Math.floor(slotEndMins / 60).toString().padStart(2, '0')}:${(slotEndMins % 60).toString().padStart(2, '0')}`;

            const isBooked = bookedRanges.some(range => {
                if (!range.start) return false;
                const existingStart = range.start.substring(0, 5);
                const existingEnd = range.end.substring(0, 5);
                return (t < existingEnd && slotEnd > existingStart);
            });

            return !isBooked;
        }).length;

        return availableCount === 0;
    };

    return (
        <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>ご希望の時間帯を選択</h2>
            <p style={{ fontSize: '14px', color: 'var(--piste-text-muted)', marginBottom: '20px' }}>選択日: {date}</p>

            {loading ? (
                <p style={{ textAlign: 'center', color: 'var(--piste-text-muted)' }}>読み込み中...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                    {TIME_SLOTS.map(slot => {
                        const isFull = isSlotFull(slot.start);
                        const isPastSlot = isToday && (slot.start + 1) * 60 <= currentMinutes;

                        return (
                            <button
                                key={slot.start}
                                className="card"
                                disabled={isFull || isPastSlot}
                                style={{
                                    margin: 0,
                                    padding: '18px',
                                    textAlign: 'center',
                                    border: '1px solid #eee',
                                    fontSize: '16px',
                                    fontWeight: '600',
                                    color: (isFull || isPastSlot) ? '#9ca3af' : 'var(--piste-dark-blue)',
                                    backgroundColor: (isFull || isPastSlot) ? '#f3f4f6' : 'white',
                                    cursor: (isFull || isPastSlot) ? 'not-allowed' : 'pointer',
                                }}
                                onClick={() => !(isFull || isPastSlot) && onSelect(slot.start.toString().padStart(2, '0'))}
                            >
                                {slot.label}
                                {isFull && !isPastSlot && (
                                    <span style={{ display: 'block', fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                                        ご希望の時間帯は満枠です。
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            <button
                className="btn-primary"
                style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }}
                onClick={onBack}
            >
                戻る
            </button>
        </div>
    );
};

export default ReservationTimeSlot;
