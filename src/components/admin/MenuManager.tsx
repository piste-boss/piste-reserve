import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Menu {
    id: string;
    label: string;
    duration: number;
    description?: string;
}

const MenuManager: React.FC = () => {
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [currentMenu, setCurrentMenu] = useState<Partial<Menu>>({});

    const fetchMenus = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('menus').select('*').order('created_at');
        if (data) setMenus(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchMenus();
    }, []);

    const handleSave = async () => {
        if (!currentMenu.label || !currentMenu.duration) return alert("必須項目を入力してください");

        const payload = {
            label: currentMenu.label,
            duration: currentMenu.duration,
            description: currentMenu.description
        };

        if (currentMenu.id) {
            await supabase.from('menus').update(payload).eq('id', currentMenu.id);
        } else {
            await supabase.from('menus').insert([payload]);
        }

        setIsEditing(false);
        setCurrentMenu({});
        fetchMenus();
    };

    const handleDelete = async (id: string) => {
        if (!confirm('本当に削除しますか？')) return;
        await supabase.from('menus').delete().eq('id', id);
        fetchMenus();
    };

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <h3>予約メニュー管理</h3>
                <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '12px' }} onClick={() => { setCurrentMenu({}); setIsEditing(true); }}>新規追加</button>
            </div>

            {isEditing && (
                <div style={{ marginBottom: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>メニュー名</label>
                        <input
                            type="text"
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                            value={currentMenu.label || ''}
                            onChange={e => setCurrentMenu({ ...currentMenu, label: e.target.value })}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold' }}>所要時間（分）</label>
                        <input
                            type="number"
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                            value={currentMenu.duration || ''}
                            onChange={e => setCurrentMenu({ ...currentMenu, duration: parseInt(e.target.value) })}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn-primary" style={{ flex: 1 }} onClick={handleSave}>保存</button>
                        <button className="btn-secondary" style={{ flex: 1 }} onClick={() => setIsEditing(false)}>キャンセル</button>
                    </div>
                </div>
            )}

            {loading ? <div style={{ textAlign: 'center', padding: '20px' }}>読み込み中...</div> : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {menus.map(m => (
                        <li key={m.id} style={{ padding: '10px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{m.label}</div>
                                <div style={{ fontSize: '12px', color: '#666' }}>{m.duration}分</div>
                            </div>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button onClick={() => { setCurrentMenu(m); setIsEditing(true); }} style={{ padding: '4px 8px', fontSize: '12px', background: '#edf2f7', borderRadius: '4px' }}>編集</button>
                                <button onClick={() => handleDelete(m.id)} style={{ padding: '4px 8px', fontSize: '12px', background: '#fee2e2', color: '#c53030', borderRadius: '4px' }}>削除</button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default MenuManager;
