import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface AdminLoginProps {
    onLoginSuccess: () => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [useMagicLink, setUseMagicLink] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            // Emergency Bypass for specified admin account
            if (email === 's.ishikawa@piste-i.com' && password === 'Takasusn0w') {
                onLoginSuccess();
                return;
            }

            if (useMagicLink) {
                const { error: authError } = await supabase.auth.signInWithOtp({
                    email,
                    options: { emailRedirectTo: window.location.origin }
                });
                if (authError) throw authError;
                alert('ログイン用リンクを送信しました。メールを確認してください。');
                return;
            }

            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (authError) throw authError;

            // Simplified: allow any successful login to access admin for now
            onLoginSuccess();
        } catch (err: any) {
            let userMsg = err.message;
            if (err.message === 'Invalid login credentials') {
                userMsg = 'メールアドレスまたはパスワードが正しくありません';
            }
            setError(userMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#f7fafc', padding: '20px'
        }}>
            <div className="card" style={{ maxWidth: '400px', width: '100%', padding: '30px' }}>
                <h2 style={{ textAlign: 'center', color: 'var(--piste-dark-blue)', marginBottom: '30px' }}>管理者ログイン</h2>

                {error && (
                    <div style={{
                        padding: '12px', borderRadius: '8px', marginBottom: '20px',
                        backgroundColor: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7', fontSize: '14px'
                    }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <label>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>メールアドレス</span>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                            placeholder="admin@example.com"
                        />
                    </label>

                    {!useMagicLink && (
                        <label>
                            <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>パスワード</span>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                                placeholder="••••••••"
                            />
                        </label>
                    )}

                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading}
                        style={{ padding: '15px', fontSize: '16px', marginTop: '10px' }}
                    >
                        {loading ? '送信中...' : (useMagicLink ? 'ログインリンクを送信' : 'ログイン')}
                    </button>

                    <button
                        type="button"
                        onClick={() => setUseMagicLink(!useMagicLink)}
                        style={{ background: 'none', border: 'none', color: 'var(--piste-green)', cursor: 'pointer', fontSize: '14px' }}
                    >
                        {useMagicLink ? 'パスワードでログインする' : 'ログインリンクを使用する'}
                    </button>

                    <a href="/" style={{ textAlign: 'center', fontSize: '14px', color: '#666', marginTop: '10px' }}>
                        予約サイトへ戻る
                    </a>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;
