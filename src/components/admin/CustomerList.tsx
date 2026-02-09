import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const CustomerList: React.FC = () => {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCustomers = async () => {
        setLoading(true);
        // Profilesテーブル、もしくはReservationsからユニークな顧客を抽出
        // ここではProfiles（ログインユーザー）を表示
        const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (data) setCustomers(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    if (loading) return <div>読み込み中...</div>;

    return (
        <div className="card">
            <h3>顧客リスト</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                    <thead>
                        <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
                            <th style={{ padding: '10px' }}>お名前</th>
                            <th style={{ padding: '10px' }}>電話番号</th>
                            <th style={{ padding: '10px' }}>メール</th>
                            <th style={{ padding: '10px' }}>LINE連携</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                                <td style={{ padding: '10px' }}>{c.name || '未設定'}</td>
                                <td style={{ padding: '10px' }}>{c.phone || '-'}</td>
                                <td style={{ padding: '10px' }}>{c.email || '-'}</td>
                                <td style={{ padding: '10px' }}>
                                    {c.line_user_id ? <span style={{ color: 'green' }}>済</span> : <span style={{ color: '#ccc' }}>未</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default CustomerList;
