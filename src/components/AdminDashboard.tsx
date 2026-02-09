import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import HolidayManager from './admin/HolidayManager';
import MenuManager from './admin/MenuManager';
import CustomerList from './admin/CustomerList';

const AdminDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState('reservations');
    const [reservations, setReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<any>({});

    // メンテ用メニュー（DBにあると仮定、なければハードコード）
    const [menus, setMenus] = useState<any[]>([]);

    const fetchReservations = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setReservations(data);
        }
        setLoading(false);
    };

    const fetchMenus = async () => {
        const { data } = await supabase.from('menus').select('*');
        if (data && data.length > 0) {
            setMenus(data);
        } else {
            // Fallback if table empty or not exists
            setMenus([
                { id: 'personal-20', label: 'パーソナルトレーニング', duration: 20 },
                { id: 'trial-60', label: '無料体験', duration: 60 },
                { id: 'entry-30', label: '入会手続き', duration: 30 },
                { id: 'online-30', label: 'オンライン', duration: 30 },
                { id: 'first-60', label: '初回パーソナル', duration: 60 },
            ]);
        }
    }

    useEffect(() => {
        fetchReservations();
        fetchMenus();

        const subscription = supabase
            .channel('reservations_db_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
                fetchReservations();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleDelete = async (id: string) => {
        if (!window.confirm('本当に予約を削除（キャンセル）しますか？')) return;
        const { error } = await supabase.from('reservations').delete().eq('id', id);
        if (error) alert('削除に失敗しました');
        else fetchReservations();
    };

    const handleEdit = (reservation: any) => {
        setEditForm(reservation);
        setIsEditing(true);
    };

    const handleSaveReservation = async () => {
        const { error } = await supabase.from('reservations').update({
            reservation_date: editForm.reservation_date,
            reservation_time: editForm.reservation_time,
            name: editForm.name,
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
        // Simple registration logic (can be expanded)
        const { error } = await supabase.from('reservations').insert([{
            reservation_date: editForm.reservation_date,
            reservation_time: editForm.reservation_time,
            name: editForm.name,
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

    return (
        <div className="container" style={{ maxWidth: '1200px' }}>
            <h2 style={{ marginBottom: '20px', color: 'var(--piste-dark-blue)' }}>管理者ダッシュボード</h2>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                <button onClick={() => setActiveTab('reservations')} style={{ padding: '10px 20px', borderRadius: '8px', background: activeTab === 'reservations' ? 'var(--piste-dark-blue)' : '#f0f2f5', color: activeTab === 'reservations' ? 'white' : '#555' }}>予約管理</button>
                <button onClick={() => setActiveTab('holidays')} style={{ padding: '10px 20px', borderRadius: '8px', background: activeTab === 'holidays' ? 'var(--piste-dark-blue)' : '#f0f2f5', color: activeTab === 'holidays' ? 'white' : '#555' }}>休日設定</button>
                <button onClick={() => setActiveTab('menus')} style={{ padding: '10px 20px', borderRadius: '8px', background: activeTab === 'menus' ? 'var(--piste-dark-blue)' : '#f0f2f5', color: activeTab === 'menus' ? 'white' : '#555' }}>メニュー管理</button>
                <button onClick={() => setActiveTab('customers')} style={{ padding: '10px 20px', borderRadius: '8px', background: activeTab === 'customers' ? 'var(--piste-dark-blue)' : '#f0f2f5', color: activeTab === 'customers' ? 'white' : '#555' }}>顧客リスト</button>
            </div>

            {loading && <div style={{ padding: '20px', textAlign: 'center' }}>読み込み中...</div>}

            {activeTab === 'reservations' && !loading && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                        <button className="btn-primary" onClick={() => { setEditForm({}); setIsEditing(true); }}>新規予約登録</button>
                    </div>

                    {isEditing && (
                        <div className="card" style={{ background: '#f8f9fa' }}>
                            <h3>{editForm.id ? '予約変更' : '新規予約登録'}</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <label>
                                    日付: <input type="date" value={editForm.reservation_date || ''} onChange={e => setEditForm({ ...editForm, reservation_date: e.target.value })} style={{ width: '100%', padding: '8px' }} />
                                </label>
                                <label>
                                    時間: <input type="time" value={editForm.reservation_time || ''} onChange={e => setEditForm({ ...editForm, reservation_time: e.target.value })} style={{ width: '100%', padding: '8px' }} />
                                </label>
                                <label>
                                    名前: <input type="text" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', padding: '8px' }} />
                                </label>
                                <label>
                                    電話: <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} style={{ width: '100%', padding: '8px' }} />
                                </label>
                                <label>
                                    メール: <input type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={{ width: '100%', padding: '8px' }} />
                                </label>
                                <label>
                                    メニュー:
                                    <select value={editForm.menu_id || ''} onChange={e => setEditForm({ ...editForm, menu_id: e.target.value })} style={{ width: '100%', padding: '8px' }}>
                                        <option value="">選択してください</option>
                                        {menus.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </label>
                            </div>
                            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                                <button className="btn-primary" onClick={editForm.id ? handleSaveReservation : handleRegister}>保存</button>
                                <button className="btn-secondary" onClick={() => setIsEditing(false)}>キャンセル</button>
                            </div>
                        </div>
                    )}

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '8px' }}>
                            <thead>
                                <tr style={{ background: '#f1f1f1', textAlign: 'left' }}>
                                    <th style={{ padding: '10px' }}>日時</th>
                                    <th style={{ padding: '10px' }}>名前</th>
                                    <th style={{ padding: '10px' }}>メニュー</th>
                                    <th style={{ padding: '10px' }}>アクション</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reservations.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '10px' }}>{r.reservation_date} {r.reservation_time}</td>
                                        <td style={{ padding: '10px' }}>{r.name}</td>
                                        <td style={{ padding: '10px' }}>{r.menu_id}</td>
                                        <td style={{ padding: '10px' }}>
                                            <button onClick={() => handleEdit(r)} style={{ marginRight: '5px', padding: '4px 8px', borderRadius: '4px', background: '#edf2f7' }}>編集</button>
                                            <button onClick={() => handleDelete(r.id)} style={{ padding: '4px 8px', borderRadius: '4px', background: '#fee2e2', color: 'red' }}>削除</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'holidays' && <HolidayManager />}
            {activeTab === 'menus' && <MenuManager />}
            {activeTab === 'customers' && <CustomerList />}
        </div>
    );
};

export default AdminDashboard;
