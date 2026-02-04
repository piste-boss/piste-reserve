import React, { useState } from 'react';

interface Props {
    onSubmit: (formData: { name: string; email: string; phone: string }) => void;
    onBack: () => void;
    isSubmitting: boolean;
}

const ReservationForm: React.FC<Props> = ({ onSubmit, onBack, isSubmitting }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name && email && phone && !isSubmitting) {
            onSubmit({ name, email, phone });
        }
    };

    return (
        <div className="card">
            <h2 style={{ fontSize: '18px', marginBottom: '20px' }}>お客様情報を入力</h2>

            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px', color: 'var(--piste-text-muted)' }}>お名前</label>
                    <input
                        type="text"
                        required
                        placeholder="山田 太郎"
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '16px'
                        }}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>

                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px', color: 'var(--piste-text-muted)' }}>電話番号</label>
                    <input
                        type="tel"
                        required
                        placeholder="09012345678"
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '16px'
                        }}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                    />
                </div>

                <div style={{ marginBottom: '25px' }}>
                    <label style={{ display: 'block', fontSize: '14px', marginBottom: '5px', color: 'var(--piste-text-muted)' }}>メールアドレス</label>
                    <input
                        type="email"
                        required
                        placeholder="example@piste.com"
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #ddd',
                            fontSize: '16px'
                        }}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                    />
                </div>

                <button
                    type="submit"
                    className="btn-primary"
                    style={{
                        width: '100%',
                        marginBottom: '10px',
                        opacity: isSubmitting ? 0.7 : 1,
                        cursor: isSubmitting ? 'not-allowed' : 'pointer'
                    }}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? '送信中...' : '予約を確定する'}
                </button>
            </form>

            <button className="btn-primary" style={{ width: '100%', background: 'transparent', color: 'var(--piste-text-muted)', border: '1px solid #ddd', boxShadow: 'none' }} onClick={onBack}>
                戻る
            </button>
        </div>
    );
};

export default ReservationForm;
