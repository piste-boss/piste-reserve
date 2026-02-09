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
        <div className="admin-container">
            <header style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ color: 'var(--piste-dark-blue)', margin: 0 }}>管理者ダッシュボード</h2>
                <a href="/" style={{ fontSize: '14px', color: 'var(--piste-text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>&larr;</span> 予約サイトへ戻る
                </a>
            </header>

            <div className="admin-layout">
                {/* Sidebar Navigation */}
                <nav className="admin-sidebar card" style={{ padding: '10px', height: 'fit-content' }}>
                    <div className="admin-nav-menu">
                        <button
                            onClick={() => setActiveTab('reservations')}
                            style={{
                                padding: '12px 15px',
                                borderRadius: '8px',
                                background: activeTab === 'reservations' ? 'var(--piste-dark-blue)' : 'transparent',
                                color: activeTab === 'reservations' ? 'white' : '#555',
                                textAlign: 'left',
                                fontWeight: activeTab === 'reservations' ? 'bold' : 'normal'
                            }}
                        >
                            📅 予約管理
                        </button>
                        <button
                            onClick={() => setActiveTab('holidays')}
                            style={{
                                padding: '12px 15px',
                                borderRadius: '8px',
                                background: activeTab === 'holidays' ? 'var(--piste-dark-blue)' : 'transparent',
                                color: activeTab === 'holidays' ? 'white' : '#555',
                                textAlign: 'left',
                                fontWeight: activeTab === 'holidays' ? 'bold' : 'normal'
                            }}
                        >
                            🎌 休日設定
                        </button>
                        <button
                            onClick={() => setActiveTab('menus')}
                            style={{
                                padding: '12px 15px',
                                borderRadius: '8px',
                                background: activeTab === 'menus' ? 'var(--piste-dark-blue)' : 'transparent',
                                color: activeTab === 'menus' ? 'white' : '#555',
                                textAlign: 'left',
                                fontWeight: activeTab === 'menus' ? 'bold' : 'normal'
                            }}
                        >
                            📋 メニュー管理
                        </button>
                        <button
                            onClick={() => setActiveTab('customers')}
                            style={{
                                padding: '12px 15px',
                                borderRadius: '8px',
                                background: activeTab === 'customers' ? 'var(--piste-dark-blue)' : 'transparent',
                                color: activeTab === 'customers' ? 'white' : '#555',
                                textAlign: 'left',
                                fontWeight: activeTab === 'customers' ? 'bold' : 'normal'
                            }}
                        >
                            👥 顧客リスト
                        </button>
                    </div>
                </nav>

                {/* Main Content Area */}
                <main className="admin-content">
                    {loading && <div className="card" style={{ textAlign: 'center', padding: '40px' }}>読み込み中...</div>}

                    {activeTab === 'reservations' && !loading && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h3 style={{ margin: 0 }}>予約一覧</h3>
                                <button className="btn-primary" onClick={() => { setEditForm({}); setIsEditing(true); }}>＋ 新規予約</button>
                            </div>

                            {isEditing && (
                                <div className="card" style={{ marginBottom: '20px', border: '2px solid var(--piste-dark-blue)' }}>
                                    <h4 style={{ marginTop: 0, marginBottom: '15px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                                        {editForm.id ? '予約情報の変更' : '新規予約の登録'}
                                    </h4>
                                    <div className="grid-2-cols" style={{ display: 'grid', gap: '15px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
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
                                        <button className="btn-secondary" onClick={() => setIsEditing(false)}>キャンセル</button>
                                        <button className="btn-primary" onClick={editForm.id ? handleSaveReservation : handleRegister}>保存する</button>
                                    </div>
                                </div>
                            )}

                            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto' }}>
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
                                                        <div style={{ fontSize: '12px', color: '#666' }}>{r.reservation_time}</div>
                                                    </td>
                                                    <td>{r.name}</td>
                                                    <td>
                                                        <div>{r.phone}</div>
                                                        <div style={{ fontSize: '12px', color: '#666' }}>{r.email}</div>
                                                    </td>
                                                    <td>
                                                        {menus.find(m => m.id === r.menu_id)?.label || r.menu_id}
                                                    </td>
                                                    <td>
                                                        <span style={{
                                                            fontSize: '11px', padding: '2px 6px', borderRadius: '4px',
                                                            background: r.source?.includes('ai') ? '#ebf8ff' : '#f0fff4',
                                                            color: r.source?.includes('ai') ? '#2b6cb0' : '#2f855a'
                                                        }}>
                                                            {r.source?.includes('ai') ? 'AI' : 'Web'}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', gap: '5px' }}>
                                                            <button onClick={() => handleEdit(r)} style={{ padding: '6px 10px', borderRadius: '4px', background: '#edf2f7', fontSize: '12px' }}>編集</button>
                                                            <button onClick={() => handleDelete(r.id)} style={{ padding: '6px 10px', borderRadius: '4px', background: '#fee2e2', color: 'red', fontSize: '12px' }}>削除</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                            {reservations.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: '#999' }}>予約データがありません</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'holidays' && <HolidayManager />}
                    {activeTab === 'menus' && <MenuManager />}
                    {activeTab === 'customers' && <CustomerList />}
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;
