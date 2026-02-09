import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import ReservationManager from './admin/ReservationManager';
import HolidayManager from './admin/HolidayManager';
import MenuManager from './admin/MenuManager';
import CustomerList from './admin/CustomerList';

const AdminDashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState('reservations');
    const [menus, setMenus] = useState<any[]>([]);

    const fetchMenus = async () => {
        const { data } = await supabase.from('menus').select('*');
        if (data && data.length > 0) {
            setMenus(data);
        } else {
            // Fallback if table empty or not exists
            setMenus([
                { id: 'personal-20', label: 'パーソナルトレーニング', duration: 20 },
                { id: 'trial-60', label: '無料体験', duration: 60 },
                { id: 'entry-30', label: '入会手続き', duration: 30 },
                { id: 'online-30', label: 'オンライン', duration: 30 },
                { id: 'first-60', label: '初回パーソナル', duration: 60 },
            ]);
        }
    }

    useEffect(() => {
        fetchMenus();
    }, []);

    return (
        <div className="admin-container">
            <header className="admin-header" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ color: 'var(--piste-dark-blue)', margin: 0 }}>管理者ダッシュボード</h2>
                <a href="/" style={{ fontSize: '14px', color: 'var(--piste-text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span>&larr;</span> 予約サイトへ戻る
                </a>
            </header>

            <div className="admin-layout">
                {/* Sidebar Navigation */}
                <nav className="admin-sidebar admin-nav-menu">
                    <button
                        className={`admin-menu-item ${activeTab === 'reservations' ? 'active' : ''}`}
                        onClick={() => setActiveTab('reservations')}
                    >
                        予約管理
                    </button>
                    <button
                        className={`admin-menu-item ${activeTab === 'holidays' ? 'active' : ''}`}
                        onClick={() => setActiveTab('holidays')}
                    >
                        休日設定
                    </button>
                    <button
                        className={`admin-menu-item ${activeTab === 'menus' ? 'active' : ''}`}
                        onClick={() => setActiveTab('menus')}
                    >
                        メニュー管理
                    </button>
                    <button
                        className={`admin-menu-item ${activeTab === 'customers' ? 'active' : ''}`}
                        onClick={() => setActiveTab('customers')}
                    >
                        顧客リスト
                    </button>
                </nav>

                {/* Main Content Area */}
                <main className="admin-content">
                    {activeTab === 'reservations' && <ReservationManager menus={menus} />}
                    {activeTab === 'holidays' && <HolidayManager />}
                    {activeTab === 'menus' && <MenuManager />}
                    {activeTab === 'customers' && <CustomerList />}
                </main>
            </div>
        </div>
    );
};

export default AdminDashboard;
