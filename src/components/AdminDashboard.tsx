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
        <div className="ad-wrapper">
            <div className="ad-container">
                <header className="ad-header">
                    <h2 style={{ color: 'var(--piste-dark-blue)', margin: 0 }}>管理者ダッシュボード</h2>
                    <a href="/" style={{ fontSize: '14px', color: 'var(--piste-text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span>&larr;</span> 予約サイトへ戻る
                    </a>
                </header>

                <div className="ad-layout">
                    {/* Sidebar Navigation */}
                    <nav className="ad-sidebar">
                        <button
                            className={`ad-menu-item ${activeTab === 'reservations' ? 'active' : ''}`}
                            onClick={() => setActiveTab('reservations')}
                        >
                            📅 予約管理
                        </button>
                        <button
                            className={`ad-menu-item ${activeTab === 'holidays' ? 'active' : ''}`}
                            onClick={() => setActiveTab('holidays')}
                        >
                            🎌 休日設定
                        </button>
                        <button
                            className={`ad-menu-item ${activeTab === 'menus' ? 'active' : ''}`}
                            onClick={() => setActiveTab('menus')}
                        >
                            📋 メニュー管理
                        </button>
                        <button
                            className={`ad-menu-item ${activeTab === 'customers' ? 'active' : ''}`}
                            onClick={() => setActiveTab('customers')}
                        >
                            👥 顧客リスト
                        </button>
                    </nav>

                    {/* Main Content Area */}
                    <main className="ad-content">
                        {loading && <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>読み込み中...</div>}

                        {activeTab === 'reservations' && !loading && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem' }}>予約一覧</h3>
                                    <button className="btn-primary" onClick={() => { setEditForm({}); setIsEditing(true); }}>＋ 新規予約</button>
                                </div>

                                {isEditing && (
                                    <div style={{ marginBottom: '24px', padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                        <h4 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1rem', color: '#4b5563' }}>
                                            {editForm.id ? '予約情報の変更' : '新規予約の登録'}
                                        </h4>
                                        <div className="grid-2-cols">
                                            <label>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#374151' }}>日付</span>
                                                <input type="date" value={editForm.reservation_date || ''} onChange={e => setEditForm({ ...editForm, reservation_date: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                            </label>
                                            <label>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#374151' }}>時間</span>
                                                <input type="time" value={editForm.reservation_time || ''} onChange={e => setEditForm({ ...editForm, reservation_time: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                            </label>
                                            <label>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#374151' }}>お名前</span>
                                                <input type="text" value={editForm.name || ''} onChange={e => setEditForm({ ...editForm, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                            </label>
                                            <label>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#374151' }}>電話番号</span>
                                                <input type="tel" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                            </label>
                                            <label>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#374151' }}>メールアドレス</span>
                                                <input type="email" value={editForm.email || ''} onChange={e => setEditForm({ ...editForm, email: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }} />
                                            </label>
                                            <label>
                                                <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '6px', color: '#374151' }}>メニュー</span>
                                                <select value={editForm.menu_id || ''} onChange={e => setEditForm({ ...editForm, menu_id: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db' }}>
                                                    <option value="">選択してください</option>
                                                    {menus.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                                </select>
                                            </label>
                                        </div>
                                        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                            <button style={{ padding: '10px 20px', borderRadius: '30px', border: 'none', background: '#e5e7eb', color: '#374151', fontWeight: '600' }} onClick={() => setIsEditing(false)}>キャンセル</button>
                                            <button className="btn-primary" onClick={editForm.id ? handleSaveReservation : handleRegister}>保存する</button>
                                        </div>
                                    </div>
                                )}

                                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                    <table style={{ width: '100%', whiteSpace: 'nowrap' }}>
                                        <thead>
                                            <tr>
                                                <th>日時</th>
                                                <th>お名前</th>
                                                <th>連絡先</th>
                                                <th>メニュー</th>
                                                <th>経路</th>
                                                <th>操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reservations.map(r => (
                                                <tr key={r.id}>
                                                    <td>
                                                        <div style={{ fontWeight: 'bold' }}>{r.reservation_date}</div>
                                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{r.reservation_time}</div>
                                                    </td>
                                                    <td>{r.name}</td>
                                                    <td>
                                                        <div>{r.phone}</div>
                                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{r.email}</div>
                                                    </td>
                                                    <td>
                                                        <span style={{ fontSize: '13px', color: '#374151' }}>
                                                            {menus.find(m => m.id === r.menu_id)?.label || r.menu_id}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '11px', padding: '2px 8px', borderRadius: '12px',
                                                            background: r.source?.includes('ai') ? '#eff6ff' : '#f0fdf4',
                                                            color: r.source?.includes('ai') ? '#1d4ed8' : '#15803d',
                                                            border: r.source?.includes('ai') ? '1px solid #dbeafe' : '1px solid #dcfce7'
                                                        }}>
                                                            {r.source?.includes('ai') ? 'AI' : 'Web'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                            <button onClick={() => handleEdit(r)} style={{ padding: '6px 12px', borderRadius: '6px', background: '#f3f4f6', color: '#4b5563', fontSize: '12px', fontWeight: '500' }}>編集</button>
                                                            <button onClick={() => handleDelete(r.id)} style={{ padding: '6px 12px', borderRadius: '6px', background: '#fef2f2', color: '#ef4444', fontSize: '12px', fontWeight: '500' }}>削除</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {reservations.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>予約データがありません</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === 'holidays' && <HolidayManager />}
                        {activeTab === 'menus' && <MenuManager />}
                        {activeTab === 'customers' && <CustomerList />}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
