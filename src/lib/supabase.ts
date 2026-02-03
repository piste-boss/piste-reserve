import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ppmupxfwmfsxxaxcohxp.supabase.co';
// API Key は後ほどユーザーから提供されたものに差し替えます
const supabaseAnonKey = 'sb_publishable_LWJtdCJPsG8A6O8KIa4OqA_6IuB-PBM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
