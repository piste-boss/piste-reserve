import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AdminDashboard: React.FC = () => {
    const [reservations, setReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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

    useEffect(() => {
        fetchReservations();

        // Subscribe to real-time updates
        const subscription = supabase
            .channel('reservations_db_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations' }, (payload) => {
                setReservations(prev => [payload.new, ...prev]);
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const downloadCSV = () => {
        if (reservations.length === 0) return;

        const headers = ['日時', '時間', 'お名前', '電話番号', 'メール', 'メニュー', '経路'];
        const rows = reservations.map(r => [
            r.reservation_date,
            r.reservation_time,
            r.name,
            r.phone,
            r.email,
            r.menu_id,
            r.source
        ]);

        const content = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob(["\ufeff" + content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `reservations_${new Date().toISOString().split('T')[0]}.csv`);
        link.click();
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ color: 'var(--piste-dark-blue)' }}>予約管理ダッシュボード</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={fetchReservations} className="btn-secondary" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}>更新</button>
                    <button onClick={downloadCSV} className="btn-primary" style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '14px' }}>CSVダウンロード</button>
                </div>
            </div>

            {loading ? (
                <p>読み込み中...</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                                <th style={{ padding: '15px', borderBottom: '1px solid #eee' }}>予約日時</th>
                                <th style={{ padding: '15px', borderBottom: '1px solid #eee' }}>お名前</th>
                                <th style={{ padding: '15px', borderBottom: '1px solid #eee' }}>連絡先</th>
                                <th style={{ padding: '15px', borderBottom: '1px solid #eee' }}>メニュー</th>
                                <th style={{ padding: '15px', borderBottom: '1px solid #eee' }}>経路</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reservations.map((r) => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f1f1f1' }}>
                                    <td style={{ padding: '15px' }}>
                                        <div style={{ fontWeight: 'bold' }}>{r.reservation_date}</div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>{r.reservation_time}</div>
                                    </td>
                                    <td style={{ padding: '15px' }}>{r.name}</td>
                                    <td style={{ padding: '15px' }}>
                                        <div style={{ fontSize: '14px' }}>{r.phone}</div>
                                        <div style={{ fontSize: '12px', color: '#666' }}>{r.email}</div>
                                    </td>
                                    <td style={{ padding: '15px', fontSize: '14px' }}>{r.menu_id}</td>
                                    <td style={{ padding: '15px' }}>
                                        <span style={{
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            backgroundColor: r.source.includes('ai') ? '#ebf8ff' : '#f0fff4',
                                            color: r.source.includes('ai') ? '#2b6cb0' : '#2f855a'
                                        }}>
                                            {r.source.includes('ai') ? 'デコピン' : 'Webフォーム'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {reservations.length === 0 && (
                                <tr>
                                    <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#999' }}>予約データがありません</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default AdminDashboard;
