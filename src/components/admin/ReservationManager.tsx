import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ReservationManagerProps {
    menus: any[];
}

const ReservationManager: React.FC<ReservationManagerProps> = ({ menus }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [viewDate, setViewDate] = useState(new Date()); // For calendar month view
    const [reservations, setReservations] = useState<any[]>([]);
    const [dayReservations, setDayReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    // Edit/Create State
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>({});
    const [deleteTarget, setDeleteTarget] = useState<any>(null);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const startDay = (y: number, m: number) => new Date(y, m, 1).getDay();

    const formatDate = (d: Date) => {
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    };

    const fetchReservations = async () => {
        setLoading(true);
        // Fetch all reservations (or optimize to fetch by month range if needed in future)
        // For now, fetching all to show indicators on calendar easily
        const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .order('reservation_time', { ascending: true });

        if (!error && data) {
            setReservations(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchReservations();

        const subscription = supabase
            .channel('reservations_manager_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
                fetchReservations();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    // Filter reservations when selectedDate or reservations change
    useEffect(() => {
        const dateStr = formatDate(selectedDate);
        const filtered = reservations.filter(r => r.reservation_date === dateStr);
        setDayReservations(filtered);
    }, [selectedDate, reservations]);

    const handleDateClick = (d: number) => {
        const newDate = new Date(year, month, d);
        setSelectedDate(newDate);
    };

    // CRUD Operations
    const confirmDelete = (reservation: any) => {
        setDeleteTarget(reservation);
    };

    const executeDelete = async () => {
        if (!deleteTarget) return;
        setLoading(true);
        const { error } = await supabase.from('reservations').delete().eq('id', deleteTarget.id);
        if (error) alert('削除に失敗しました: ' + error.message);
        else fetchReservations();
        setDeleteTarget(null);
        setLoading(false);
    };

    const handleSaveReservation = async () => {
        const { error } = await supabase.from('reservations').update({
            reservation_date: editForm.reservation_date,
            reservation_time: editForm.reservation_time,
            name: editForm.name,
            name_kana: editForm.name_kana,
            phone: editForm.phone,
            email: editForm.email,
            menu_id: editForm.menu_id
        }).eq('id', editForm.id);

        if (error) {
            alert('更新失敗: ' + error.message);
        } else {
            setIsEditing(false);
            setEditForm({});
            fetchReservations();
        }
    };

    const handleRegister = async () => {
        const { error } = await supabase.from('reservations').insert([{
            reservation_date: editForm.reservation_date,
            reservation_time: editForm.reservation_time,
            name: editForm.name,
            name_kana: editForm.name_kana,
            phone: editForm.phone,
            email: editForm.email,
            menu_id: editForm.menu_id,
            source: 'admin'
        }]);

        if (error) alert('登録失敗: ' + error.message);
        else {
            setIsEditing(false);
            setEditForm({});
            fetchReservations();
        }
    };

    const openNewReservation = () => {
        setEditForm({
            reservation_date: formatDate(selectedDate),
            reservation_time: '10:00'
        });
        setIsEditing(true);
    };

    const renderCalendar = () => {
        const days = [];
        const totalDays = daysInMonth(year, month);
        const firstDay = startDay(year, month);

        // Padding for empty start days
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`pad-${i}`} style={{ padding: '10px' }}></div>);
        }

        for (let d = 1; d <= totalDays; d++) {
            const dateStr = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            const isSelected = formatDate(selectedDate) === dateStr;
            const hasReservation = reservations.some(r => r.reservation_date === dateStr);
            const isToday = formatDate(new Date()) === dateStr;

            days.push(
                <button
                    key={d}
                    onClick={() => handleDateClick(d)}
                    style={{
                        padding: '5px',
                        height: '40px',
                        width: '40px',
                        borderRadius: '50%',
                        backgroundColor: isSelected ? 'var(--piste-dark-blue)' : (isToday ? '#edf2f7' : 'white'),
                        color: isSelected ? 'white' : 'inherit',
                        border: isSelected ? 'none' : (hasReservation ? '2px solid var(--piste-green)' : '1px solid #eee'),
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: isSelected || isToday ? 'bold' : 'normal',
                        position: 'relative'
                    }}
                >
                    {d}
                    {hasReservation && !isSelected && (
                        <span style={{
                            position: 'absolute',
                            bottom: '2px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '4px',
                            height: '4px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--piste-green)'
                        }}></span>
                    )}
                </button>
            );
        }
        return days;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {deleteTarget && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{ background: 'white', padding: '20px', borderRadius: '8px', minWidth: '300px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                        <h4 style={{ marginTop: 0 }}>確認</h4>
                        <p>
                            <strong>{deleteTarget.reservation_date} {deleteTarget.reservation_time}</strong><br />
                            {deleteTarget.name} 様の予約を削除（キャンセル）しますか？
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <button onClick={() => setDeleteTarget(null)} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}>キャンセル</button>
                            <button onClick={executeDelete} style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#e53e3e', color: 'white', cursor: 'pointer' }}>削除する</button>
                        </div>
                    </div>
                </div>
            )}
            <div style={{ display: 'flex', gap: '20px', flexDirection: 'row', flexWrap: 'wrap' }}>
                {/* Calendar Section */}
                <div className="card" style={{ flex: '1', minWidth: '300px', maxWidth: '400px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <button onClick={() => setViewDate(new Date(year, month - 1, 1))}>&lt;</button>
                        <div style={{ fontWeight: 'bold' }}>{year}年 {month + 1}月</div>
                        <button onClick={() => setViewDate(new Date(year, month + 1, 1))}>&gt;</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '5px', textAlign: 'center' }}>
                        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                            <div key={d} style={{ fontSize: '12px', color: i === 0 ? 'red' : '#718096', marginBottom: '5px' }}>{d}</div>
                        ))}
                        {renderCalendar()}
                    </div>
                    <div style={{ marginTop: '15px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', width: '8px', height: '8px', background: 'var(--piste-green)', borderRadius: '50%', marginRight: '5px' }}></span>
                        予約あり
                    </div>
                </div>

                {/* List Section */}
                <div style={{ flex: '2', minWidth: '300px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <h3 style={{ margin: 0 }}>{formatDate(selectedDate)} の予約</h3>
                        <button className="btn-primary" onClick={openNewReservation} style={{ fontSize: '13px', padding: '8px 16px' }}>＋ 新規予約</button>
                    </div>

                    {isEditing && (
                        <div className="card" style={{ marginBottom: '20px', border: '2px solid var(--piste-dark-blue)' }}>
                            <h4 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                                {editForm.id ? '予約情報の変更' : '新規予約の登録'}
                            </h4>
                            <div className="grid-2-cols">
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>日付</span>
                                    <input type="date" value={editForm.reservation_date || ''} onChange={e => setEditForm({ ...editForm, reservation_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
                                </label>
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>時間</span>
                                    <input type="time" value={editForm.reservation_time || ''} onChange={e => setEditForm({ ...editForm, reservation_time: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
                                </label>
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>お名前</span>
                                    <input type="text" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
                                </label>
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>ヨミガナ</span>
                                    <input type="text" value={editForm.name_kana || ''} onChange={e => setEditForm({ ...editForm, name_kana: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
                                </label>
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>電話番号</span>
                                    <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
                                </label>
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>メールアドレス</span>
                                    <input type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
                                </label>
                                <label>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>メニュー</span>
                                    <select value={editForm.menu_id || ''} onChange={e => setEditForm({ ...editForm, menu_id: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}>
                                        <option value="">選択してください</option>
                                        {menus.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)} style={{ padding: '8px 16px', borderRadius: '4px', border: '1px solid #ddd', background: 'white' }}>キャンセル</button>
                                <button type="button" className="btn-primary" onClick={editForm.id ? handleSaveReservation : handleRegister}>保存する</button>
                            </div>
                        </div>
                    )}

                    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', whiteSpace: 'nowrap' }}>
                                <thead>
                                    <tr>
                                        <th>時間</th>
                                        <th>お名前</th>
                                        <th>メニュー</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dayReservations.length > 0 ? dayReservations.map(r => (
                                        <tr key={r.id}>
                                            <td style={{ fontWeight: 'bold', color: 'var(--piste-dark-blue)' }}>
                                                {r.reservation_time}
                                            </td>
                                            <td>{r.name}</td>
                                            <td>
                                                {menus.find(m => m.id === r.menu_id)?.label || r.menu_id}
                                            </td>

                                            <td>
                                                <div style={{ display: 'flex', gap: '5px' }}>
                                                    <button onClick={() => { setEditForm(r); setIsEditing(true); }} style={{ padding: '6px 10px', borderRadius: '4px', background: '#edf2f7', fontSize: '12px' }}>編集</button>
                                                    <button onClick={() => confirmDelete(r)} style={{ padding: '6px 10px', borderRadius: '4px', background: '#fee2e2', color: 'red', fontSize: '12px' }}>削除</button>
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#999' }}>この日の予約はありません</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReservationManager;
