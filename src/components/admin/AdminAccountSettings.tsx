import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

const AdminAccountSettings: React.FC = () => {
    const [form, setForm] = useState({
        name: '',
        email: '',
        password: '',
        passwordConfirm: ''
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    const handleCreateAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage(null);

        if (form.password !== form.passwordConfirm) {
            setMessage({ text: 'パスワードが一致しません', type: 'error' });
            return;
        }

        if (form.password.length < 6) {
            setMessage({ text: 'パスワードは6文字以上で入力してください', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            // 1. Create Auth User
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: {
                    data: {
                        name: form.name,
                        role: 'admin' // Mark as admin in metadata
                    }
                }
            });

            if (authError) throw authError;

            // 2. Create Profile (Optional, depending on your schema)
            if (authData.user) {
                const { error: profileError } = await supabase.from('profiles').upsert({
                    id: authData.user.id,
                    name: form.name,
                    email: form.email,
                    role: 'admin' // Ensure role is set in DB if column exists
                });
                if (profileError) console.error('Profile creation error:', profileError);
            }

            setMessage({ text: '管理者アカウントを作成しました。確認メールをチェックしてください。', type: 'success' });
            setForm({ name: '', email: '', password: '', passwordConfirm: '' });
        } catch (error: any) {
            setMessage({ text: '作成に失敗しました: ' + error.message, type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="card" style={{ maxWidth: '500px' }}>
            <h3 style={{ marginBottom: '20px', color: 'var(--piste-dark-blue)' }}>管理者アカウント作成</h3>

            {message && (
                <div style={{
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '20px',
                    backgroundColor: message.type === 'success' ? '#f0fff4' : '#fff5f5',
                    color: message.type === 'success' ? '#2f855a' : '#c53030',
                    border: `1px solid ${message.type === 'success' ? '#c6f6d5' : '#fed7d7'}`,
                    fontSize: '14px'
                }}>
                    {message.text}
                </div>
            )}

            <form onSubmit={handleCreateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>氏名</span>
                    <input
                        type="text"
                        required
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                        placeholder="管理者名"
                    />
                </label>

                <label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>メールアドレス</span>
                    <input
                        type="email"
                        required
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                        placeholder="example@piste.com"
                    />
                </label>

                <label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>パスワード</span>
                    <input
                        type="password"
                        required
                        value={form.password}
                        onChange={e => setForm({ ...form, password: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                        placeholder="6文字以上"
                    />
                </label>

                <label>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>パスワード（確認）</span>
                    <input
                        type="password"
                        required
                        value={form.passwordConfirm}
                        onChange={e => setForm({ ...form, passwordConfirm: e.target.value })}
                        style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #ddd' }}
                        placeholder="パスワードを再入力"
                    />
                </label>

                <button
                    type="submit"
                    className="btn-primary"
                    disabled={loading}
                    style={{ marginTop: '10px' }}
                >
                    {loading ? '作成中...' : 'アカウントを新規作成'}
                </button>
            </form>
        </div>
    );
};

export default AdminAccountSettings;
