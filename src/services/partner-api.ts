import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Public API origin fallback: EAS remote builds do not receive a developer's
// untracked .env.local file. EXPO_PUBLIC_API_BASE_URL still overrides this.
const FALLBACK_BASE_URL = 'https://darkgoldenrod-ibex-216110.hostingersite.com';
const environmentBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
// Older preview builds carried a temporary Hostinger URL. Do not let a stale
// EAS Preview variable send the released partner app back to that backend.
const CONFIGURED_BASE_URL = !environmentBaseUrl || /aimedixmeds\.com|aimedix\.in|lightgoldenrodyellow-okapi-349601\.hostingersite\.com/i.test(environmentBaseUrl)
  ? FALLBACK_BASE_URL
  : environmentBaseUrl;
// The Android emulator reaches the host machine through 10.0.2.2, not localhost.
const BASE_URL = Platform.OS === 'android'
  ? CONFIGURED_BASE_URL.replace(/^(https?:\/\/)localhost(?=:\d|$)/i, (_match: string, scheme: string) => `${scheme}10.0.2.2`)
  : CONFIGURED_BASE_URL;
const TOKEN_KEY = 'aimedix_partner_token';
const ROLE_KEY = 'aimedix_partner_role';
const APPEARANCE_KEY = 'aimedix_partner_appearance';

async function read(key: string) {
  if (Platform.OS === 'web') return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function write(key: string, value: string | null) {
  if (Platform.OS === 'web') {
    if (typeof localStorage === 'undefined') return;
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } else if (value) await SecureStore.setItemAsync(key, value);
  else await SecureStore.deleteItemAsync(key);
}

export class PartnerApiError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = 'PartnerApiError'; }
}

export async function partnerApi<T = any>(path: string, options: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!BASE_URL) throw new PartnerApiError('Set EXPO_PUBLIC_API_BASE_URL to the same website origin used by CustomerApp.');
  const token = options.auth === false ? null : await read(TOKEN_KEY);
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: { Accept: 'application/json', ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch { throw new PartnerApiError('Could not reach the website API. Check the API URL and network.'); }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401 && token) await write(TOKEN_KEY, null);
  if (!response.ok) throw new PartnerApiError(payload?.message || `The server returned ${response.status}.`, response.status);
  return payload as T;
}

export const persistSession = async (token: string, role: string) => { await write(TOKEN_KEY, token); await write(ROLE_KEY, role); };
export const clearSession = async () => { await write(TOKEN_KEY, null); await write(ROLE_KEY, null); };
export const readSession = async () => ({ token: await read(TOKEN_KEY), role: await read(ROLE_KEY) });
export const readAppearanceSetting = async () => read(APPEARANCE_KEY);
export const saveAppearanceSetting = async (value: string) => { await write(APPEARANCE_KEY, value); };
export const apiBaseUrl = () => BASE_URL;
