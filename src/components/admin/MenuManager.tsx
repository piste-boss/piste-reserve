import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Menu {
    id: string;
    label: string;
    duration: number;
    description?: string;
    price?: number;
}

const MenuManager: React.FC = () => {
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Menu>>({});

    const DEFAULT_MENUS = [
        { label: 'パーソナルトレーニング', duration: 20, price: 0 },
        { label: '無料体験', duration: 60, price: 0 },
        { label: '入会手続き', duration: 30, price: 0 },
        { label: 'オンライン', duration: 30, price: 0 },
        { label: '初回パーソナル', duration: 60, price: 0 },
    ];

    const fetchMenus = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('menus')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching menus:', JSON.stringify(error));
            setMenus([]);
        } else {
            setMenus(data || []);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchMenus();
    }, []);

    const handleSave = async () => {
        if (!editForm.label || !editForm.duration) return alert('メニュー名と所要時間は必須です');
        setLoading(true);

        const payload = {
            label: editForm.label,
            duration: editForm.duration,
            description: editForm.description,
            price: editForm.price
        };

        let result;
        if (editForm.id) {
            result = await supabase.from('menus').update(payload).eq('id', editForm.id);
        } else {
            result = await supabase.from('menus').insert([payload]);
        }

        if (result.error) {
            alert('保存に失敗しました: ' + result.error.message);
        } else {
            setIsEditing(false);
            setEditForm({});
            fetchMenus();
        }
        setLoading(false);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('本当に削除しますか？')) return;
        setLoading(true);
        const { error } = await supabase.from('menus').delete().eq('id', id);
        if (error) {
            alert('削除に失敗しました');
        } else {
            fetchMenus();
        }
        setLoading(false);
    };

    const handleSeedDefaults = async () => {
        // Removed confirm to troubleshoot "instant disappear" issue
        setLoading(true);
        const { error } = await supabase.from('menus').insert(DEFAULT_MENUS);
        if (error) alert('初期データの登録に失敗: ' + error.message);
        else fetchMenus();
        setLoading(false);
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>メニュー管理</h3>
                <button className="btn-primary" onClick={() => { setEditForm({}); setIsEditing(true); }}>＋ 新規追加</button>
            </div>

            {isEditing && (
                <div style={{ marginBottom: '24px', padding: '20px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '15px' }}>{editForm.id ? 'メニュー編集' : '新規メニュー登録'}</h4>
                    <div className="grid-2-cols">
                        <label>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>メニュー名</span>
                            <input
                                type="text"
                                value={editForm.label || ''}
                                onChange={e => setEditForm({ ...editForm, label: e.target.value })}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                        </label>
                        <label>
                            <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>所要時間 (分)</span>
                            <input
                                type="number"
                                value={editForm.duration || ''}
                                onChange={e => setEditForm({ ...editForm, duration: parseInt(e.target.value) })}
                                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                            />
                        </label>
                    </div>
                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)}>キャンセル</button>
                        <button type="button" className="btn-primary" onClick={handleSave}>保存する</button>
                    </div>
                </div>
            )}

            {loading ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</div>
            ) : (
                <>
                    {menus.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#666', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e0' }}>
                            <p style={{ marginBottom: '15px', fontWeight: 'bold' }}>メニューが登録されていません。</p>
                            <p style={{ fontSize: '13px', marginBottom: '20px' }}>
                                以下の標準メニューを一括登録しますか？<br />
                                ・パーソナルトレーニング (20分)<br />
                                ・無料体験 (60分)<br />
                                ・初回パーソナル (60分)<br />
                                ・入会手続き (30分)<br />
                                ・オンライン (30分)
                            </p>
                            <button onClick={handleSeedDefaults} className="btn-primary">
                                標準メニューを登録する
                            </button>
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f7fafc', textAlign: 'left' }}>
                                        <th style={{ padding: '10px', borderBottom: '2px solid #edf2f7', fontSize: '13px' }}>メニュー名</th>
                                        <th style={{ padding: '10px', borderBottom: '2px solid #edf2f7', fontSize: '13px' }}>所要時間</th>
                                        <th style={{ padding: '10px', borderBottom: '2px solid #edf2f7', fontSize: '13px', textAlign: 'right' }}>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {menus.map(menu => (
                                        <tr key={menu.id} style={{ borderBottom: '1px solid #edf2f7' }}>
                                            <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#2d3748' }}>{menu.label}</td>
                                            <td style={{ padding: '12px 10px', color: '#4a5568' }}>{menu.duration}分</td>
                                            <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => { setEditForm(menu); setIsEditing(true); }} style={{ padding: '6px 12px', fontSize: '12px', background: '#edf2f7', borderRadius: '4px', border: 'none', color: '#4a5568', cursor: 'pointer' }}>編集</button>
                                                    <button onClick={() => handleDelete(menu.id)} style={{ padding: '6px 12px', fontSize: '12px', background: '#fee2e2', borderRadius: '4px', border: 'none', color: '#c53030', cursor: 'pointer' }}>削除</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MenuManager;
