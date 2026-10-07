import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { SymbolView } from 'expo-symbols';
import * as XLSX from 'xlsx';
import { LocationMap, type LocationPin } from '@/components/location-map';
import { apiBaseUrl, clearSession, partnerApi, persistSession, readAppearanceSetting, readSession, saveAppearanceSetting } from '@/services/partner-api';

type Role = 'pharmacy' | 'lab' | 'doctor';
type Tab = 'Dashboard' | 'Patients' | 'Messages' | 'Analytics' | 'Account';
type AnyRow = Record<string, any>;
type Zone = { id: number; name: string; city?: string; state?: string; pincode?: string; latitude?: number | string; longitude?: number | string };
type LocationChoice = LocationPin & { address: string; city?: string; pincode?: string };
type FormState = Record<string, string>;
type IconName = 'dashboard' | 'patients' | 'messages' | 'analytics' | 'account' | 'total' | 'pending' | 'completed' | 'revenue' | 'pharmacy' | 'lab' | 'doctor' | 'verified' | 'refresh' | 'close' | 'back' | 'send' | 'profile' | 'appearance' | 'arrow' | 'empty' | 'signout' | 'prescription' | 'check' | 'radio' | 'image' | 'eye' | 'catalog';

const iconSymbols: Record<IconName, { ios: string; android: string; web: string }> = {
  dashboard: { ios: 'square.grid.2x2.fill', android: 'dashboard', web: 'dashboard' },
  patients: { ios: 'person.2.fill', android: 'group', web: 'group' },
  messages: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' },
  analytics: { ios: 'chart.bar.fill', android: 'analytics', web: 'analytics' },
  account: { ios: 'person.crop.circle.fill', android: 'account_circle', web: 'account_circle' },
  total: { ios: 'tray.full.fill', android: 'inventory_2', web: 'inventory_2' },
  pending: { ios: 'clock.fill', android: 'pending_actions', web: 'pending_actions' },
  completed: { ios: 'checkmark.circle.fill', android: 'task_alt', web: 'task_alt' },
  revenue: { ios: 'creditcard.fill', android: 'payments', web: 'payments' },
  pharmacy: { ios: 'pills.fill', android: 'medication', web: 'medication' },
  lab: { ios: 'testtube.2', android: 'biotech', web: 'biotech' },
  doctor: { ios: 'stethoscope', android: 'medical_services', web: 'medical_services' },
  verified: { ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  send: { ios: 'arrow.up', android: 'send', web: 'send' },
  profile: { ios: 'person.text.rectangle', android: 'badge', web: 'badge' },
  appearance: { ios: 'circle.lefthalf.filled', android: 'palette', web: 'palette' },
  arrow: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  empty: { ios: 'tray', android: 'inbox', web: 'inbox' },
  signout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' },
  prescription: { ios: 'pills.fill', android: 'medication', web: 'medication' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  radio: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
  image: { ios: 'photo.badge.plus', android: 'add_photo_alternate', web: 'add_photo_alternate' },
  eye: { ios: 'eye', android: 'visibility', web: 'visibility' },
  catalog: { ios: 'square.grid.3x3.fill', android: 'category', web: 'category' },
};

const roles: { key: Role; title: string; icon: IconName; detail: string }[] = [
  { key: 'pharmacy', title: 'Pharmacy', icon: 'pharmacy', detail: 'Manage medicines and fulfilment' },
  { key: 'lab', title: 'Laboratory', icon: 'lab', detail: 'Manage tests and appointments' },
  { key: 'doctor', title: 'Doctor', icon: 'doctor', detail: 'Manage consultations and patients' },
];

const tabs: { title: Tab; icon: IconName }[] = [
  { title: 'Dashboard', icon: 'dashboard' },
  { title: 'Patients', icon: 'patients' },
  { title: 'Messages', icon: 'messages' },
  { title: 'Analytics', icon: 'analytics' },
  { title: 'Account', icon: 'account' },
];

const initialForm: FormState = {
  name: '',
  business_name: '',
  phone: '',
  email: '',
  password: '',
  license_number: '',
  city: '',
  pincode: '',
  address_line: '',
  speciality: '',
  qualification: '',
  consultation_fee: '',
  description: '',
  opening_hours: '',
};

const DEMO_PASSWORD = 'AmedixDemo26!';
const fmtMoney = (value: any) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const titleCase = (value: any) => String(value ?? 'pending').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

// Bulk import: template columns mirror the single "Add medicine" form, with an
// image URL column instead of a picked image file.
const BULK_COLUMNS = [
  'name', 'description', 'unit', 'price', 'discount_price', 'stock', 'sku',
  'medicine_type', 'schedule_tag', 'max_qty_per_order', 'max_qty_per_month',
  'requires_pharmacist_review', 'requires_age_confirmation', 'allows_substitution',
  'category_id', 'image_url',
] as const;
const BULK_EXAMPLE_ROW: Record<string, string | number> = {
  name: 'Paracetamol 500mg', description: 'Fever and mild pain relief', unit: 'strip',
  price: 35, discount_price: 30, stock: 120, sku: 'MED-DEMO-1', medicine_type: 'otc',
  schedule_tag: '', max_qty_per_order: 10, max_qty_per_month: 60,
  requires_pharmacist_review: 'no', requires_age_confirmation: 'no', allows_substitution: 'yes',
  category_id: '', image_url: 'https://example.com/images/paracetamol.jpg',
};
const BULK_SHEET_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const BULK_FILE_NAME = 'aimedix-bulk-products-template.xlsx';

type BulkRow = {
  name: string; description: string; unit: string; price: number; discount_price: number | null;
  stock: number; sku: string; medicine_type: string; schedule_tag: string;
  max_qty_per_order: number | null; max_qty_per_month: number | null;
  requires_pharmacist_review: boolean; requires_age_confirmation: boolean; allows_substitution: boolean;
  category_id: number | null; image_url: string;
};

const normalizeBulkHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, '');
const bulkTruthy = (value: unknown) => ['1', 'true', 'yes', 'y', 'on'].includes(String(value ?? '').trim().toLowerCase());

function normalizeBulkRow(raw: Record<string, unknown>): BulkRow {
  const lookup: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) lookup[normalizeBulkHeader(key)] = value;
  const pick = (...keys: string[]): unknown => {
    for (const key of keys) if (lookup[key] !== undefined && String(lookup[key] ?? '').trim() !== '') return lookup[key];
    return '';
  };
  const num = (value: unknown) => { const n = Number(String(value ?? '').trim()); return Number.isFinite(n) ? n : 0; };
  const str = (value: unknown) => String(value ?? '').trim();
  const subRaw = pick('allowssubstitution', 'substitution');
  const typeRaw = str(pick('medicinetype', 'type')).toLowerCase().replace(/\s+/g, '_');
  return {
    name: str(pick('name', 'medicinename', 'productname', 'title')),
    description: str(pick('description', 'desc')),
    unit: str(pick('unit', 'pack', 'packsize')) || 'strip',
    price: num(pick('price', 'mrp', 'unitprice')),
    discount_price: num(pick('discountprice', 'discount', 'saleprice')) || null,
    stock: num(pick('stock', 'quantity', 'qty')),
    sku: str(pick('sku', 'code', 'productcode')),
    medicine_type: ['otc', 'prescription_required', 'restricted'].includes(typeRaw) ? typeRaw : 'otc',
    schedule_tag: str(pick('scheduletag', 'schedule')),
    max_qty_per_order: num(pick('maxqtyperorder', 'maxperorder')) || null,
    max_qty_per_month: num(pick('maxqtypermonth', 'maxpermonth')) || null,
    requires_pharmacist_review: bulkTruthy(pick('requirespharmacistreview', 'pharmacistreview', 'review')),
    requires_age_confirmation: bulkTruthy(pick('requiresageconfirmation', 'ageconfirmation', 'age')),
    allows_substitution: str(subRaw) === '' ? true : bulkTruthy(subRaw),
    category_id: num(pick('categoryid', 'category')) || null,
    image_url: str(pick('imageurl', 'image', 'photo', 'thumbnail')),
  };
}

function AppIcon({ name, size = 18, color = '#00897b' }: { name: IconName; size?: number; color?: string }) {
  return <SymbolView name={iconSymbols[name] as any} size={size} tintColor={color} fallback={<Text style={{ color, fontSize: size }}>•</Text>} />;
}

export function PartnerApp() {
  const safeAreaInsets = useSafeAreaInsets();
  const [role, setRole] = useState<Role | null>(null);
  const [tab, setTab] = useState<Tab>('Dashboard');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [auth, setAuth] = useState({ phone: '', password: '' });
  const [registerForm, setRegisterForm] = useState<FormState>(initialForm);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [provider, setProvider] = useState<AnyRow | null>(null);
  const [conversation, setConversation] = useState<AnyRow | null>(null);
  const [messages, setMessages] = useState<AnyRow[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [appearance, setAppearance] = useState('System');
  const systemScheme = useColorScheme();
  const isLightTheme = appearance === 'Light' || (appearance !== 'Dark' && systemScheme !== 'dark');
  const C: Palette = isLightTheme ? lightPalette : darkPalette;
  const s = useMemo(() => makeStyles(C), [C]);
  useEffect(() => { void readAppearanceSetting().then((saved) => { if (saved) setAppearance(saved); }).catch(() => undefined); }, []);
  const [modal, setModal] = useState<'appearance' | 'item' | 'quote' | 'location' | 'prescription' | 'meeting' | 'details' | 'bulk' | 'profile' | 'report' | null>(null);
  const [mapPin, setMapPin] = useState<LocationPin | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationChoices, setLocationChoices] = useState<LocationChoice[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationChoice | null>(null);
  const [locationNotice, setLocationNotice] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);


  // Bulk product import
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkFileName, setBulkFileName] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState('');

  // Medicine Item Form (matching Screenshot 1)
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    unit: 'strip',
    stock: '0',
    price: '',
    discount_price: '',
    sku: '',
    medicine_type: 'otc',
    schedule_tag: '',
    max_qty_per_order: '',
    max_qty_per_month: '',
    requires_pharmacist_review: false,
    requires_age_confirmation: false,
    allows_substitution: true,
    code: '',
    preparation: '',
    report_hours: '24',
  });
  const [itemImageUri, setItemImageUri] = useState<string | null>(null);
  const [itemImageBase64, setItemImageBase64] = useState<string | null>(null);

  const [quoteForm, setQuoteForm] = useState({ medicine_name: '', pack: 'strip', quantity: '1', unit_price: '', delivery_fee: '', note: '' });
  const [quoteTask, setQuoteTask] = useState<AnyRow | null>(null);
  const [prescriptionTask, setPrescriptionTask] = useState<AnyRow | null>(null);
  const [prescriptionDraft, setPrescriptionDraft] = useState('');
  const [meetingTask, setMeetingTask] = useState<AnyRow | null>(null);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [reportUrl, setReportUrl] = useState('');
  const [reportAsset, setReportAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [selectedDetailsItem, setSelectedDetailsItem] = useState<AnyRow | null>(null);

  const loadWorkspace = useCallback(async (selectedRole?: Role) => {
    const activeRole = selectedRole ?? role;
    if (!activeRole) return;
    setRefreshing(true);
    try {
      const data = await partnerApi<any>('/api/v1/providers/tasks');
      setWorkspace(data);
      if (data.provider) setProvider(data.provider);
      setNotice('');
      if (activeRole === 'pharmacy') {
        const [products, orders] = await Promise.all([
          partnerApi<any>('/api/v1/providers/products'),
          partnerApi<any>('/api/v1/providers/orders'),
        ]);
        setWorkspace((previous: any) => ({
          ...previous,
          products: products.data ?? [],
          orders: orders.data ?? [],
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not refresh your workspace.';
      setNotice(message);
      if ((error as any)?.status === 401 || (error as any)?.status === 403) {
        await clearSession();
        setProvider(null);
        setWorkspace(null);
      }
    } finally {
      setRefreshing(false);
    }
  }, [role]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const session = await readSession();
      if (mounted && session.role && session.token && ['pharmacy', 'lab', 'doctor'].includes(session.role)) {
        const savedRole = session.role as Role;
        setRole(savedRole);
        await loadWorkspace(savedRole);
      }
    })();
    return () => { mounted = false; };
  }, [loadWorkspace]);

  useEffect(() => {
    if (!provider || role !== 'pharmacy') return;
    const refresh = setInterval(() => { void loadWorkspace('pharmacy'); }, 20000);
    return () => clearInterval(refresh);
  }, [provider?.id, role, loadWorkspace]);

  const openRegistration = async () => {
    setAuthMode('register');
    if (zones.length) return;
    try {
      const response = await partnerApi<any>('/api/v1/medical/config', { auth: false });
      const available: Zone[] = (response.zones ?? []).map((zone: Zone) => ({ ...zone, id: Number(zone.id) }));
      setZones(available);
      setZoneId(available[0]?.id ?? null);
      if (available[0]) {
        setRegisterForm((old) => ({
          ...old,
          city: old.city || available[0].city || '',
          pincode: old.pincode || available[0].pincode || '',
        }));
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load service areas.');
    }
  };

  const searchLocations = async () => {
    if (locationQuery.trim().length < 3) {
      setLocationNotice('Type at least 3 characters of an address, area, landmark, or PIN code.');
      return;
    }
    setLocationBusy(true);
    setLocationNotice('');
    try {
      const result = await partnerApi<{ data?: LocationChoice[] }>('/api/v1/zones/search', {
        method: 'POST',
        auth: false,
        body: { query: locationQuery.trim() },
      });
      setLocationChoices(result.data ?? []);
      if (!result.data?.length) setLocationNotice('No matching addresses found. Try a nearby landmark or PIN code.');
    } catch (error) {
      setLocationNotice(error instanceof Error ? error.message : 'Could not search for that address.');
    } finally {
      setLocationBusy(false);
    }
  };

  const selectLocationPin = (pin: LocationPin) => {
    const address = `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`;
    const choice = { ...pin, address };
    setMapPin(pin);
    setSelectedLocation(choice);
    setLocationQuery(address);
    setLocationChoices([]);
    setLocationNotice('Pin selected. Add this location to your premises.');
  };

  const openLocationPicker = () => {
    setLocationQuery(selectedLocation?.address || registerForm.address_line || '');
    setLocationChoices([]);
    setLocationNotice('');
    setModal('location');
  };

  const applySelectedLocation = async () => {
    if (!selectedLocation) {
      setLocationNotice('Search for an address or tap the map to place a pin first.');
      return;
    }
    setLocationBusy(true);
    setLocationNotice('Adding location…');
    let details = selectedLocation;
    try {
      try {
        const reverse = await partnerApi<{ data?: { address?: string; pincode?: string; city?: string } }>('/api/v1/zones/reverse-geocode', {
          method: 'POST',
          auth: false,
          body: { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude },
        });
        details = { ...selectedLocation, ...reverse.data, address: reverse.data?.address || selectedLocation.address };
      } catch { /* Fallback */ }
      const resolved = await partnerApi<{ data?: { zone?: Zone | null; serviceable?: boolean } }>('/api/v1/zones/resolve', {
        method: 'POST',
        auth: false,
        body: { latitude: details.latitude, longitude: details.longitude, pincode: details.pincode || '', city: details.city || '' },
      });
      const resolvedZone = resolved.data?.zone;
      if (!resolvedZone) {
        setLocationNotice('This pin is outside active service areas. Search for a nearby serviceable address or choose another map point.');
        return;
      }
      const previousZone = zones.find((zone) => Number(zone.id) === zoneId);
      const zoneChanged = !!previousZone && Number(previousZone.id) !== Number(resolvedZone.id);
      setZoneId(Number(resolvedZone.id));
      setMapPin({ latitude: details.latitude, longitude: details.longitude });
      setRegisterForm((old) => ({
        ...old,
        address_line: details.address || old.address_line,
        city: details.city || resolvedZone.city || old.city,
        pincode: details.pincode || '',
      }));
      setSelectedLocation(details);
      setLocationQuery(details.address);
      setLocationNotice('');
      setModal(null);
      setNotice(zoneChanged ? `Service area updated to ${resolvedZone.name}.` : 'Premises location confirmed.');
    } catch (error) {
      setLocationNotice(error instanceof Error ? error.message : 'Could not confirm this service area.');
    } finally {
      setLocationBusy(false);
    }
  };

  const submitAuth = async () => {
    if (!role) { setNotice('Choose one account type first.'); return; }
    setBusy(true);
    try {
      if (authMode === 'login') {
        const result = await partnerApi<any>('/api/v1/providers/login', {
          method: 'POST',
          auth: false,
          body: { provider_type: role, phone: auth.phone.trim(), password: auth.password },
        });
        await persistSession(result.token, role);
        setProvider(result.data);
        await loadWorkspace(role);
        setTab('Dashboard');
      } else {
        if (!zoneId) throw new Error('No active service area is available for registration.');
        if (!mapPin) throw new Error('Choose your premises on the map before submitting.');
        if (registerForm.password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const payload: AnyRow = {
          ...registerForm,
          provider_type: role,
          zone_id: zoneId,
          latitude: mapPin.latitude,
          longitude: mapPin.longitude,
          consultation_fee: Number(registerForm.consultation_fee || 0),
        };
        delete payload.password_confirm;
        await partnerApi('/api/v1/providers/register', { method: 'POST', auth: false, body: payload });
        setAuthMode('login');
        setAuth((old) => ({ ...old, phone: registerForm.phone }));
        setNotice('Registration submitted. Admin will verify licence and premises.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Sign-in or registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const enterDemoWorkspace = async () => {
    if (!role) { setNotice('Choose Pharmacy, Laboratory or Doctor first.'); return; }
    setBusy(true);
    try {
      const accounts = await partnerApi<{ data?: AnyRow[] }>('/api/v1/providers/demo-accounts', { auth: false });
      const account = (accounts.data ?? []).find((item) => item.provider_type === role);
      if (!account) throw new Error('No demo account is seeded yet. Please seed demo data in admin.');
      const result = await partnerApi<any>('/api/v1/providers/login', {
        method: 'POST',
        auth: false,
        body: { provider_type: role, phone: account.phone, password: DEMO_PASSWORD },
      });
      await persistSession(result.token, role);
      setProvider(result.data);
      setTab('Dashboard');
      await loadWorkspace(role);
      setNotice(`Demo ${titleCase(role)} workspace connected.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open demo workspace.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    setProvider(null);
    setWorkspace(null);
    setConversation(null);
    setMessages([]);
    setTab('Dashboard');
    setNotice('Signed out.');
  };

  const updateProvider = async () => {
    if (!provider) return;
    setBusy(true);
    const fields = [
      'name', 'business_name', 'email', 'address', 'city', 'description', 'opening_hours',
      'speciality', 'qualification', 'service_modes', 'availability_text', 'experience_years',
      'consultation_fee', 'service_radius_km', 'home_collection_fee', 'default_delivery_fee',
    ];
    const body = Object.fromEntries(fields.filter((key) => key in provider).map((key) => [key, provider[key]]));
    try {
      const result = await partnerApi<any>('/api/v1/providers/profile', { method: 'POST', body });
      setProvider(result.data);
      setNotice(result.message ?? 'Profile updated.');
      setModal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Profile could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const data = workspace ?? {};
  const tasks: AnyRow[] = data.data ?? [];
  const patients: AnyRow[] = data.patients ?? [];
  const analytics: AnyRow = data.analytics ?? {};
  const products: AnyRow[] = data.products ?? [];
  const orders: AnyRow[] = data.orders ?? [];
  const labTests: AnyRow[] = data.lab_tests ?? [];
  const conversations: AnyRow[] = data.conversations ?? [];
  const roleName = roles.find((entry) => entry.key === role)?.title ?? 'Partner';

  const updateStatus = async (kind: 'lab' | 'consultation' | 'order', id: number, status: string) => {
    try {
      await partnerApi(kind === 'order' ? `/api/v1/providers/orders/${id}/status` : `/api/v1/providers/${kind}/${id}/status`, {
        method: 'POST',
        body: { status },
      });
      setNotice(`Status updated to ${titleCase(status)}.`);
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update status.');
    }
  };

  const advanceAppointment = async (task: AnyRow) => {
    const kind = role === 'lab' ? 'lab' : 'consultation';
    const current = task.status;
    const next: Record<string, string> = role === 'lab'
      ? { requested: 'accepted', accepted: 'sample_collected', sample_collected: 'processing', processing: 'completed' }
      : { requested: 'confirmed', confirmed: 'in_progress', in_progress: 'completed' };
    const target = next[current];
    if (!target) {
      setNotice('No further transition available.');
      return;
    }
    if (kind === 'lab' && target === 'completed') {
      if (!reportUrl.trim() && !reportAsset) {
        setNotice('Choose a report file or enter report URL.');
        return;
      }
      setBusy(true);
      try {
        const body: AnyRow = { provider_note: '' };
        if (reportAsset) {
          let base64 = reportAsset.base64 ?? '';
          if (!base64) base64 = await FileSystem.readAsStringAsync(reportAsset.uri, { encoding: 'base64' });
          const mime = reportAsset.mimeType || (reportAsset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          body.report_base64 = `data:${mime};base64,${base64}`;
          body.file_name = reportAsset.name;
        } else {
          body.report_url = reportUrl.trim();
        }
        await partnerApi(`/api/v1/providers/lab-bookings/${task.id}/report`, { method: 'POST', body });
        setReportUrl('');
        setReportAsset(null);
        setNotice('Lab report uploaded successfully.');
        setModal(null);
        await loadWorkspace();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Report could not be submitted.');
      } finally {
        setBusy(false);
      }
      return;
    }
    await updateStatus(kind, Number(task.id), target);
  };

  const pickMedicineImage = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        let base64 = asset.base64;
        if (!base64) {
          base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
        }
        const mime = asset.mimeType || 'image/jpeg';
        setItemImageUri(asset.uri);
        setItemImageBase64(`data:${mime};base64,${base64}`);
        setNotice('Medicine image selected.');
      }
    } catch {
      setNotice('Could not open image picker.');
    }
  };

  const pickLabReport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setReportAsset(result.assets[0]);
      setReportUrl('');
      setNotice('Lab report file selected.');
    } catch {
      setNotice('Could not open the report file picker.');
    }
  };

  const submitInventoryItem = async () => {
    if (role !== 'pharmacy' && role !== 'lab') {
      setNotice('Only pharmacy partners can add medicines.');
      return;
    }
    const isLab = role === 'lab';
    const medName = itemForm.name.trim() || itemForm.description.trim();
    if (!isLab && (!medName || Number(itemForm.price || 0) <= 0)) {
      setNotice('Enter medicine name and a valid price above zero.');
      return;
    }
    const body = isLab
      ? {
          name: itemForm.name,
          code: itemForm.code,
          description: itemForm.description,
          price: Number(itemForm.price || 0),
          preparation: itemForm.preparation,
          report_hours: Number(itemForm.report_hours || 24),
          home_collection: true,
        }
      : {
          name: medName,
          description: itemForm.description.trim() || medName,
          unit: itemForm.unit.trim() || 'strip',
          stock: Number(itemForm.stock || 0),
          price: Number(itemForm.price || 0),
          discount_price: Number(itemForm.discount_price || 0) || null,
          sku: itemForm.sku.trim() || `MED-${Date.now().toString().slice(-6)}`,
          medicine_type: itemForm.medicine_type || 'otc',
          schedule_tag: itemForm.schedule_tag.trim(),
          max_qty_per_order: Number(itemForm.max_qty_per_order || 0) || null,
          max_qty_per_month: Number(itemForm.max_qty_per_month || 0) || null,
          requires_pharmacist_review: itemForm.requires_pharmacist_review,
          requires_age_confirmation: itemForm.requires_age_confirmation,
          allows_substitution: itemForm.allows_substitution,
          image_base64: itemImageBase64 || undefined,
          visible: true,
        };

    try {
      await partnerApi(isLab ? '/api/v1/providers/lab-tests' : '/api/v1/providers/products', { method: 'POST', body });
      setModal(null);
      setItemForm({
        name: '', description: '', unit: 'strip', stock: '0', price: '', discount_price: '',
        sku: '', medicine_type: 'otc', schedule_tag: '', max_qty_per_order: '', max_qty_per_month: '',
        requires_pharmacist_review: false, requires_age_confirmation: false, allows_substitution: true,
        code: '', preparation: '', report_hours: '24',
      });
      setItemImageUri(null);
      setItemImageBase64(null);
      setNotice(isLab ? 'Test added and connected to admin.' : 'Medicine added and connected to website catalogue!');
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save this item.');
    }
  };

  const downloadBulkTemplate = async () => {
    try {
      const worksheet = XLSX.utils.json_to_sheet([BULK_EXAMPLE_ROW], { header: [...BULK_COLUMNS] });
      worksheet['!cols'] = BULK_COLUMNS.map((column) => ({ wch: Math.max(12, column.length + 2) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
      const base64 = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }) as string;
      if (Platform.OS === 'web') {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: BULK_SHEET_MIME }));
        const anchor = document.createElement('a');
        anchor.href = url; anchor.download = BULK_FILE_NAME;
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        const destination = `${FileSystem.cacheDirectory ?? ''}${BULK_FILE_NAME}`;
        await FileSystem.writeAsStringAsync(destination, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(destination, { mimeType: BULK_SHEET_MIME, dialogTitle: 'Save bulk import template', UTI: 'public.spreadsheet' });
        } else {
          setBulkResult(`Template saved to ${destination}`);
        }
      }
      setBulkResult('Template ready. Fill one product per row (image as a URL), then upload it below.');
    } catch {
      setBulkResult('Could not generate the template on this device.');
    }
  };

  const pickBulkFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [BULK_SHEET_MIME, 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const asset = result.assets[0];
      let base64 = asset.base64;
      if (!base64) base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
      const workbook = XLSX.read(base64, { type: 'base64' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const parsed = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [];
      const rows = parsed.map(normalizeBulkRow).filter((row) => row.name !== '');
      setBulkRows(rows);
      setBulkFileName(asset.name);
      setBulkResult(rows.length
        ? `${rows.length} product row(s) ready to import from ${asset.name}.`
        : 'No valid rows found. Make sure the header row matches the template and a name is filled.');
    } catch {
      setBulkResult('Could not read that file. Please upload the .xlsx template you downloaded.');
    }
  };

  const submitBulkImport = async () => {
    if (!bulkRows.length) { setBulkResult('Upload a filled template first.'); return; }
    setBulkBusy(true);
    try {
      const response = await partnerApi<{ message?: string; imported?: number; skipped?: number; errors?: { row: number; message: string }[] }>('/api/v1/providers/products/bulk', { method: 'POST', body: { products: bulkRows } });
      const rowIssues = (response.errors ?? []).slice(0, 5).map((issue) => 'Row ' + issue.row + ': ' + issue.message);
      const moreIssues = (response.errors?.length ?? 0) > 5 ? 'And ' + ((response.errors?.length ?? 0) - 5) + ' more row note(s).' : '';
      setBulkResult([response.message || ((response.imported ?? 0) + ' product(s) imported.'), ...rowIssues, moreIssues].filter(Boolean).join('\n'));
      setBulkRows([]);
      setBulkFileName('');
      await loadWorkspace();
    } catch (error) {
      setBulkResult(error instanceof Error ? error.message : 'Bulk import failed.');
    } finally {
      setBulkBusy(false);
    }
  };

  const archiveItem = async (item: AnyRow) => {
    try {
      await partnerApi(`/api/v1/providers/${role === 'lab' ? 'lab-tests' : 'products'}/${item.id}`, { method: 'DELETE' });
      setNotice('Item archived.');
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not archive item.');
    }
  };

  const sendQuote = async () => {
    if (!quoteTask) return;
    try {
      const items = quoteForm.medicine_name.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const [medicine_name, pack = 'strip', quantity = '1', unit_price = '0'] = line.split('|').map((part) => part.trim());
        return { medicine_name, pack, quantity: Number(quantity || 1), unit_price: Number(unit_price || 0) };
      });
      if (!items.length || items.some((item) => !item.medicine_name || item.unit_price <= 0)) {
        setNotice('Add every medicine as name | pack | quantity | unit price.');
        return;
      }
      const result = await partnerApi<any>(`/api/v1/providers/prescription-requests/${quoteTask.id}/quote`, {
        method: 'POST',
        body: { items, delivery_fee: Number(quoteForm.delivery_fee || 0), note: quoteForm.note },
      });
      setModal(null);
      setQuoteTask(null);
      setNotice(result.message ?? 'Quote sent to patient.');
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send medicine quote.');
    }
  };

  const saveConsultationPrescription = async () => {
    if (!prescriptionTask) return;
    const items = prescriptionDraft.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name, strength = '', dosage = '', frequency = '', duration = '', instructions = ''] = line.split('|').map((part) => part.trim());
      return { name, strength, dosage, frequency, duration, instructions };
    });
    if (!items.length) { setNotice('Enter at least one medicine, one per line.'); return; }
    setBusy(true);
    try {
      const result = await partnerApi<any>(`/api/v1/providers/consultations/${prescriptionTask.id}/prescription`, { method: 'POST', body: { items } });
      setModal(null);
      setPrescriptionTask(null);
      setPrescriptionDraft('');
      setNotice(result.message ?? 'Prescription saved.');
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Prescription could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const markPickupReady = async (task: AnyRow) => {
    try {
      const result = await partnerApi<any>(`/api/v1/providers/prescription-requests/${task.id}/pickup-status`, { method: 'POST', body: { status: 'ready_for_pickup' } });
      setNotice(result.message ?? 'Patient notified that medicines are ready.');
      await loadWorkspace();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not update status.');
    }
  };

  const loadConversations = async () => {
    try {
      const result = await partnerApi<any>('/api/v1/providers/medical-chat');
      setWorkspace((old: any) => ({ ...old, conversations: result.data ?? [] }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load messages.');
    }
  };

  const openConversation = async (item: AnyRow) => {
    try {
      const response = await partnerApi<any>(`/api/v1/providers/medical-chat/${item.id}/show`);
      setConversation(item);
      setMessages(response.messages ?? []);
      setTab('Messages');
      await partnerApi(`/api/v1/providers/medical-chat/${item.id}/read`, { method: 'POST', body: {} });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not open conversation.');
    }
  };

  const sendMessage = async () => {
    if (!conversation || !draft.trim()) return;
    try {
      const response = await partnerApi<any>(`/api/v1/providers/medical-chat/${conversation.id}/send`, { method: 'POST', body: { text: draft.trim() } });
      setMessages((old) => [...old, ...(response.messages ?? [])]);
      setDraft('');
      await loadConversations();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Message could not be sent.');
    }
  };

  const updateProfileField = (key: string, value: string) => setProvider((old) => old ? ({ ...old, [key]: value }) : old);

  // SECTION RENDERERS
  const sectionHeader = (label: string, action?: { label: string; onPress: () => void }) => (
    <View style={s.sectionHeaderRow}>
      <Text style={s.sectionHeaderTitle}>{label}</Text>
      {action && (
        <Pressable onPress={action.onPress} style={s.sectionActionBtn}>
          <Text style={s.sectionActionBtnText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );

  // Stat metric cards row (Image 2)
  const metricCardsRow = () => {
    const completedCount = analytics.completed_tasks ?? tasks.filter((t) => t.status === 'completed').length;
    const paidRevenue = analytics.revenue ?? 0;
    return (
      <View style={s.metricCardsRow}>
        <View style={s.metricCard}>
          <View style={s.metricIconBadge}>
            <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor={C.teal} fallback={<Text style={{ color: C.teal, fontWeight: '900' }}>✓</Text>} />
          </View>
          <View style={s.metricTextStack}>
            <Text style={s.metricValue}>{String(completedCount)}</Text>
            <Text style={s.metricLabel}>Completed</Text>
          </View>
        </View>

        <View style={s.metricCard}>
          <View style={s.metricIconBadge}>
            <Text style={{ color: C.teal, fontSize: 18, fontWeight: '800' }}>₹</Text>
          </View>
          <View style={s.metricTextStack}>
            <Text style={s.metricValue}>{fmtMoney(paidRevenue)}</Text>
            <Text style={s.metricLabel}>Paid revenue</Text>
          </View>
        </View>
      </View>
    );
  };

  // Lab Booking Card (Matching Image 2 exactly)
  const labBookingCard = (task: AnyRow) => {
    const status = String(task.status ?? 'pending').toLowerCase();
    const actionLabel: Record<string, string> = { requested: 'Accept booking', accepted: 'Mark sample collected', sample_collected: 'Mark processing', processing: 'Upload report' };
    return (
      <View key={task.id} style={s.cardFrame}>
        <View style={s.cardTopRow}>
          <Text style={s.cardItemTitle}>{task.test_name || task.name || 'Lab test'}</Text>
          <View style={s.statusPillBadge}>
            <Text style={s.statusPillBadgeText}>{status}</Text>
          </View>
        </View>

        <View style={s.cardDetailsBox}>
          <Text style={s.cardDetailText}>{task.customer_phone || 'Phone not provided'}</Text>
          <Text style={s.cardDetailText}>Scheduled: {task.scheduled_at || task.created_at || 'Schedule not provided'}</Text>
          <Text style={s.cardDetailText}>Collection: {task.collection_type || 'Not specified'}</Text>
          <Text style={s.cardDetailText}>Address: {task.address || task.customer_address || 'Address not provided'}</Text>
        </View>

        <View style={s.cardActionsRow}>
          <Pressable disabled={!actionLabel[status]} onPress={() => { if (status === 'processing') { setSelectedDetailsItem(task); setReportAsset(null); setReportUrl(''); setModal('report'); } else { void advanceAppointment(task); } }} style={[s.solidTealButton, !actionLabel[status] && { opacity: 0.55 }]}>
            <SymbolView name={{ ios: 'arrow.triangle.2.circlepath', android: 'autorenew', web: 'autorenew' }} size={16} tintColor="#ffffff" fallback={<Text style={{ color: '#fff' }}>↻</Text>} />
            <Text style={s.solidTealButtonText}>{actionLabel[status] || titleCase(status)}</Text>
          </Pressable>

          <Pressable onPress={() => { setSelectedDetailsItem(task); setModal('details'); }} style={s.outlinedButton}>
            <SymbolView name={{ ios: 'eye', android: 'visibility', web: 'visibility' }} size={16} tintColor={C.teal} fallback={<Text style={{ color: C.teal }}>👁</Text>} />
            <Text style={s.outlinedButtonText}>View details</Text>
          </Pressable>

          <Pressable onPress={() => { setConversation(task); setTab('Messages'); }} style={s.outlinedButton}>
            <SymbolView name={{ ios: 'bubble.left', android: 'chat', web: 'chat' }} size={16} tintColor={C.teal} fallback={<Text style={{ color: C.teal }}>💬</Text>} />
            <Text style={s.outlinedButtonText}>Chat</Text>
          </Pressable>
        </View>

        <View style={s.pipelinePillsRow}>
          {['accepted', 'sample collected', 'processing'].map((step) => {
            const isCurrent = status === step.replace(/\s+/g, '_');
            return (
              <View key={step} style={[s.pipelinePill, isCurrent && s.pipelinePillActive]}>
                <Text style={[s.pipelinePillText, isCurrent && s.pipelinePillTextActive]}>{step}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Medicine Order Card (Pharmacy role - shows Delivery time, 30-60m express, 2hr slots, same day, next day!)
  const pharmacyOrderCard = (item: AnyRow) => {
    const status = (item.order_status || 'pending').toLowerCase();
    const nextTransitions: Record<string, string> = {
      pending: 'confirmed',
      confirmed: 'processing',
      processing: 'ready_for_pickup',
      ready_for_pickup: 'out_for_delivery',
      out_for_delivery: 'delivered',
    };
    const deliveryTiming = item.delivery_slot
      || (item.delivery_type === 'express' ? '30-60 mint delivery express' : item.delivery_type === 'same_day' ? 'Same day delivery' : item.delivery_type === 'next_day' ? 'Next day delivery' : item.expected_delivery || 'Not specified');

    return (
      <View key={item.id} style={s.cardFrame}>
        <View style={s.cardTopRow}>
          <Text style={s.cardItemTitle}>{item.order_number || `ORDER #${item.id}`}</Text>
          <View style={s.statusPillBadge}>
            <Text style={s.statusPillBadgeText}>{status.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        <View style={s.cardDetailsBox}>
          <Text style={s.cardDetailText}>{item.customer_phone || 'Phone not provided'}</Text>
          <Text style={s.cardDetailText}>Scheduled: {item.created_at || 'Date not provided'}</Text>
          <Text style={[s.cardDetailText, { fontWeight: '700', color: C.teal }]}>
            Delivery: {deliveryTiming}
          </Text>
          <Text style={s.cardDetailText}>Address: {item.address || 'Address not provided'}</Text>
          {(item.items ?? []).map((prod: AnyRow, i: number) => (
            <Text key={`${prod.id}-${i}`} style={[s.cardDetailText, { color: C.heading }]}>
              • {prod.product_name || prod.name} x {prod.quantity} ({fmtMoney(prod.total || prod.price)})
            </Text>
          ))}
          <Text style={[s.cardDetailText, { fontWeight: '800', color: C.ink, marginTop: 4 }]}>
            Total: {fmtMoney(item.order_amount)}
          </Text>
        </View>

        <View style={s.cardActionsRow}>
          {nextTransitions[status] && (
            <Pressable onPress={() => void updateStatus('order', Number(item.id), nextTransitions[status])} style={s.solidTealButton}>
              <Text style={s.solidTealButtonText}>{`Mark ${titleCase(nextTransitions[status])}`}</Text>
            </Pressable>
          )}

          <Pressable onPress={() => { setSelectedDetailsItem(item); setModal('details'); }} style={s.outlinedButton}>
            <SymbolView name={{ ios: 'eye', android: 'visibility', web: 'visibility' }} size={16} tintColor={C.teal} />
            <Text style={s.outlinedButtonText}>View details</Text>
          </Pressable>

          <Pressable onPress={() => { setConversation(item); setTab('Messages'); }} style={s.outlinedButton}>
            <SymbolView name={{ ios: 'bubble.left', android: 'chat', web: 'chat' }} size={16} tintColor={C.teal} />
            <Text style={s.outlinedButtonText}>Chat</Text>
          </Pressable>
        </View>

        <View style={s.pipelinePillsRow}>
          {['pending', 'confirmed', 'processing', 'out for delivery', 'delivered'].map((step) => {
            const isCurrent = status === step.replace(/\s+/g, '_');
            return (
              <View key={step} style={[s.pipelinePill, isCurrent && s.pipelinePillActive]}>
                <Text style={[s.pipelinePillText, isCurrent && s.pipelinePillTextActive]}>{step}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  // Medicine Item in Catalogue List
  const medicineCatalogueCard = (item: AnyRow) => (
    <View key={item.id} style={s.medicineCardRow}>
      {item.thumbnail ? (
        <Image
          source={{ uri: item.thumbnail.startsWith('http') ? item.thumbnail : `${apiBaseUrl()}${item.thumbnail}` }}
          style={s.medicineThumbnail}
        />
      ) : (
        <View style={s.medicineThumbnailFallback}>
          <Text style={{ fontSize: 22 }}>💊</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.medicineTitle}>{item.name}</Text>
        <Text style={s.medicinePriceText}>
          {fmtMoney(item.discount_price || item.price)} · Stock: {item.stock} {item.unit || 'strip'}
        </Text>
        <Text style={s.medicineSubText}>
          {item.medicine_type === 'otc' ? 'OTC medicine' : 'Prescription required'} {item.status ? '· Active' : '· Pending review'}
        </Text>
      </View>
      <Pressable onPress={() => void archiveItem(item)} style={s.archiveBtn}>
        <Text style={s.archiveBtnText}>Archive</Text>
      </Pressable>
    </View>
  );

  // Consultation Card (Doctor role)
  const consultationCard = (task: AnyRow) => {
    const status = String(task.status ?? 'requested').toLowerCase();
    const nextText = status === 'requested' ? 'Confirm appointment' : status === 'confirmed' ? 'Start consultation' : 'Complete consultation';
    return (
      <View key={task.id} style={s.cardFrame}>
        <View style={s.cardTopRow}>
          <Text style={s.cardItemTitle}>{task.customer_name || 'Patient consultation'}</Text>
          <View style={s.statusPillBadge}>
            <Text style={s.statusPillBadgeText}>{status}</Text>
          </View>
        </View>
        <View style={s.cardDetailsBox}>
          <Text style={s.cardDetailText}>{task.customer_phone || ''}</Text>
          <Text style={s.cardDetailText}>Scheduled: {task.scheduled_at || task.created_at || ''}</Text>
          <Text style={s.cardDetailText}>Reason: {task.reason || 'General medical consultation'}</Text>
        </View>
        <View style={s.cardActionsRow}>
          <Pressable onPress={() => void advanceAppointment(task)} style={s.solidTealButton}>
            <Text style={s.solidTealButtonText}>{nextText}</Text>
          </Pressable>
          <Pressable onPress={() => { setSelectedDetailsItem(task); setModal('details'); }} style={s.outlinedButton}>
            <Text style={s.outlinedButtonText}>Details</Text>
          </Pressable>
          <Pressable onPress={() => { setPrescriptionTask(task); setModal('prescription'); }} style={s.outlinedButton}>
            <Text style={s.outlinedButtonText}>Prescription</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // Prescription Request Card
  const prescriptionRequestCard = (task: AnyRow) => (
    <View key={task.id} style={s.cardFrame}>
      <View style={s.cardTopRow}>
        <Text style={s.cardItemTitle}>Rx Request #{task.id}</Text>
        <View style={s.statusPillBadge}>
          <Text style={s.statusPillBadgeText}>{titleCase(task.status).toLowerCase()}</Text>
        </View>
      </View>
      <View style={s.cardDetailsBox}>
        <Text style={s.cardDetailText}>{task.customer_phone || 'Phone not provided'}</Text>
        <Text style={s.cardDetailText}>Customer: {task.customer_name || 'Patient'}</Text>
        <Text style={s.cardDetailText}>Scheduled: {task.created_at || ''}</Text>
        {(task.medicine_list ?? []).map((m: AnyRow, idx: number) => (
          <Text key={idx} style={[s.cardDetailText, { color: C.heading }]}>• {m.name} {m.strength ? `(${m.strength})` : ''} - Qty {m.quantity || 1}</Text>
        ))}
      </View>
      <View style={s.cardActionsRow}>
        <Pressable
          onPress={() => {
            setQuoteTask(task);
            setQuoteForm((old) => ({
              ...old,
              medicine_name: (task.medicine_list ?? []).map((item: AnyRow) => `${item.name}${item.strength ? ` (${item.strength})` : ''} | ${item.pack || 'strip'} | ${item.quantity || 1} | `).join('\n'),
            }));
            setModal('quote');
          }}
          style={s.solidTealButton}
        >
          <Text style={s.solidTealButtonText}>Prepare quote</Text>
        </Pressable>
        {task.status === 'payment_pending' && (
          <Pressable onPress={() => void markPickupReady(task)} style={s.outlinedButton}>
            <Text style={s.outlinedButtonText}>Mark ready</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // DASHBOARD SCREEN (Matches Image 2 exactly)
  const dashboardScreen = () => (
    <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
      {metricCardsRow()}

      {role === 'lab' && (
        <>
          {sectionHeader('Lab bookings', { label: 'Refresh', onPress: () => void loadWorkspace() })}
          {tasks.length ? tasks.map(labBookingCard) : <View style={s.emptyBox}><Text style={s.emptyTitle}>No lab bookings yet</Text><Text style={s.emptySub}>New bookings from the customer app will appear here.</Text></View>}
        </>
      )}

      {role === 'pharmacy' && (
        <>
          {sectionHeader('Medicine orders', { label: 'Refresh', onPress: () => void loadWorkspace() })}
          {orders.length ? orders.map(pharmacyOrderCard) : <View style={s.emptyBox}><Text style={s.emptyTitle}>No medicine orders yet</Text><Text style={s.emptySub}>New customer orders will appear here.</Text></View>}

          {sectionHeader('Prescription requests')}
          {tasks.filter((t) => !t.test_name).map(prescriptionRequestCard)}

          {sectionHeader('Medicine catalogue', { label: '+ Add medicine', onPress: () => setModal('item') })}
          {products.map(medicineCatalogueCard)}
        </>
      )}

      {role === 'doctor' && (
        <>
          {sectionHeader('Consultations', { label: 'Refresh', onPress: () => void loadWorkspace() })}
          {tasks.map(consultationCard)}
        </>
      )}
    </ScrollView>
  );

  // PATIENTS SCREEN
  const patientsScreen = () => (
    <ScrollView contentContainerStyle={s.scrollContent}>
      {sectionHeader('Patients', { label: 'Refresh', onPress: () => void loadWorkspace() })}
      {patients.length ? patients.map((patient, index) => (
        <View key={index} style={s.patientRow}>
          <View style={s.patientAvatar}>
            <Text style={s.patientAvatarText}>{(patient.customer_name || 'P').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.patientName}>{patient.customer_name || 'Patient'}</Text>
            <Text style={s.patientPhone}>{patient.customer_phone || 'Phone not available'} · {patient.visits || 1} visit(s)</Text>
            <Text style={s.patientSub}>Last appointment: {patient.last_visit || 'Recent'}</Text>
          </View>
        </View>
      )) : (
        <View style={s.emptyBox}>
          <Text style={s.emptyTitle}>No patients yet</Text>
          <Text style={s.emptySub}>Assigned patient records will appear here.</Text>
        </View>
      )}
    </ScrollView>
  );

  // MESSAGES SCREEN
  const messagesScreen = () => (
    <ScrollView contentContainerStyle={s.scrollContent}>
      {conversation ? (
        <View style={s.chatBox}>
          <Pressable onPress={() => setConversation(null)} style={s.backRow}>
            <Text style={s.backText}>‹ All messages</Text>
          </Pressable>
          <Text style={s.chatTitle}>{conversation.customer_name || 'Patient'}</Text>
          <ScrollView style={s.chatList}>
            {messages.map((m, i) => (
              <View key={i} style={[s.msgBubble, m.sender_type === 'provider' && s.msgBubbleMine]}>
                <Text style={s.msgText}>{m.body}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={s.chatInputRow}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message..." placeholderTextColor={C.placeholder} style={s.chatInput} />
            <Pressable onPress={() => void sendMessage()} style={s.chatSendBtn}>
              <Text style={s.chatSendBtnText}>Send</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          {sectionHeader('Messages', { label: 'Refresh', onPress: () => void loadConversations() })}
          {conversations.length ? conversations.map((item) => (
            <Pressable key={item.id} onPress={() => void openConversation(item)} style={s.convRow}>
              <View style={s.patientAvatar}>
                <Text style={s.patientAvatarText}>{(item.customer_name || 'P').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.patientName}>{item.customer_name || 'Patient'}</Text>
                <Text style={s.patientSub}>{item.last_message || 'New conversation'}</Text>
              </View>
            </Pressable>
          )) : (
            <View style={s.emptyBox}>
              <Text style={s.emptyTitle}>No messages yet</Text>
              <Text style={s.emptySub}>Direct messages from patients will appear here.</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  // ANALYTICS SCREEN
  const analyticsScreen = () => (
    <ScrollView contentContainerStyle={s.scrollContent}>
      {sectionHeader('Analytics overview')}
      {metricCardsRow()}
      <View style={s.analyticsDetailCard}>
        <Text style={s.analyticsDetailTitle}>Operational Performance</Text>
        <Text style={s.analyticsDetailSub}>Total tasks: {analytics.total_tasks || tasks.length}</Text>
        <Text style={s.analyticsDetailSub}>Completed tasks: {analytics.completed_tasks ?? 0}</Text>
        <Text style={s.analyticsDetailSub}>Pending tasks: {analytics.pending_tasks || 0}</Text>
        <Text style={s.analyticsDetailSub}>Revenue: {fmtMoney(analytics.revenue ?? 0)}</Text>
      </View>
    </ScrollView>
  );

  // ACCOUNT SCREEN — redesigned to match screenshot style
  const accountScreen = () => {
    const bizName = provider?.business_name || provider?.name || 'Partner';
    const verificationStatus = typeof provider?.status === 'string' ? provider.status : (provider?.status === 1 ? 'approved' : (provider?.status === 0 ? 'pending' : 'unknown'));
    const verificationPhone = provider?.phone || provider?.license_number || '';
    const deliveryFee = provider?.default_delivery_fee ?? 0;
    const openingHours = provider?.opening_hours || 'Not set';
    const serviceRadius = provider?.service_radius_km ?? provider?.service_radius ?? 0;

    return (
      <ScrollView contentContainerStyle={[s.scrollContent, { paddingTop: 0 }]} showsVerticalScrollIndicator={false}>
        {/* Gradient Header Card */}
        <View style={s.acctGradientCard}>
          <Text style={s.acctGradientName}>{bizName.toLowerCase()}</Text>
          <Text style={s.acctGradientSub}>{roleName.toLowerCase()} • {provider?.city || 'Verified Zone'}</Text>
        </View>

        {/* Settings List Card */}
        <View style={s.acctSettingsCard}>
          {/* Professional profile */}
          <Pressable onPress={() => setModal('profile')} style={s.acctSettingsRow}>
            <View style={s.acctSettingsIconWrap}>
              <AppIcon name="profile" size={20} color={C.ink} />
            </View>
            <View style={s.acctSettingsInfo}>
              <Text style={s.acctSettingsTitle}>Professional profile</Text>
              <Text style={s.acctSettingsSub}>{bizName} • {provider?.city || 'City'} • {provider?.phone || ''}</Text>
            </View>
            <AppIcon name="arrow" size={16} color={C.muted} />
          </Pressable>

          <View style={s.acctDivider} />

          {/* Verification */}
          <View style={s.acctSettingsRow}>
            <View style={s.acctSettingsIconWrap}>
              <AppIcon name="verified" size={20} color={C.ink} />
            </View>
            <View style={s.acctSettingsInfo}>
              <Text style={s.acctSettingsTitle}>Verification</Text>
              <Text style={s.acctSettingsSub}>{verificationPhone} • {verificationStatus}</Text>
            </View>
          </View>

          <View style={s.acctDivider} />

          {/* Appearance */}
          <Pressable onPress={() => setModal('appearance')} style={s.acctSettingsRow}>
            <View style={s.acctSettingsIconWrap}>
              <AppIcon name="appearance" size={20} color={C.ink} />
            </View>
            <View style={s.acctSettingsInfo}>
              <Text style={s.acctSettingsTitle}>Appearance</Text>
              <Text style={s.acctSettingsSub}>Switch between light and dark mode</Text>
            </View>
            <AppIcon name="arrow" size={16} color={C.muted} />
          </Pressable>
        </View>

        {/* Pharmacy Settings */}
        {role === 'pharmacy' && (
          <View style={s.acctPharmacyCard}>
            <View style={s.acctPharmacyHeader}>
              <Text style={s.acctPharmacyTitle}>Pharmacy settings</Text>
              <Pressable onPress={() => setModal('profile')}>
                <Text style={s.acctPharmacyEdit}>Edit</Text>
              </Pressable>
            </View>
            <Text style={s.acctPharmacyLine}>Default delivery: ₹{Number(deliveryFee).toFixed(2)}</Text>
            <Text style={s.acctPharmacyLine}>Opening hours: {openingHours}</Text>
            <Text style={s.acctPharmacyLine}>Service radius: {Number(serviceRadius).toFixed(2)} km</Text>
          </View>
        )}

        {/* Medicine Catalogue */}
        {role === 'pharmacy' && (
          <>
            <View style={s.acctCatalogHeader}>
              <Text style={s.acctCatalogTitle}>Medicine catalogue</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'stretch', width: '100%' }}>
                <Pressable
                  onPress={() => setModal('bulk')}
                  style={[s.acctCatalogAddBtn, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }]}
                >
                  <Text numberOfLines={1} style={[s.acctCatalogAddBtnText, { color: C.ink }]}>Bulk import</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setItemForm({ name: '', description: '', unit: 'strip', stock: '0', price: '', discount_price: '', sku: '', medicine_type: 'otc', schedule_tag: '', max_qty_per_order: '', max_qty_per_month: '', requires_pharmacist_review: false, requires_age_confirmation: false, allows_substitution: true, code: '', preparation: '', report_hours: '24' });
                    setItemImageUri(null);
                    setItemImageBase64(null);
                    setModal('item');
                  }}
                  style={[s.acctCatalogAddBtn, { flex: 1, minWidth: 0 }]}
                >
                  <Text numberOfLines={1} style={s.acctCatalogAddBtnText}>+ Add product</Text>
                </Pressable>
              </View>
            </View>

            {products.length === 0 ? (
              <View style={s.acctEmptyBox}>
                <AppIcon name="pharmacy" size={28} color={C.muted} />
                <Text style={{ color: C.muted, marginTop: 8, fontSize: 13 }}>No medicines added yet.</Text>
              </View>
            ) : (
              products.map((item) => (
                <View key={String(item.id)} style={s.acctMedCard}>
                  {(item.thumbnail_full_url || item.thumbnail) ? (
                    <Image source={{ uri: (item.thumbnail_full_url || item.thumbnail).startsWith('http') ? (item.thumbnail_full_url || item.thumbnail) : `${apiBaseUrl()}/${String(item.thumbnail_full_url || item.thumbnail).replace(/^\//, '')}` }} style={s.acctMedThumb} />
                  ) : (
                    <View style={[s.acctMedThumb, s.acctMedThumbFallback]}>
                      <AppIcon name="pharmacy" size={22} color={C.teal} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.acctMedName}>{item.name}</Text>
                    <Text style={s.acctMedSub}>Stock: {item.stock ?? 0} {item.unit || 'strip'} • {item.status === 1 ? 'Visible' : 'Hidden'}</Text>
                  </View>
                  <Text style={s.acctMedPrice}>₹{Number(item.price || 0).toFixed(2)}</Text>
                </View>
              ))
            )}
          </>
        )}

        {/* Sign out */}
        <Pressable onPress={() => void signOut()} style={s.acctSignOutBtn}>
          <AppIcon name="signout" size={18} color={C.ink} />
          <Text style={s.acctSignOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    );
  };

  // AUTH SCREEN
  const authScreen = () => (
    <ScrollView contentContainerStyle={s.authScrollContent} keyboardShouldPersistTaps="handled">
      <View style={s.authLogoBox}>
        <Text style={s.authLogoText}>A<Text style={{ color: C.teal }}>+</Text></Text>
        <Text style={s.authLogoSub}>AIMEDIX HEALTH</Text>
      </View>
      <Text style={s.authHeading}>Healthcare Partner Portal</Text>
      <Text style={s.authSub}>Access your operations for pharmacy, laboratory or clinic.</Text>

      <View style={s.roleSelectorRow}>
        {roles.map((r) => (
          <Pressable key={r.key} onPress={() => { setRole(r.key); setNotice(''); }} style={[s.roleSelectorItem, role === r.key && s.roleSelectorItemActive]}>
            <AppIcon name={r.icon} size={16} color={role === r.key ? C.teal : C.muted} />
            <Text style={[s.roleSelectorItemText, role === r.key && s.roleSelectorItemTextActive]}>{r.title}</Text>
          </Pressable>
        ))}
      </View>

      {role && (
        <View style={s.authCardBox}>
          <Text style={s.authCardTitle}>{authMode === 'login' ? `${roleName} sign in` : `Register as ${roleName}`}</Text>
          {authMode === 'login' ? (
            <>
              <View style={s.inputContainer}>
                <TextInput value={auth.phone} onChangeText={(v) => setAuth((o) => ({ ...o, phone: v }))} placeholder="Phone number" placeholderTextColor={C.placeholder} keyboardType="phone-pad" style={s.formInput} />
              </View>
              <View style={s.inputContainer}>
                <TextInput value={auth.password} onChangeText={(v) => setAuth((o) => ({ ...o, password: v }))} placeholder="Password" placeholderTextColor={C.placeholder} secureTextEntry style={s.formInput} />
              </View>
              <Pressable disabled={busy} onPress={() => void submitAuth()} style={s.submitMedicineButton}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.submitMedicineButtonText}>Sign in</Text>}
              </Pressable>
              <Pressable disabled={busy} onPress={() => void enterDemoWorkspace()} style={s.demoLoginBtn}>
                <Text style={s.demoLoginBtnText}>{busy ? 'Opening...' : `Enter ${roleName.toLowerCase()} demo workspace`}</Text>
              </Pressable>
              <Pressable onPress={() => void openRegistration()} style={{ alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: C.teal, fontWeight: '700', fontSize: 13 }}>Register new partner</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={s.inputContainer}>
                <TextInput value={registerForm.name} onChangeText={(v) => setRegisterForm((o) => ({ ...o, name: v }))} placeholder="Owner / Doctor name" placeholderTextColor={C.placeholder} style={s.formInput} />
              </View>
              <View style={s.inputContainer}>
                <TextInput value={registerForm.business_name} onChangeText={(v) => setRegisterForm((o) => ({ ...o, business_name: v }))} placeholder="Business / Clinic name" placeholderTextColor={C.placeholder} style={s.formInput} />
              </View>
              <View style={s.inputContainer}>
                <TextInput value={registerForm.phone} onChangeText={(v) => setRegisterForm((o) => ({ ...o, phone: v }))} placeholder="Phone number" placeholderTextColor={C.placeholder} keyboardType="phone-pad" style={s.formInput} />
              </View>
              <View style={s.inputContainer}>
                <TextInput value={registerForm.password} onChangeText={(v) => setRegisterForm((o) => ({ ...o, password: v }))} placeholder="Password (min 8 chars)" placeholderTextColor={C.placeholder} secureTextEntry style={s.formInput} />
              </View>
              <Pressable onPress={openLocationPicker} style={s.mapPickerTrigger}>
                <Text style={{ color: C.ink, fontWeight: '700' }}>{mapPin ? 'Premises pin selected ✓' : 'Pick location on map'}</Text>
              </Pressable>
              <Pressable disabled={busy} onPress={() => void submitAuth()} style={s.submitMedicineButton}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.submitMedicineButtonText}>Submit registration</Text>}
              </Pressable>
              <Pressable onPress={() => setAuthMode('login')} style={{ alignItems: 'center', marginTop: 14 }}>
                <Text style={{ color: C.teal, fontWeight: '700', fontSize: 13 }}>Back to sign in</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {notice ? <Text style={s.noticeBanner}>{notice}</Text> : null}
    </ScrollView>
  );

  const activeContent = useMemo(() => {
    switch (tab) {
      case 'Dashboard': return dashboardScreen();
      case 'Patients': return patientsScreen();
      case 'Messages': return messagesScreen();
      case 'Analytics': return analyticsScreen();
      case 'Account': return accountScreen();
      default: return dashboardScreen();
    }
  }, [tab, workspace, provider, conversation, messages, draft, reportUrl, products, labTests, orders, patients, tasks, analytics, notice, role, refreshing, appearance, itemForm, itemImageUri, s]);

    const renderModalContent = () => {
    if (modal === 'profile') {
      const fields = role === 'pharmacy'
        ? [{ key: 'business_name', label: 'Pharmacy name' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'opening_hours', label: 'Opening hours' }, { key: 'default_delivery_fee', label: 'Default delivery fee' }, { key: 'service_radius_km', label: 'Service radius (km)' }]
        : role === 'lab'
          ? [{ key: 'business_name', label: 'Laboratory name' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Address' }, { key: 'city', label: 'City' }, { key: 'opening_hours', label: 'Opening hours' }, { key: 'home_collection_fee', label: 'Home collection fee' }]
          : [{ key: 'name', label: 'Doctor name' }, { key: 'email', label: 'Email' }, { key: 'address', label: 'Clinic address' }, { key: 'city', label: 'City' }, { key: 'speciality', label: 'Speciality' }, { key: 'qualification', label: 'Qualification' }, { key: 'experience_years', label: 'Experience (years)' }, { key: 'consultation_fee', label: 'Consultation fee' }, { key: 'availability_text', label: 'Availability' }];
      return (
        <View style={s.addMedicineModalContainer}>
          <Text style={s.addMedicineTitle}>Professional profile</Text>
          {fields.map((field) => (
            <View key={field.key} style={s.inputContainer}>
              <TextInput
                value={String(provider?.[field.key] ?? '')}
                onChangeText={(value) => updateProfileField(field.key, value)}
                placeholder={field.label}
                placeholderTextColor={C.placeholder}
                keyboardType={['default_delivery_fee', 'service_radius_km', 'home_collection_fee', 'experience_years', 'consultation_fee'].includes(field.key) ? 'decimal-pad' : 'default'}
                multiline={field.key === 'address' || field.key === 'availability_text'}
                style={s.formInput}
              />
            </View>
          ))}
          <Pressable disabled={busy} onPress={() => void updateProvider()} style={s.submitMedicineButton}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.submitMedicineButtonText}>Save profile to admin</Text>}
          </Pressable>
        </View>
      );
    }

    if (modal === 'report' && selectedDetailsItem) {
      return (
        <View style={s.addMedicineModalContainer}>
          <Text style={s.addMedicineTitle}>Upload lab report</Text>
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>Attach a PDF or image, or provide a secure report URL. Submitting completes this booking and makes the report available to the customer.</Text>
          <Pressable onPress={() => void pickLabReport()} style={s.outlinedButton}>
            <Text style={s.outlinedButtonText}>{reportAsset?.name || 'Choose PDF or image'}</Text>
          </Pressable>
          <TextInput value={reportUrl} onChangeText={(value) => { setReportUrl(value); if (value) setReportAsset(null); }} placeholder="Or paste report URL" placeholderTextColor={C.placeholder} autoCapitalize="none" keyboardType="url" style={s.formInput} />
          <View style={s.modalFooterRow}>
            <Pressable onPress={() => setModal(null)} style={s.cancelTextButton}><Text style={s.cancelTextButtonLabel}>Cancel</Text></Pressable>
            <Pressable disabled={busy || (!reportUrl.trim() && !reportAsset)} onPress={() => void advanceAppointment(selectedDetailsItem)} style={[s.submitMedicineButton, { opacity: busy || (!reportUrl.trim() && !reportAsset) ? 0.5 : 1 }]}>
              <Text style={s.submitMedicineButtonText}>{busy ? 'Uploading…' : 'Submit report'}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (modal === 'appearance') {
      return (
        <View style={s.addMedicineModalContainer}>
          <Text style={s.addMedicineTitle}>Appearance</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 10 }}>Choose how AIMEDIX Partner looks on this device. Your choice is remembered.</Text>
          {(['Light', 'Dark', 'System'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => { setAppearance(option); void saveAppearanceSetting(option); setModal(null); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }}
            >
              <AppIcon name={appearance === option ? 'check' : 'radio'} size={20} color={appearance === option ? C.teal : C.muted} />
              <Text style={{ color: C.ink, fontSize: 15, fontWeight: '600' }}>{option === 'System' ? 'System default' : option}</Text>
            </Pressable>
          ))}
        </View>
      );
    }
    if (modal === 'item') {
      return (
        <View style={s.addMedicineModalContainer}>
          <Text style={s.addMedicineTitle}>Add medicine</Text>

          {/* Description / Name Field */}
          <View style={s.inputContainer}>
            <TextInput
              value={itemForm.name || itemForm.description}
              onChangeText={(text) => setItemForm((prev) => ({ ...prev, name: text, description: text }))}
              placeholder="Description"
              placeholderTextColor={C.placeholder}
              style={s.formInput}
            />
          </View>

          {/* Unit / pack and Stock Row */}
          <View style={s.formRowTwoCol}>
            <View style={[s.inputContainer, { flex: 1 }]}>
              <Text style={s.floatingInputLabel}>Unit / pack</Text>
              <TextInput
                value={itemForm.unit}
                onChangeText={(text) => setItemForm((prev) => ({ ...prev, unit: text }))}
                placeholder="strip"
                placeholderTextColor={C.placeholder}
                style={s.formInput}
              />
            </View>
            <View style={[s.inputContainer, { flex: 1 }]}>
              <Text style={s.floatingInputLabel}>Stock</Text>
              <TextInput
                value={itemForm.stock}
                onChangeText={(text) => setItemForm((prev) => ({ ...prev, stock: text }))}
                placeholder="0"
                placeholderTextColor={C.placeholder}
                keyboardType="number-pad"
                style={s.formInput}
              />
            </View>
          </View>

          {/* Price ₹ and Offer price Row */}
          <View style={s.formRowTwoCol}>
            <View style={[s.inputContainer, { flex: 1 }]}>
              <TextInput
                value={itemForm.price}
                onChangeText={(text) => setItemForm((prev) => ({ ...prev, price: text }))}
                placeholder="Price ₹"
                placeholderTextColor={C.placeholder}
                keyboardType="decimal-pad"
                style={s.formInput}
              />
            </View>
            <View style={[s.inputContainer, { flex: 1 }]}>
              <TextInput
                value={itemForm.discount_price}
                onChangeText={(text) => setItemForm((prev) => ({ ...prev, discount_price: text }))}
                placeholder="Offer price..."
                placeholderTextColor={C.placeholder}
                keyboardType="decimal-pad"
                style={s.formInput}
              />
            </View>
          </View>

          {/* SKU / stock code */}
          <View style={s.inputContainer}>
            <TextInput
              value={itemForm.sku}
              onChangeText={(text) => setItemForm((prev) => ({ ...prev, sku: text }))}
              placeholder="SKU / stock code"
              placeholderTextColor={C.placeholder}
              style={s.formInput}
            />
          </View>

          {/* Medicine type dropdown */}
          <Pressable
            onPress={() => {
              const types = ['otc', 'prescription_required', 'restricted'];
              const curIdx = types.indexOf(itemForm.medicine_type);
              const nextType = types[(curIdx + 1) % types.length];
              setItemForm((prev) => ({ ...prev, medicine_type: nextType }));
            }}
            style={s.dropdownContainer}
          >
            <Text style={s.floatingInputLabel}>Medicine type</Text>
            <View style={s.dropdownValueRow}>
              <Text style={s.dropdownValueText}>
                {itemForm.medicine_type === 'otc' ? 'OTC medicine' : itemForm.medicine_type === 'prescription_required' ? 'Prescription medicine' : 'Restricted medicine'}
              </Text>
              <Text style={s.dropdownArrow}>▼</Text>
            </View>
          </Pressable>

          {/* Schedule tag (optional) */}
          <View style={s.inputContainer}>
            <TextInput
              value={itemForm.schedule_tag}
              onChangeText={(text) => setItemForm((prev) => ({ ...prev, schedule_tag: text }))}
              placeholder="Schedule tag (optional)"
              placeholderTextColor={C.placeholder}
              style={s.formInput}
            />
          </View>

          {/* Toggle Switch 1: Pharmacist / prescription review */}
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>
              Pharmacist/{"\n"}prescription review
            </Text>
            <Switch
              value={itemForm.requires_pharmacist_review}
              onValueChange={(val) => setItemForm((prev) => ({ ...prev, requires_pharmacist_review: val }))}
              trackColor={{ false: C.borderStrong, true: C.tealSoft }}
              thumbColor={itemForm.requires_pharmacist_review ? C.teal : C.bgAlt}
            />
          </View>

          {/* Toggle Switch 2: Age confirmation required */}
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>
              Age confirmation{"\n"}required
            </Text>
            <Switch
              value={itemForm.requires_age_confirmation}
              onValueChange={(val) => setItemForm((prev) => ({ ...prev, requires_age_confirmation: val }))}
              trackColor={{ false: C.borderStrong, true: C.tealSoft }}
              thumbColor={itemForm.requires_age_confirmation ? C.teal : C.bgAlt}
            />
          </View>

          {/* Add medicine image Button */}
          {itemImageUri ? (
            <View style={s.imagePreviewContainer}>
              <Image source={{ uri: itemImageUri }} style={s.previewThumbnail} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink }}>Medicine image selected</Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  <Pressable onPress={() => void pickMedicineImage()}>
                    <Text style={{ color: C.teal, fontWeight: '700', fontSize: 13 }}>Change</Text>
                  </Pressable>
                  <Pressable onPress={() => { setItemImageUri(null); setItemImageBase64(null); }}>
                    <Text style={{ color: C.danger, fontWeight: '700', fontSize: 13 }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => void pickMedicineImage()} style={s.addImageButton}>
              <SymbolView name={{ ios: 'photo.badge.plus', android: 'add_photo_alternate', web: 'add_photo_alternate' }} size={20} tintColor={C.teal} fallback={<Text style={{ color: C.teal, fontSize: 18 }}>🖼</Text>} />
              <Text style={s.addImageButtonText}>Add medicine image</Text>
            </Pressable>
          )}

          {/* Modal footer actions */}
          <View style={s.modalFooterRow}>
            <Pressable onPress={() => setModal(null)} style={s.cancelTextButton}>
              <Text style={s.cancelTextButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => void submitInventoryItem()} style={s.submitMedicineButton}>
              <Text style={s.submitMedicineButtonText}>Add medicine</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    if (modal === 'details' && selectedDetailsItem) {
      const itm = selectedDetailsItem;
      const isLab = role === 'lab';
      return (
        <View style={s.modalInnerPad}>
          <Text style={s.addMedicineTitle}>{itm.test_name || itm.order_number || itm.name || 'Details'}</Text>
          <View style={{ marginVertical: 10, gap: 8 }}>
            <Text style={s.cardDetailText}>Status: <Text style={{ fontWeight: '700', color: C.teal }}>{titleCase(itm.status || itm.order_status || 'completed')}</Text></Text>
            <Text style={s.cardDetailText}>Phone: <Text style={{ fontWeight: '700' }}>{itm.customer_phone || '-'}</Text></Text>
            <Text style={s.cardDetailText}>Customer: {itm.customer_name || 'Patient'}</Text>
            <Text style={s.cardDetailText}>Scheduled: {itm.scheduled_at || itm.created_at || '-'}</Text>
            <Text style={s.cardDetailText}>Address: {itm.address || itm.customer_address || '-'}</Text>
            {!isLab && (
              <Text style={[s.cardDetailText, { fontWeight: '700', color: C.teal }]}>
                Delivery Timing: {itm.delivery_slot || (itm.delivery_type === 'express' ? '30-60 mins Express' : itm.delivery_type === 'same_day' ? 'Same day delivery' : itm.delivery_type === 'next_day' ? 'Next day delivery' : '30-60 mint delivery express')}
              </Text>
            )}
            {Boolean(itm.order_amount) && <Text style={[s.cardDetailText, { fontWeight: '800', fontSize: 14 }]}>Total Amount: {fmtMoney(itm.order_amount)}</Text>}
          </View>
          <Pressable onPress={() => setModal(null)} style={s.submitMedicineButton}>
            <Text style={s.submitMedicineButtonText}>Close details</Text>
          </Pressable>
        </View>
      );
    }

    if (modal === 'quote') {
      return (
        <View style={s.modalInnerPad}>
          <Text style={s.addMedicineTitle}>Medicine quote</Text>
          <Text style={s.formHelpText}>Enter medicine name | pack | quantity | unit price per line.</Text>
          <TextInput
            value={quoteForm.medicine_name}
            onChangeText={(v) => setQuoteForm((o) => ({ ...o, medicine_name: v }))}
            placeholder="Medicines..."
            multiline
            style={[s.formInput, { minHeight: 90, textAlignVertical: 'top' }]}
          />
          <View style={s.formRowTwoCol}>
            <TextInput value={quoteForm.delivery_fee} onChangeText={(v) => setQuoteForm((o) => ({ ...o, delivery_fee: v }))} placeholder="Delivery fee ₹" keyboardType="decimal-pad" style={[s.formInput, { flex: 1 }]} />
            <TextInput value={quoteForm.note} onChangeText={(v) => setQuoteForm((o) => ({ ...o, note: v }))} placeholder="Note" style={[s.formInput, { flex: 1 }]} />
          </View>
          <Pressable onPress={() => void sendQuote()} style={s.submitMedicineButton}>
            <Text style={s.submitMedicineButtonText}>Send quote to patient</Text>
          </Pressable>
        </View>
      );
    }

    if (modal === 'location') {
      const selectedZone = zones.find((zone) => Number(zone.id) === zoneId);
      const zoneLat = Number(selectedZone?.latitude || 0);
      const zoneLng = Number(selectedZone?.longitude || 0);
      const center = mapPin ?? { latitude: zoneLat || 20.5937, longitude: zoneLng || 78.9629 };
      return (
        <View style={s.modalInnerPad}>
          <Text style={s.addMedicineTitle}>Pick facility location</Text>
          <TextInput value={locationQuery} onChangeText={setLocationQuery} onSubmitEditing={() => void searchLocations()} placeholder="Search address or landmark" style={s.formInput} />
          <Pressable disabled={locationBusy} onPress={() => void searchLocations()} style={s.solidTealButton}>
            <Text style={s.solidTealButtonText}>{locationBusy ? 'Searching...' : 'Search'}</Text>
          </Pressable>
          <LocationMap center={center} selected={mapPin} onSelect={selectLocationPin} />
          {locationNotice ? <Text style={{ color: C.warning, marginVertical: 4 }}>{locationNotice}</Text> : null}
          <Pressable disabled={!selectedLocation || locationBusy} onPress={() => void applySelectedLocation()} style={s.submitMedicineButton}>
            <Text style={s.submitMedicineButtonText}>Select this location</Text>
          </Pressable>
        </View>
      );
    }

    if (modal === 'bulk') {
      return (
        <View style={s.addMedicineModalContainer}>
          <Text style={s.addMedicineTitle}>Bulk import products</Text>
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
            Download the template, fill one product per row (images as URLs), then upload and import.
          </Text>

          <View style={{ gap: 10 }}>
            <Pressable onPress={() => void downloadBulkTemplate()} style={s.submitMedicineButton}>
              <Text style={s.submitMedicineButtonText}>Download template</Text>
            </Pressable>

            <Pressable onPress={() => void pickBulkFile()} style={s.outlinedButton}>
              <Text style={s.outlinedButtonText}>Upload filled template</Text>
            </Pressable>

            {bulkFileName ? (
              <Text style={{ color: C.bodyTextAlt, fontSize: 13 }}>📎 {bulkFileName}</Text>
            ) : null}

            {bulkRows.length ? (
              <View style={{ backgroundColor: C.bgAlt, borderRadius: 10, padding: 10, marginTop: 4 }}>
                <Text style={{ color: C.bodyText, fontSize: 13, fontWeight: '600' }}>
                  {bulkRows.length} product row(s) loaded
                </Text>
              </View>
            ) : null}

            {bulkResult ? (
              <Text style={{ color: C.bodyTextAlt, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{bulkResult}</Text>
            ) : null}
          </View>

          <View style={s.modalFooterRow}>
            <Pressable onPress={() => { setBulkRows([]); setBulkFileName(''); setBulkResult(''); setModal(null); }} style={s.cancelTextButton}>
              <Text style={s.cancelTextButtonLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={bulkBusy || !bulkRows.length}
              onPress={() => void submitBulkImport()}
              style={[s.submitMedicineButton, { opacity: bulkBusy || !bulkRows.length ? 0.5 : 1 }]}
            >
              {bulkBusy ? <ActivityIndicator color="#fff" /> : <Text style={s.submitMedicineButtonText}>Import all</Text>}
            </Pressable>
          </View>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={s.safeContainer} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={C.bg} />
      {!provider ? (
        authScreen()
      ) : (
        <>
          {/* Top Header Bar matching Screenshot 2 */}
          <View style={s.topHeader}>
            <Text style={s.topHeaderTitle}>{tab}</Text>
            <Pressable onPress={() => tab === 'Messages' ? void loadConversations() : void loadWorkspace()} style={s.iconCircleButton}>
              <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} size={22} tintColor={C.ink} fallback={<Text style={{ fontSize: 22, color: C.ink }}>↻</Text>} />
            </Pressable>
          </View>

          {notice ? (
            <Pressable onPress={() => setNotice('')} style={s.noticePill}>
              <Text style={s.noticePillText}>{notice}</Text>
              <Text style={{ color: C.teal, fontWeight: '800' }}>✕</Text>
            </Pressable>
          ) : null}

          {/* Main content */}
          <View style={s.mainBody}>{activeContent}</View>

          {/* Bottom Navigation Bar matching Screenshot 2 */}
          <View style={[s.bottomNavBar, { paddingBottom: Math.max(safeAreaInsets.bottom, 8) }]}>
            {tabs.map((item) => {
              const isActive = tab === item.title;
              return (
                <Pressable
                  key={item.title}
                  onPress={() => {
                    setTab(item.title);
                    setNotice('');
                    if (item.title === 'Messages') void loadConversations();
                    if (item.title === 'Dashboard' || item.title === 'Patients' || item.title === 'Analytics') void loadWorkspace();
                  }}
                  style={s.bottomNavItem}
                >
                  <View style={[s.bottomNavIconContainer, isActive && s.bottomNavActiveIconContainer]}>
                    <AppIcon name={item.icon} size={20} color={isActive ? C.tealDeep : C.muted} />
                  </View>
                  <Text style={[s.bottomNavLabel, isActive && s.bottomNavActiveLabel]}>{item.title}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Modal Dialog / Sheet */}
      <Modal transparent visible={modal !== null} animationType="slide" onRequestClose={() => setModal(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setModal(null)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalKeyboardDock}>
            <Pressable style={s.modalSheetCard} onPress={(e) => e.stopPropagation()}>
              <View style={s.modalSheetHandle} />
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {renderModalContent()}
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

type Palette = {
  bg: string; surface: string; bgAlt: string; ink: string; inkStrong: string; heading: string;
  bodyText: string; bodyTextAlt: string; muted: string; placeholder: string; border: string;
  borderStrong: string; tealTint: string; teal: string; tealDeep: string; tealDarkText: string;
  tealSoft: string; tealBorder: string; danger: string; warning: string; successTint: string;
  successSoft: string; successBorder: string;
};

const lightPalette: Palette = {
  bg: '#f3f7f8', surface: '#ffffff', bgAlt: '#f4f3f4', ink: '#113a45', inkStrong: '#111827',
  heading: '#1f2937', bodyText: '#374151', bodyTextAlt: '#4b5563', muted: '#6b7280',
  placeholder: '#9ca3af', border: '#e5eef0', borderStrong: '#d1d5db', tealTint: '#e6fffa',
  teal: '#00897b', tealDeep: '#094d45', tealDarkText: '#0f766e', tealSoft: '#80cbc4',
  tealBorder: '#99f6e4', danger: '#ef4444', warning: '#b45309', successTint: '#cbf3e4',
  successSoft: '#f0fdf4', successBorder: '#a7f3d0',
};

const darkPalette: Palette = {
  bg: '#0b1214', surface: '#161e20', bgAlt: '#12191b', ink: '#e7eef0', inkStrong: '#f2f6f6',
  heading: '#eaeff0', bodyText: '#d3dcdc', bodyTextAlt: '#c2cccc', muted: '#9aa7a9',
  placeholder: '#6f7d80', border: '#263236', borderStrong: '#38464a', tealTint: '#10332e',
  teal: '#12a594', tealDeep: '#7fd6cb', tealDarkText: '#57c2b4', tealSoft: '#1d5a54',
  tealBorder: '#1c4f49', danger: '#f87171', warning: '#fbbf24', successTint: '#14352b',
  successSoft: '#12241d', successBorder: '#2f6b52',
};

const makeStyles = (C: Palette) => StyleSheet.create({
  safeContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: C.bg,
  },
  topHeader: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    backgroundColor: C.bg,
  },
  topHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.3,
  },
  iconCircleButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticePill: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.tealTint,
    borderColor: C.tealBorder,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noticePillText: {
    fontSize: 13,
    color: C.tealDarkText,
    fontWeight: '600',
    flex: 1,
  },
  mainBody: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Metric Cards (Image 2)
  metricCardsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: C.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTextStack: {
    flex: 1,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  metricLabel: {
    fontSize: 13,
    color: C.bodyTextAlt,
    fontWeight: '500',
    marginTop: 2,
  },

  // Section Headers
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  sectionActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: C.tealTint,
  },
  sectionActionBtnText: {
    color: C.teal,
    fontSize: 13,
    fontWeight: '700',
  },

  // Order / Booking Card (Image 2)
  cardFrame: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardItemTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  statusPillBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.placeholder,
  },
  statusPillBadgeText: {
    fontSize: 13,
    color: C.bodyText,
    fontWeight: '600',
  },
  cardDetailsBox: {
    gap: 4,
    marginBottom: 14,
  },
  cardDetailText: {
    fontSize: 13,
    color: C.bodyTextAlt,
    lineHeight: 18,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  solidTealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.teal,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  solidTealButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  outlinedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: C.teal,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: 'transparent',
  },
  outlinedButtonText: {
    color: C.teal,
    fontSize: 13,
    fontWeight: '700',
  },
  pipelinePillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  pipelinePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderStrong,
    backgroundColor: C.surface,
  },
  pipelinePillActive: {
    borderColor: C.teal,
    backgroundColor: C.tealTint,
  },
  pipelinePillText: {
    fontSize: 12,
    color: C.bodyText,
    fontWeight: '600',
  },
  pipelinePillTextActive: {
    color: C.teal,
    fontWeight: '700',
  },

  // Bottom Navigation Bar (Image 2)
  bottomNavBar: {
    height: 64,
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  bottomNavItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  bottomNavIconContainer: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 14,
  },
  bottomNavActiveIconContainer: {
    backgroundColor: C.successTint,
    paddingHorizontal: 16,
  },
  bottomNavLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.muted,
    marginTop: 2,
  },
  bottomNavActiveLabel: {
    color: C.tealDeep,
    fontWeight: '800',
  },

  // Add Medicine Modal (Image 1)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalKeyboardDock: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
  modalSheetCard: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '90%',
  },
  modalSheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.borderStrong,
    alignSelf: 'center',
    marginBottom: 16,
  },
  addMedicineModalContainer: {
    gap: 12,
  },
  addMedicineTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: C.inkStrong,
    marginBottom: 6,
  },
  inputContainer: {
    position: 'relative',
    marginBottom: 2,
  },
  floatingInputLabel: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '600',
    marginBottom: 3,
  },
  formInput: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 14,
    fontSize: 14,
    color: C.inkStrong,
    backgroundColor: C.surface,
  },
  formRowTwoCol: {
    flexDirection: 'row',
    gap: 12,
  },
  dropdownContainer: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 14,
    paddingVertical: 8,
    justifyContent: 'center',
    backgroundColor: C.surface,
  },
  dropdownValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValueText: {
    fontSize: 15,
    fontWeight: '700',
    color: C.inkStrong,
  },
  dropdownArrow: {
    fontSize: 12,
    color: C.muted,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  switchLabel: {
    fontSize: 14,
    color: C.heading,
    fontWeight: '600',
    lineHeight: 18,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: C.teal,
    paddingVertical: 12,
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  addImageButtonText: {
    fontSize: 14,
    color: C.teal,
    fontWeight: '700',
  },
  imagePreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.successBorder,
    backgroundColor: C.successSoft,
    marginTop: 6,
  },
  previewThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 10,
  },
  modalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 8,
  },
  cancelTextButton: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  cancelTextButtonLabel: {
    color: C.teal,
    fontSize: 15,
    fontWeight: '700',
  },
  submitMedicineButton: {
    backgroundColor: C.teal,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitMedicineButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Medicine catalogue rows
  medicineCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  medicineThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  medicineThumbnailFallback: {
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: C.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medicineTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.inkStrong,
  },
  medicinePriceText: {
    fontSize: 13,
    color: C.teal,
    fontWeight: '700',
    marginTop: 2,
  },
  medicineSubText: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  archiveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  archiveBtnText: {
    fontSize: 12,
    color: C.muted,
    fontWeight: '600',
  },

  // Auth screen
  authScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  authLogoBox: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  authLogoText: {
    fontSize: 38,
    fontWeight: '900',
    color: C.ink,
  },
  authLogoSub: {
    fontSize: 11,
    fontWeight: '800',
    color: C.teal,
    letterSpacing: 2,
    marginTop: -4,
  },
  authHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: C.ink,
    textAlign: 'center',
  },
  authSub: {
    fontSize: 13,
    color: C.muted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  roleSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
  },
  roleSelectorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  roleSelectorItemActive: {
    backgroundColor: C.successTint,
  },
  roleSelectorItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.muted,
  },
  roleSelectorItemTextActive: {
    color: C.tealDeep,
    fontWeight: '800',
  },
  authCardBox: {
    backgroundColor: C.surface,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  authCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 6,
  },
  demoLoginBtn: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: C.teal,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  demoLoginBtnText: {
    color: C.teal,
    fontSize: 13,
    fontWeight: '800',
  },
  mapPickerTrigger: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.teal,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: C.tealTint,
    marginVertical: 4,
  },
  noticeBanner: {
    marginTop: 14,
    textAlign: 'center',
    color: C.warning,
    fontSize: 13,
    fontWeight: '600',
  },

  // Patient screen
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  patientAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.successTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  patientAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: C.tealDeep,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  patientPhone: {
    fontSize: 13,
    color: C.bodyTextAlt,
    marginTop: 2,
  },
  patientSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  emptySub: {
    fontSize: 13,
    color: C.muted,
    marginTop: 4,
  },

  // Account — redesigned to match screenshot
  accountHeaderBox: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  accountBigAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  accountBigAvatarText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
  },
  accountBizName: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  accountRoleText: {
    fontSize: 13,
    color: C.muted,
    marginTop: 2,
  },
  formCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  signOutBtn: {
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: C.danger,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  signOutBtnText: {
    color: C.danger,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── New Account Screen styles (screenshot-matched) ──
  acctGradientCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 18,
    backgroundColor: C.teal,
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  acctGradientName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.3,
  },
  acctGradientSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },

  acctSettingsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  acctSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  acctSettingsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.bgAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctSettingsInfo: {
    flex: 1,
  },
  acctSettingsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.ink,
  },
  acctSettingsSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  acctDivider: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 66,
  },

  acctPharmacyCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
  },
  acctPharmacyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  acctPharmacyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  acctPharmacyEdit: {
    fontSize: 14,
    fontWeight: '700',
    color: C.teal,
  },
  acctPharmacyLine: {
    fontSize: 13,
    color: C.muted,
    marginBottom: 4,
  },

  acctCatalogHeader: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
    marginHorizontal: 0,
    marginBottom: 12,
    marginTop: 8,
  },
  acctCatalogTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  acctCatalogAddBtn: {
    backgroundColor: C.teal,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctCatalogAddBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
  acctMedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 16,
    marginHorizontal: 0,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: C.border,
    gap: 12,
  },
  acctMedThumb: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: C.tealTint,
  },
  acctMedThumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  acctMedName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.ink,
  },
  acctMedSub: {
    fontSize: 12,
    color: C.muted,
    marginTop: 2,
  },
  acctMedPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: C.ink,
  },
  acctEmptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    marginHorizontal: 16,
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 10,
  },
  acctSignOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    paddingVertical: 14,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 24,
    gap: 8,
  },
  acctSignOutText: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '600',
  },

  // Analytics Detail
  analyticsDetailCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: C.border,
    gap: 6,
  },
  analyticsDetailTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 4,
  },
  analyticsDetailSub: {
    fontSize: 13,
    color: C.bodyTextAlt,
  },

  // Chat
  chatBox: {
    flex: 1,
  },
  backRow: {
    marginBottom: 8,
  },
  backText: {
    color: C.teal,
    fontSize: 14,
    fontWeight: '700',
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
    marginBottom: 12,
  },
  chatList: {
    height: 350,
  },
  msgBubble: {
    alignSelf: 'flex-start',
    backgroundColor: C.border,
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    maxWidth: '80%',
  },
  msgBubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: C.teal,
  },
  msgText: {
    fontSize: 14,
    color: C.inkStrong,
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  chatInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderStrong,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  chatSendBtn: {
    backgroundColor: C.teal,
    borderRadius: 14,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  chatSendBtnText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  modalInnerPad: {
    padding: 6,
    gap: 10,
  },
  formHelpText: {
    fontSize: 12,
    color: C.muted,
    marginBottom: 6,
  },
});
