import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    onBack: () => void;
    userEmail: string;
}

const MyPage: React.FC<Props> = ({ onBack, userEmail }) => {
    const [reservations, setReservations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<any>(null);
    const [isLiffLoading, setIsLiffLoading] = useState(false);
    const [menus, setMenus] = useState<{ id: string; label: string }[]>([]);

    useEffect(() => {
        fetchData();
    }, []);

    const [cancelingId, setCancelingId] = useState<string | null>(null);
    const [cancelReason, setCancelReason] = useState('');

    const fetchData = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 予約情報の取得
            const { data: resvData } = await supabase
                .from('reservations')
                .select('*')
                .eq('user_id', user.id)
                .order('reservation_date', { ascending: true });

            setReservations(resvData || []);

            // メニュー一覧の取得
            const { data: menuData } = await supabase
                .from('menus')
                .select('id, label');
            setMenus(menuData || []);

            // プロファイルの取得
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();
            setProfile(profileData);

        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleLineLink = async () => {
        const LIFF_ID = "2009052718-9rclRq3Z";
        setIsLiffLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const liff = (await import('@line/liff')).default;
            await liff.init({ liffId: LIFF_ID });
            if (!liff.isLoggedIn()) {
                // フラグを保存してApp.tsxのLIFF initに処理を委任
                localStorage.setItem('pendingLineLinkFromMyPage', 'true');
                liff.login({ redirectUri: window.location.origin });
                return;
            }

            // 既にLIFFログイン済みの場合は直接更新
            const lineProfile = await liff.getProfile();
            const { error: rpcError } = await supabase.rpc('update_profile_line_id', {
                _id: user.id,
                _line_user_id: lineProfile.userId
            });
            if (rpcError) {
                console.warn("RPC failed, using direct update:", rpcError);
                const { error } = await supabase
                    .from('profiles')
                    .update({ line_user_id: lineProfile.userId })
                    .eq('id', user.id);
                if (error) throw error;
            }

            alert('LINE連携が完了しました！');
            fetchData();
        } catch (err: any) {
            console.error('LINE link error:', err);
            alert(`連携に失敗しました。\n${err?.message || 'しばらくしてから再度お試しください。'}`);
        } finally {
            setIsLiffLoading(false);
        }
    };

    const handleLineUnlink = async () => {
        if (!confirm('LINE連携を解除してもよろしいですか？\n解除するとLINEでの通知が届かなくなります。')) return;

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('profiles')
                .update({ line_user_id: null })
                .eq('id', user.id);

            if (error) throw error;
            alert('LINE連携を解除しました。');
            fetchData();
        } catch (err) {
            console.error('LINE unlink error:', err);
            alert('解除に失敗しました。');
        }
    };

    const handleCancelSubmit = async (id: string) => {
        if (!confirm('予約をキャンセルしてもよろしいですか？')) return;

        try {
            setLoading(true);
            if (cancelReason) {
                await supabase
                    .from('reservations')
                    .update({ cancel_reason: cancelReason })
                    .eq('id', id);
            }

            const { error } = await supabase
                .from('reservations')
                .delete()
                .eq('id', id);

            if (error) throw error;
            alert('予約をキャンセルしました。');
            setCancelingId(null);
            setCancelReason('');
            fetchData();
        } catch (err) {
            console.error('Cancel error:', err);
            alert('キャンセルに失敗しました。');
            setLoading(false);
        }
    };

    const getMenuLabel = (menuId: string) => {
        return menus.find(m => m.id === menuId)?.label || menuId;
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ fontSize: '18px' }}>マイページ</h2>
                <span style={{ fontSize: '12px', color: 'var(--piste-text-muted)' }}>{userEmail}</span>
            </div>

            {/* LINE連携セクション */}
            <div style={{
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '12px',
                marginBottom: '25px',
                border: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill={profile?.line_user_id ? "#06C755" : "#ccc"}>
                            <path d="M24 10.304c0-4.587-4.783-8.304-10.666-8.304-5.884 0-10.667 3.717-10.667 8.304 0 4.108 3.792 7.545 8.916 8.192l-.63 2.367c-.076.284.185.528.46.4l3.234-1.46c.394.053.798.081 1.21.081 5.883 0 10.666-3.717 10.666-8.304z" />
                        </svg>
                        LINE通知設定
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--piste-text-muted)' }}>
                        {profile?.line_user_id ? '連携済み' : '未連携（現在はメール通知）'}
                    </div>
                </div>
                {profile?.line_user_id ? (
                    <button
                        onClick={handleLineUnlink}
                        style={{ fontSize: '12px', background: 'none', border: '1px solid #ddd', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', color: '#666' }}
                    >
                        解除する
                    </button>
                ) : (
                    <button
                        onClick={handleLineLink}
                        disabled={isLiffLoading}
                        style={{ fontSize: '12px', backgroundColor: '#06C755', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        {isLiffLoading ? '処理中...' : '連携する'}
                    </button>
                )}
            </div>

            <h3 style={{ fontSize: '16px', marginBottom: '15px' }}>現在のご予約</h3>

            {loading && !cancelingId ? (
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
                                {cancelingId !== res.id && (
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
                                        onClick={() => setCancelingId(res.id)}
                                    >
                                        キャンセル
                                    </button>
                                )}
                            </div>

                            {cancelingId === res.id && (
                                <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: 'var(--piste-text-muted)' }}>
                                        キャンセル理由をご記入ください（任意）
                                    </label>
                                    <textarea
                                        value={cancelReason}
                                        onChange={(e) => setCancelReason(e.target.value)}
                                        placeholder="例：急用が入ったため、等"
                                        style={{
                                            width: '100%',
                                            padding: '10px',
                                            borderRadius: '8px',
                                            border: '1px solid #ddd',
                                            fontSize: '14px',
                                            height: '80px',
                                            marginBottom: '10px'
                                        }}
                                    />
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button
                                            className="btn-primary"
                                            style={{
                                                flex: 1,
                                                backgroundColor: '#e53e3e',
                                                borderColor: '#e53e3e',
                                                fontSize: '14px',
                                                padding: '10px'
                                            }}
                                            onClick={() => handleCancelSubmit(res.id)}
                                        >
                                            確定する
                                        </button>
                                        <button
                                            className="btn-primary"
                                            style={{
                                                flex: 1,
                                                backgroundColor: '#fff',
                                                color: 'var(--piste-text-muted)',
                                                border: '1px solid #ddd',
                                                fontSize: '14px',
                                                padding: '10px',
                                                boxShadow: 'none'
                                            }}
                                            onClick={() => {
                                                setCancelingId(null);
                                                setCancelReason('');
                                            }}
                                        >
                                            やめる
                                        </button>
                                    </div>
                                </div>
                            )}
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
