import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ppmupxfwmfsxxaxcohxp.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_LWJtdCJPsG8A6O8KIa4OqA_6IuB-PBM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
    console.log('🔍 Supabaseデータベース構造を確認中...\n');
    console.log('📍 URL:', supabaseUrl);
    console.log('');

    // 1. profilesテーブルの存在確認とデータ取得
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 1. profilesテーブルの確認');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);

        if (error) {
            console.log('❌ エラー:', error.message);
            console.log('💡 profilesテーブルが存在しない可能性があります');
        } else {
            console.log('✅ profilesテーブルは存在します');
            if (data && data.length > 0) {
                console.log('📋 カラム:', Object.keys(data[0]).join(', '));
                console.log('📝 サンプルデータ:', data[0]);
            } else {
                console.log('📝 データ: テーブルは空です');
            }
        }
    } catch (err) {
        console.log('❌ 予期しないエラー:', err);
    }

    console.log('');

    // 2. menusテーブルの確認
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 2. menusテーブルの確認');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        const { data, error } = await supabase
            .from('menus')
            .select('*');

        if (error) {
            console.log('❌ エラー:', error.message);
        } else {
            console.log('✅ menusテーブルは存在します');
            console.log(`📝 データ件数: ${data?.length || 0}件`);
            if (data && data.length > 0) {
                console.log('📋 メニュー一覧:');
                data.forEach((menu: any) => {
                    console.log(`   - ${menu.label} (${menu.duration}分) [ID: ${menu.id}]`);
                });
            }
        }
    } catch (err) {
        console.log('❌ 予期しないエラー:', err);
    }

    console.log('');

    // 3. reservationsテーブルの構造確認
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 3. reservationsテーブルの確認');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

    try {
        const { data, error } = await supabase
            .from('reservations')
            .select('*')
            .limit(1);

        if (error) {
            console.log('❌ エラー:', error.message);
        } else {
            console.log('✅ reservationsテーブルは存在します');
            if (data && data.length > 0) {
                console.log('📋 カラム:', Object.keys(data[0]).join(', '));
            } else {
                console.log('📝 データ: テーブルは空です');
            }
        }
    } catch (err) {
        console.log('❌ 予期しないエラー:', err);
    }

    console.log('');

    // 4. 現在の認証ユーザー確認
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔐 4. 認証状態の確認');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
        console.log('✅ セッションあり');
        console.log('📧 Email:', session.user.email);
        console.log('🆔 User ID:', session.user.id);
    } else {
        console.log('ℹ️  セッションなし（ANON KEYでの接続）');
    }

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 確認完了');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

checkDatabase().catch(console.error);
