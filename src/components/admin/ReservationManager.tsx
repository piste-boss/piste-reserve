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
    const [customers, setCustomers] = useState<any[]>([]);
    const [suggestions, setSuggestions] = useState<any[]>([]);
    const [suggestionIndex, setSuggestionIndex] = useState(-1);
    const [isBulkEditing, setIsBulkEditing] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkConfirm, setBulkConfirm] = useState<{ name: string, count: number, reservations: any[] } | null>(null);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const startDay = (y: number, m: number) => new Date(y, m, 1).getDay();

    const formatDate = (d: Date) => {
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    };

    const fetchReservations = async () => {
        setLoading(true);
        // Fetch active reservations (for calendar display)
        const { data: resvData, error: resvError } = await supabase
            .from('reservations')
            .select('*')
            .or('status.is.null,status.neq.cancelled')
            .order('reservation_time', { ascending: true });

        if (!resvError && resvData) {
            setReservations(resvData);
        }

        // Fetch customers from dedicated customers table
        const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('name, name_kana, phone, email, user_id, line_user_id');
        if (customerError) {
            console.error('customers fetch error:', customerError);
        }
        setCustomers(customerData || []);

        setLoading(false);
    };

    const handleSearch = (val: string) => {
        if (!val) {
            setSuggestions([]);
            setSuggestionIndex(-1);
            return;
        }
        const filtered = customers.filter(c =>
            (c.name_kana || '').includes(val) ||
            (c.name || '').includes(val)
        ).slice(0, 5);
        setSuggestions(filtered);
        setSuggestionIndex(-1);
    };

    const selectSuggestion = (s: any) => {
        setEditForm({
            ...editForm,
            name: s.name,
            name_kana: s.name_kana,
            phone: s.phone,
            email: s.email,
            menu_id: s.menu_id || editForm.menu_id,
            _user_id: s.user_id || '',
            _line_user_id: s.line_user_id || ''
        });
        setSuggestions([]);
        setSuggestionIndex(-1);
    };

    const handleSuggestionKeyDown = (e: React.KeyboardEvent) => {
        if (suggestions.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestionIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestionIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (suggestionIndex >= 0 && suggestionIndex < suggestions.length) {
                selectSuggestion(suggestions[suggestionIndex]);
            }
        } else if (e.key === 'Escape') {
            setSuggestions([]);
            setSuggestionIndex(-1);
        }
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
        const { error } = await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', deleteTarget.id);
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

    const normalizePhone = (phone: string) => phone ? phone.replace(/[-\s\u3000]/g, '') : '';

    const lookupProfile = async (userId: string, email: string, phone: string): Promise<{ user_id: string; line_user_id: string } | null> => {
        const normalizedPhone = normalizePhone(phone);
        if (!userId && !email && !normalizedPhone) return null;
        const { data, error } = await supabase.rpc('lookup_profile_for_reservation', {
            _user_id: userId || null,
            _email: email || null,
            _phone: normalizedPhone || null
        });
        if (error) {
            console.warn('lookup_profile_for_reservation error:', error);
            return null;
        }
        return data && data.length > 0 ? data[0] : null;
    };

    const handleRegister = async () => {
        // 候補選択で直接取得済みならそれを使用、なければ RPC で検索
        let userId = editForm._user_id || null;
        let lineUserId = editForm._line_user_id || null;
        if (!userId || !lineUserId) {
            const profile = await lookupProfile(userId || '', editForm.email, editForm.phone);
            if (profile) {
                userId = userId || profile.user_id;
                lineUserId = lineUserId || profile.line_user_id;
            }
        }
        const { error } = await supabase.from('reservations').insert([{
            reservation_date: editForm.reservation_date,
            reservation_time: editForm.reservation_time,
            name: editForm.name,
            name_kana: editForm.name_kana,
            phone: editForm.phone,
            email: editForm.email,
            menu_id: editForm.menu_id,
            source: 'admin',
            ...(userId ? { user_id: userId } : {}),
            ...(lineUserId ? { line_user_id: lineUserId } : {})
        }]);

        if (error) alert('登録失敗: ' + error.message);
        else {
            setIsEditing(false);
            setEditForm({});
            fetchReservations();
        }
    };

    const handleBulkRegister = async () => {
        if (!bulkText.trim()) return;

        const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 1) return;

        let nameCandidate = '';
        let menuId = '';
        const dateTimes: { date: string, time: string }[] = [];

        // Identify menu first to exclude it from name candidates
        lines.forEach(line => {
            const foundMenu = menus.find(m => line.includes(m.label));
            if (foundMenu) menuId = foundMenu.id;
        });

        // Identify Date/Times and Name
        lines.forEach(line => {
            const dateMatch = line.match(/(\d+)月(\d+)日\s*(\d+)[:：](\d+)/);
            if (dateMatch) {
                const m = dateMatch[1].padStart(2, '0');
                const d = dateMatch[2].padStart(2, '0');
                const hh = dateMatch[3].padStart(2, '0');
                const mm = dateMatch[4].padStart(2, '0');
                const y = new Date().getFullYear();
                dateTimes.push({
                    date: `${y}-${m}-${d}`,
                    time: `${hh}:${mm}`
                });
            } else if (!menus.some(m => line.includes(m.label))) {
                // Not a menu and not a date -> likely a name
                if (!nameCandidate) {
                    nameCandidate = line.replace(/様$/, '');
                }
            }
        });

        if (!nameCandidate) {
            alert('お名前が見つかりませんでした');
            return;
        }

        if (!dateTimes.length) {
            alert('日付と時間が見つかりませんでした');
            return;
        }

        // Search for existing customer (match by name or katakana)
        const matchedCustomer = customers.find(c =>
            c.name === nameCandidate ||
            c.name_kana === nameCandidate ||
            (c.name_kana && nameCandidate.includes(c.name_kana)) ||
            (c.name && nameCandidate.includes(c.name))
        );

        const finalName = matchedCustomer ? matchedCustomer.name : nameCandidate;

        // RPC でプロファイルから user_id / line_user_id を取得
        const customerUserId = matchedCustomer?.user_id || '';
        const customerEmail = matchedCustomer?.email || '';
        const customerPhone = matchedCustomer?.phone || '';
        const profile = await lookupProfile(customerUserId, customerEmail, customerPhone);

        const newReservations = dateTimes.map(dt => ({
            reservation_date: dt.date,
            reservation_time: dt.time,
            name: finalName,
            name_kana: matchedCustomer?.name_kana || '',
            phone: customerPhone,
            email: customerEmail,
            menu_id: menuId || menus[0]?.id,
            source: 'admin',
            ...(profile?.user_id ? { user_id: profile.user_id } : {}),
            ...(profile?.line_user_id ? { line_user_id: profile.line_user_id } : {})
        }));

        setBulkConfirm({
            name: finalName,
            count: newReservations.length,
            reservations: newReservations
        });
    };

    const executeBulkRegister = async () => {
        if (!bulkConfirm) return;
        setLoading(true);
        const { error } = await supabase.from('reservations').insert(bulkConfirm.reservations);

        if (error) {
            alert('登録に失敗しました: ' + error.message);
        } else {
            const count = bulkConfirm.count;
            setBulkConfirm(null);
            setBulkText('');
            setIsBulkEditing(false);
            fetchReservations();
            alert(`${count}件の予約を登録しました`);
        }
        setLoading(false);
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
            {bulkConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1001
                }}>
                    <div style={{ background: 'white', padding: '25px', borderRadius: '12px', minWidth: '350px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h4 style={{ marginTop: 0, color: 'var(--piste-dark-blue)' }}>一括登録の確認</h4>
                        <div style={{ margin: '15px 0', fontSize: '15px' }}>
                            <strong>{bulkConfirm.name} 様</strong> のご予約を<strong>{bulkConfirm.count}件</strong>、登録してもよろしいですか？
                        </div>
                        <div style={{ maxHeight: '150px', overflowY: 'auto', background: '#f7fafc', padding: '10px', borderRadius: '6px', fontSize: '12px', marginBottom: '20px' }}>
                            {bulkConfirm.reservations.map((r, i) => (
                                <div key={i} style={{ padding: '4px 0', borderBottom: i === bulkConfirm.reservations.length - 1 ? 'none' : '1px solid #edf2f7' }}>
                                    {r.reservation_date} {r.reservation_time} - {menus.find(m => m.id === r.menu_id)?.label}
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setBulkConfirm(null)} style={{ padding: '10px 20px', borderRadius: '6px', border: '1px solid #ddd', background: 'white', cursor: 'pointer' }}>キャンセル</button>
                            <button onClick={executeBulkRegister} style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', background: 'var(--piste-green)', color: 'white', fontWeight: 'bold', cursor: 'pointer' }}>はい、登録します</button>
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
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn-secondary" onClick={() => setIsBulkEditing(!isBulkEditing)} style={{ fontSize: '13px', padding: '8px 16px' }}>一括登録</button>
                            <button className="btn-primary" onClick={openNewReservation} style={{ fontSize: '13px', padding: '8px 16px' }}>＋ 新規予約</button>
                        </div>
                    </div>

                    {isBulkEditing && (
                        <div className="card" style={{ marginBottom: '20px', border: '2px solid var(--piste-green)' }}>
                            <h4 style={{ marginTop: 0, marginBottom: '10px' }}>一括登録</h4>
                            <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                                テキストを貼り付けて複数の予約を一度に作成します。<br />
                                形式例：<br />
                                石川卓様<br />
                                パーソナル<br />
                                2月14日 19:00<br />
                                2月21日 20:00
                            </p>
                            <textarea
                                value={bulkText}
                                onChange={e => setBulkText(e.target.value)}
                                placeholder="ここに入力..."
                                style={{ width: '100%', height: '150px', padding: '10px', borderRadius: '6px', border: '1px solid #ddd', fontSize: '14px', marginBottom: '10px' }}
                            />
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button type="button" className="btn-secondary" onClick={() => setIsBulkEditing(false)}>キャンセル</button>
                                <button type="button" className="btn-primary" onClick={handleBulkRegister} disabled={loading}>一括登録を実行</button>
                            </div>
                        </div>
                    )}

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
                                <label style={{ position: 'relative' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>お名前</span>
                                    <input
                                        type="text"
                                        value={editForm.name || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditForm({ ...editForm, name: val });
                                            handleSearch(val);
                                        }}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                    />
                                </label>
                                <label style={{ position: 'relative' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>ヨミガナ</span>
                                    <input
                                        type="text"
                                        value={editForm.name_kana || ''}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setEditForm({ ...editForm, name_kana: val });
                                            handleSearch(val);
                                        }}
                                        onKeyDown={handleSuggestionKeyDown}
                                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                                        placeholder="例：ヤマダ タロウ"
                                    />
                                    {suggestions.length > 0 && (
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: 0,
                                            right: 0,
                                            background: 'white',
                                            border: '1px solid #ddd',
                                            borderRadius: '6px',
                                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                            zIndex: 10,
                                            marginTop: '2px'
                                        }}>
                                            {suggestions.map((s, idx) => (
                                                <div
                                                    key={idx}
                                                    onClick={() => selectSuggestion(s)}
                                                    onMouseEnter={() => setSuggestionIndex(idx)}
                                                    style={{
                                                        padding: '10px',
                                                        borderBottom: idx === suggestions.length - 1 ? 'none' : '1px solid #eee',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                        backgroundColor: idx === suggestionIndex ? '#edf2f7' : 'white'
                                                    }}
                                                >
                                                    <div style={{ fontWeight: 'bold' }}>
                                                        {s.name} ({s.name_kana})
                                                        {s.line_user_id && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#25D366', fontWeight: 'normal' }}>LINE</span>}
                                                        {s.user_id && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#3182ce', fontWeight: 'normal' }}>会員</span>}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#666' }}>{s.phone} / {s.email}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
