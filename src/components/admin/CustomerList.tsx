import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const CustomerList: React.FC = () => {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchCustomers = async () => {
        setLoading(true);
        // Fetch registered profiles
        const { data: profileData } = await supabase.from('profiles').select('*');
        // Fetch all reservations to get guest names
        const { data: resvData } = await supabase.from('reservations').select('name, name_kana, phone, email, line_user_id');

        const mergedCustomers: any[] = [];
        const seen = new Set();

        // 1. Add from profiles
        profileData?.forEach(p => {
            const identifier = (p.name || '') + (p.phone || '');
            if (p.name && !seen.has(identifier)) {
                mergedCustomers.push({
                    id: p.id,
                    name: p.name,
                    name_kana: p.name_kana,
                    phone: p.phone,
                    email: p.email,
                    line_user_id: p.line_user_id,
                    is_profile: true
                });
                seen.add(identifier);
            }
        });

        // 2. Add from reservations (guests not in profiles)
        resvData?.forEach(r => {
            const identifier = (r.name || '') + (r.phone || '');
            if (r.name && !seen.has(identifier)) {
                mergedCustomers.push({
                    id: `resv-${identifier}`,
                    name: r.name,
                    name_kana: r.name_kana,
                    phone: r.phone,
                    email: r.email,
                    line_user_id: r.line_user_id,
                    is_profile: false
                });
                seen.add(identifier);
            }
        });

        setCustomers(mergedCustomers.sort((a, b) => (a.name_kana || a.name).localeCompare(b.name_kana || b.name, 'ja')));
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
                                <td style={{ padding: '10px' }}>
                                    <div style={{ fontWeight: 'bold' }}>{c.name || '未設定'}</div>
                                    {c.name_kana && <div style={{ fontSize: '11px', color: '#666' }}>{c.name_kana}</div>}
                                </td>
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
