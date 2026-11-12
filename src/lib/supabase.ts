import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

// The cloud gallery has no sign-in yet, so every visitor would share one list
// of pours. It stays off (pours are saved on the device) unless
// VITE_CLOUD_GALLERY=on is set deliberately, e.g. once accounts exist.
const cloudGalleryOn = import.meta.env.VITE_CLOUD_GALLERY === 'on';

export const isCloudConfigured = Boolean(cloudGalleryOn && supabaseUrl && supabaseAnonKey);

// A harmless inert client keeps offline-first behavior available when cloud
// settings are absent, while production receives its values from Sites.
export const supabase = createClient(
  supabaseUrl || 'https://offline.invalid',
  supabaseAnonKey || 'offline-anon-key',
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'X-Client-Info': 'lucky-bear-fluid-studio/2' } },
  },
);
