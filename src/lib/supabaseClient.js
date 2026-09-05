// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kmyljfxgygysubbihffw.supabase.co';
const supabaseAnonKey = 'sb_publishable_GUOuzWokLNCqW_jLRGU54A_XDYrA0Rt';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);