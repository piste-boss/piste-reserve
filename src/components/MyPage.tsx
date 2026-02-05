import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    onBack: () => void;
    userEmail: string;
}

const MyPage: React.FC<Props> = ({ onBack, userEmail }) => {
    const [reservations, setReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReservations();
    }, []);

    const fetchReservations = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('reservations')
                .select('*')
                .eq('user_id', user.id)
                .order('reservation_date', { ascending: true });

            if (error) throw error;
            setReservations(data || []);
        } catch (err) {
            console.error('Error fetching reservations:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async (id: string) => {
        if (!confirm('予約をキャンセルしてもよろしいですか？')) return;

        try {
            const { error } = await supabase
                .from('reservations')
                .delete()
                .eq('id', id);

            if (error) throw error;
            alert('予約をキャンセルしました。');
            fetchReservations();
        } catch (err) {
            console.error('Cancel error:', err);
            alert('キャンセルに失敗しました。');
        }
    };

    const getMenuLabel = (menuId: string) => {
        const menus: any = {
            'personal-20': 'パーソナル',
            'trial-60': '無料体験',
            'entry-30': '入会手続き',
            'online-30': 'オンライン',
            'first-60': '初回パーソナル'
        };
        return menus[menuId] || 'パーソナルトレーニング';
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px' }}>マイページ</h2>
                <span style={{ fontSize: '12px', color: 'var(--piste-text-muted)' }}>{userEmail}</span>
            </div>

            <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>現在のご予約</h3>

            {loading ? (
                <p>読み込み中...</p>
            ) : reservations.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '20px', color: 'var(--piste-text-muted)' }}>
                    ご予約はありません
                </p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {reservations.map((res) => (
                        <div key={res.id} className="card" style={{ marginBottom: 0, padding: '15px', border: '1px solid #eee' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <div style={{ fontWeight: 'bold', fontSize: '15px', color: 'var(--piste-dark-blue)' }}>
                                        {getMenuLabel(res.menu_id)}
                                    </div>
                                    <div style={{ fontSize: '14px', marginTop: '4px' }}>
                                        {res.reservation_date} {res.reservation_time}〜
                                    </div>
                                </div>
                                <button
                                    style={{
                                        padding: '6px 12px',
                                        fontSize: '12px',
                                        backgroundColor: '#fff',
                                        color: '#e53e3e',
                                        border: '1px solid #feb2b2',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => handleCancel(res.id)}
                                >
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginTop: '30px' }}>
                <button className="btn-primary" style={{ width: '100%', marginBottom: '10px' }} onClick={onBack}>
                    予約画面に戻る
                </button>
                <button
                    className="btn-secondary"
                    style={{ width: '100%', background: 'transparent', color: '#e53e3e' }}
                    onClick={async () => {
                        await supabase.auth.signOut();
                        window.location.reload();
                    }}
                >
                    ログアウト
                </button>
            </div>
        </div>
    );
};

export default MyPage;
