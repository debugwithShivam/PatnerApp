import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SymbolView } from 'expo-symbols';
import { LocationMap, type LocationPin } from '@/components/location-map';
import { clearSession, partnerApi, persistSession, readSession } from '@/services/partner-api';

type Role = 'pharmacy' | 'lab' | 'doctor';
type Tab = 'Dashboard' | 'Patients' | 'Messages' | 'Analytics' | 'Account';
type AnyRow = Record<string, any>;
type Zone = { id: number; name: string; city?: string; state?: string; pincode?: string; latitude?: number | string; longitude?: number | string };
type LocationChoice = LocationPin & { address: string; city?: string; pincode?: string };
type FormState = Record<string, string>;
type IconName = 'dashboard' | 'patients' | 'messages' | 'analytics' | 'account' | 'total' | 'pending' | 'completed' | 'revenue' | 'pharmacy' | 'lab' | 'doctor' | 'verified' | 'refresh' | 'close' | 'back' | 'send' | 'profile' | 'appearance' | 'arrow' | 'empty' | 'signout' | 'prescription' | 'check' | 'radio';
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
};
const roles: { key: Role; title: string; icon: IconName; detail: string }[] = [
  { key: 'pharmacy', title: 'Pharmacy', icon: 'pharmacy', detail: 'Manage medicines and fulfilment' },
  { key: 'lab', title: 'Laboratory', icon: 'lab', detail: 'Manage tests and appointments' },
  { key: 'doctor', title: 'Doctor', icon: 'doctor', detail: 'Manage consultations and patients' },
];
const tabs: { title: Tab; icon: IconName }[] = [
  { title: 'Dashboard', icon: 'dashboard' }, { title: 'Patients', icon: 'patients' }, { title: 'Messages', icon: 'messages' }, { title: 'Analytics', icon: 'analytics' }, { title: 'Account', icon: 'account' },
];
const initialForm: FormState = { name: '', business_name: '', phone: '', email: '', password: '', license_number: '', city: '', pincode: '', address_line: '', speciality: '', qualification: '', consultation_fee: '', description: '', opening_hours: '' };
const DEMO_PASSWORD = 'AmedixDemo26!';
const fmtMoney = (value: any) => `INR ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const titleCase = (value: any) => String(value ?? 'pending').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const clean = (value: any, fallback = '-') => value === null || value === undefined || String(value).trim() === '' ? fallback : String(value);

function AppIcon({ name, size = 18, color = '#29e2d2' }: { name: IconName; size?: number; color?: string }) {
  return <SymbolView name={iconSymbols[name]} size={size} tintColor={color} fallback={<Text style={{ color, fontSize: size }}>+</Text>} />;
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
  const [appearance, setAppearance] = useState('Use device setting');
  const [modal, setModal] = useState<'appearance' | 'item' | 'quote' | 'location' | 'prescription' | 'meeting' | null>(null);
  const [mapPin, setMapPin] = useState<LocationPin | null>(null);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationChoices, setLocationChoices] = useState<LocationChoice[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationChoice | null>(null);
  const [locationNotice, setLocationNotice] = useState('');
  const [locationBusy, setLocationBusy] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', description: '', unit: 'strip', stock: '0', price: '', discount_price: '', sku: '', medicine_type: 'otc', schedule_tag: '', max_qty_per_order: '', max_qty_per_month: '', requires_pharmacist_review: false, requires_age_confirmation: false, allows_substitution: true, code: '', preparation: '', report_hours: '24' });
  const [quoteForm, setQuoteForm] = useState({ medicine_name: '', pack: 'strip', quantity: '1', unit_price: '', delivery_fee: '', note: '' });
  const [quoteTask, setQuoteTask] = useState<AnyRow | null>(null);
  const [prescriptionTask, setPrescriptionTask] = useState<AnyRow | null>(null);
  const [prescriptionDraft, setPrescriptionDraft] = useState('');
  const [meetingTask, setMeetingTask] = useState<AnyRow | null>(null);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [reportUrl, setReportUrl] = useState('');
  const [reportAsset, setReportAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);

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
        const [products, orders] = await Promise.all([partnerApi<any>('/api/v1/providers/products'), partnerApi<any>('/api/v1/providers/orders')]);
        setWorkspace((previous: any) => ({ ...previous, products: products.data ?? [], orders: orders.data ?? [] }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not refresh your workspace.';
      setNotice(message);
      if ((error as any)?.status === 401 || (error as any)?.status === 403) { await clearSession(); setProvider(null); setWorkspace(null); }
    } finally { setRefreshing(false); }
  }, [role]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const session = await readSession();
      if (mounted && session.role && session.token && ['pharmacy', 'lab', 'doctor'].includes(session.role)) {
        const savedRole = session.role as Role; setRole(savedRole); await loadWorkspace(savedRole);
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
      setZones(available); setZoneId(available[0]?.id ?? null);
      if (available[0]) setRegisterForm((old) => ({ ...old, city: old.city || available[0].city || '', pincode: old.pincode || available[0].pincode || '' }));
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load service areas.'); }
  };

  const searchLocations = async () => {
    if (locationQuery.trim().length < 3) { setLocationNotice('Type at least 3 characters of an address, area, landmark, or PIN code.'); return; }
    setLocationBusy(true); setLocationNotice('');
    try {
      const result = await partnerApi<{ data?: LocationChoice[] }>('/api/v1/zones/search', { method: 'POST', auth: false, body: { query: locationQuery.trim() } });
      setLocationChoices(result.data ?? []);
      if (!result.data?.length) setLocationNotice('No matching addresses found. Try a nearby landmark or PIN code.');
    } catch (error) { setLocationNotice(error instanceof Error ? error.message : 'Could not search for that address.'); }
    finally { setLocationBusy(false); }
  };

  const selectLocationPin = (pin: LocationPin) => {
    const address = `${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`;
    const choice = { ...pin, address };
    setMapPin(pin); setSelectedLocation(choice); setLocationQuery(address); setLocationChoices([]);
    setLocationNotice('Pin selected. Add this location to your premises.');
  };

  const openLocationPicker = () => {
    setLocationQuery(selectedLocation?.address || registerForm.address_line || '');
    setLocationChoices([]); setLocationNotice(''); setModal('location');
  };

  const applySelectedLocation = async () => {
    if (!selectedLocation) { setLocationNotice('Search for an address or tap the map to place a pin first.'); return; }
    setLocationBusy(true); setLocationNotice('Adding location…');
    let details = selectedLocation;
    try {
      try {
        const reverse = await partnerApi<{ data?: { address?: string; pincode?: string; city?: string } }>('/api/v1/zones/reverse-geocode', {
          method: 'POST', auth: false,
          body: { latitude: selectedLocation.latitude, longitude: selectedLocation.longitude },
        });
        details = { ...selectedLocation, ...reverse.data, address: reverse.data?.address || selectedLocation.address };
      } catch { /* Coordinates can still resolve a service area if geocoding is unavailable. */ }
      const resolved = await partnerApi<{ data?: { zone?: Zone | null; serviceable?: boolean } }>('/api/v1/zones/resolve', {
        method: 'POST', auth: false,
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
      // Keep registration inputs identical to the values used above for zone
      // resolution. ZoneSchema prioritizes a PIN match over pin coordinates;
      // backfilling the selected zone's default PIN here could resolve to a
      // different overlapping zone when registration is submitted.
      setRegisterForm((old) => ({ ...old, address_line: details.address || old.address_line, city: details.city || resolvedZone.city || old.city, pincode: details.pincode || '' }));
      setSelectedLocation(details); setLocationQuery(details.address); setLocationNotice(''); setModal(null);
      setNotice(zoneChanged ? `Service area updated to ${resolvedZone.name}; it matches the confirmed map location.` : 'Premises location confirmed.');
    } catch (error) {
      setLocationNotice(error instanceof Error ? error.message : 'Could not confirm this service area. Please try another location.');
    } finally { setLocationBusy(false); }
  };

  const submitAuth = async () => {
    if (!role) { setNotice('Choose one account type first.'); return; }
    setBusy(true);
    try {
      if (authMode === 'login') {
        const result = await partnerApi<any>('/api/v1/providers/login', { method: 'POST', auth: false, body: { provider_type: role, phone: auth.phone.trim(), password: auth.password } });
        await persistSession(result.token, role); setProvider(result.data); await loadWorkspace(role); setTab('Dashboard');
      } else {
        if (!zoneId) throw new Error('No active service area is available for registration.');
        if (!mapPin) throw new Error('Choose your premises on the map before submitting.');
        if (registerForm.password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const payload: AnyRow = { ...registerForm, provider_type: role, zone_id: zoneId, latitude: mapPin.latitude, longitude: mapPin.longitude, consultation_fee: Number(registerForm.consultation_fee || 0) };
        delete payload.password_confirm;
        await partnerApi('/api/v1/providers/register', { method: 'POST', auth: false, body: payload });
        setAuthMode('login'); setAuth((old) => ({ ...old, phone: registerForm.phone })); setNotice('Registration submitted. Website administrators will verify your licence and premises before sign-in is enabled.');
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Sign-in or registration failed.'); }
    finally { setBusy(false); }
  };

  const enterDemoWorkspace = async () => {
    if (!role) { setNotice('Choose Pharmacy, Laboratory or Doctor first.'); return; }
    setBusy(true);
    try {
      const accounts = await partnerApi<{ data?: AnyRow[] }>('/api/v1/providers/demo-accounts', { auth: false });
      const account = (accounts.data ?? []).find((item) => item.provider_type === role);
      if (!account) throw new Error('No demo account is seeded yet. Ask the website admin to seed demo data for a service area.');
      const result = await partnerApi<any>('/api/v1/providers/login', {
        method: 'POST', auth: false,
        body: { provider_type: role, phone: account.phone, password: DEMO_PASSWORD },
      });
      await persistSession(result.token, role);
      setProvider(result.data); setTab('Dashboard');
      await loadWorkspace(role);
      setNotice(`Demo ${titleCase(role)} workspace · ${account.zone_name || 'Demo service area'}. Changes save to the website and appear in admin.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open this demo workspace.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await clearSession(); setProvider(null); setWorkspace(null); setConversation(null); setMessages([]); setTab('Dashboard'); setNotice('Signed out.'); };

  const updateProvider = async () => {
    if (!provider) return;
    setBusy(true);
    const fields = ['name','business_name','email','address','city','description','opening_hours','speciality','qualification','service_modes','availability_text','experience_years','consultation_fee','service_radius_km','home_collection_fee','default_delivery_fee'];
    const body = Object.fromEntries(fields.filter((key) => key in provider).map((key) => [key, provider[key]]));
    try { const result = await partnerApi<any>('/api/v1/providers/profile', { method: 'POST', body }); setProvider(result.data); setNotice(result.message ?? 'Profile updated.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Profile could not be updated.'); }
    finally { setBusy(false); }
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
      await partnerApi(kind === 'order' ? `/api/v1/providers/orders/${id}/status` : `/api/v1/providers/${kind}/${id}/status`, { method: 'POST', body: { status } });
      setNotice(`Status changed to ${titleCase(status)}.`); await loadWorkspace();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update status.'); }
  };

  const advanceAppointment = async (task: AnyRow) => {
    const kind = role === 'lab' ? 'lab' : 'consultation';
    const current = task.status;
    const next: Record<string, string> = role === 'lab'
      ? { requested: 'accepted', accepted: 'sample_collected', sample_collected: 'processing', processing: 'completed' }
      : { requested: 'confirmed', confirmed: 'in_progress', in_progress: 'completed' };
    const target = next[current];
    if (!target) { setNotice('There is no further status change for this appointment.'); return; }
    if (kind === 'lab' && target === 'completed') {
      if (!reportUrl.trim() && !reportAsset) { setNotice('Choose a report PDF/image or enter a secure report URL.'); return; }
      try {
        const body: AnyRow = { provider_note: '' };
        if (reportAsset) {
          let base64 = reportAsset.base64 ?? '';
          if (!base64) base64 = await FileSystem.readAsStringAsync(reportAsset.uri, { encoding: 'base64' });
          const mime = reportAsset.mimeType || (reportAsset.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          body.report_base64 = `data:${mime};base64,${base64}`; body.file_name = reportAsset.name;
        } else body.report_url = reportUrl.trim();
        await partnerApi(`/api/v1/providers/lab-bookings/${task.id}/report`, { method: 'POST', body });
        setReportUrl(''); setReportAsset(null); setNotice('Lab report sent to the patient.'); await loadWorkspace();
      }
      catch (error) { setNotice(error instanceof Error ? error.message : 'Report could not be submitted.'); }
      return;
    }
    await updateStatus(kind, Number(task.id), target);
  };

  const submitInventoryItem = async () => {
    if (role !== 'pharmacy' && role !== 'lab') { setNotice('Only pharmacy partners can add medicines.'); return; }
    const isLab = role === 'lab';
    const body = isLab
      ? { name: itemForm.name, code: itemForm.code, description: itemForm.description, price: Number(itemForm.price || 0), preparation: itemForm.preparation, report_hours: Number(itemForm.report_hours || 24), home_collection: true }
      : { name: itemForm.name.trim(), description: itemForm.description, unit: itemForm.unit, stock: Number(itemForm.stock || 0), price: Number(itemForm.price || 0), discount_price: Number(itemForm.discount_price || 0), sku: itemForm.sku, medicine_type: itemForm.medicine_type, schedule_tag: itemForm.schedule_tag, max_qty_per_order: Number(itemForm.max_qty_per_order || 0) || null, max_qty_per_month: Number(itemForm.max_qty_per_month || 0) || null, requires_pharmacist_review: itemForm.requires_pharmacist_review || itemForm.medicine_type !== 'otc', requires_age_confirmation: itemForm.requires_age_confirmation, allows_substitution: itemForm.allows_substitution, visible: true };
    if (!isLab && (!itemForm.name.trim() || Number(itemForm.price) <= 0)) { setNotice('Enter a medicine name and a price above zero.'); return; }
    try {
      await partnerApi(isLab ? '/api/v1/providers/lab-tests' : '/api/v1/providers/products', { method: 'POST', body });
      setModal(null); setItemForm({ name: '', description: '', unit: 'strip', stock: '0', price: '', discount_price: '', sku: '', medicine_type: 'otc', schedule_tag: '', max_qty_per_order: '', max_qty_per_month: '', requires_pharmacist_review: false, requires_age_confirmation: false, allows_substitution: true, code: '', preparation: '', report_hours: '24' });
      setNotice(isLab ? 'Test sent to the website administrator for review.' : 'Medicine added and sent for administrator approval.'); await loadWorkspace();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save this item.'); }
  };

  const archiveItem = async (item: AnyRow) => {
    try { await partnerApi(`/api/v1/providers/${role === 'lab' ? 'lab-tests' : 'products'}/${item.id}`, { method: 'DELETE' }); setNotice('Item archived.'); await loadWorkspace(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not archive this item.'); }
  };

  const sendQuote = async () => {
    if (!quoteTask) return;
    try {
      const items = quoteForm.medicine_name.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const [medicine_name, pack = 'strip', quantity = '1', unit_price = '0'] = line.split('|').map((part) => part.trim());
        return { medicine_name, pack, quantity: Number(quantity || 1), unit_price: Number(unit_price || 0) };
      });
      if (!items.length || items.some((item) => !item.medicine_name || item.unit_price <= 0)) { setNotice('Add every medicine as name | pack | quantity | unit price, with a price above zero.'); return; }
      const result = await partnerApi<any>(`/api/v1/providers/prescription-requests/${quoteTask.id}/quote`, { method: 'POST', body: { items, delivery_fee: Number(quoteForm.delivery_fee || 0), note: quoteForm.note } });
      setModal(null); setQuoteTask(null); setNotice(result.message ?? 'Quote sent to patient.'); await loadWorkspace();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not send the medicine quote.'); }
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
      setModal(null); setPrescriptionTask(null); setPrescriptionDraft(''); setNotice(result.message ?? 'Prescription saved and patient notified.'); await loadWorkspace();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Prescription could not be saved.'); }
    finally { setBusy(false); }
  };

  const shareMeetingLink = async () => {
    if (!meetingTask) return;
    const url = meetingUrl.trim();
    if (url === '') { setNotice('Paste a Google Meet or Zoom link first.'); return; }
    setBusy(true);
    try {
      const result = await partnerApi<any>(`/api/v1/providers/consultations/${meetingTask.id}/connect`, { method: 'POST', body: { meeting_url: url } });
      setModal(null); setMeetingTask(null); setMeetingUrl(''); setNotice(result.message ?? 'Meeting link shared with the patient.'); await loadWorkspace();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Meeting link could not be shared.'); }
    finally { setBusy(false); }
  };

  const markPickupReady = async (task: AnyRow) => {
    try {
      const result = await partnerApi<any>(`/api/v1/providers/prescription-requests/${task.id}/pickup-status`, { method: 'POST', body: { status: 'ready_for_pickup' } });
      setNotice(result.message ?? 'Patient notified that medicines are ready.'); await loadWorkspace();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not update prescription status.'); }
  };

  const loadConversations = async () => {
    try { const result = await partnerApi<any>('/api/v1/providers/medical-chat'); setWorkspace((old: any) => ({ ...old, conversations: result.data ?? [] })); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load patient messages.'); }
  };
  const openConversation = async (item: AnyRow) => {
    try { const response = await partnerApi<any>(`/api/v1/providers/medical-chat/${item.id}/show`); setConversation(item); setMessages(response.messages ?? []); setTab('Messages'); await partnerApi(`/api/v1/providers/medical-chat/${item.id}/read`, { method: 'POST', body: {} }); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not open this conversation.'); }
  };
  const sendMessage = async () => {
    if (!conversation || !draft.trim()) return;
    try { const response = await partnerApi<any>(`/api/v1/providers/medical-chat/${conversation.id}/send`, { method: 'POST', body: { text: draft.trim() } }); setMessages((old) => [...old, ...(response.messages ?? [])]); setDraft(''); await loadConversations(); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Message could not be sent.'); }
  };

  const section = (label: string, trailing?: ReactNode) => <View style={s.sectionHead}><Text style={s.sectionTitle}>{label}</Text>{trailing}</View>;
  const smallAction = (label: string, onPress: () => void, outline = false) => <Pressable onPress={onPress} style={[s.smallButton, outline && s.smallButtonOutline]}><Text style={[s.smallButtonText, outline && s.smallButtonTextOutline]}>{label}</Text></Pressable>;
  const input = (label: string, key: string, value: string, onChange: (value: string) => void, props: any = {}) => <View style={s.inputWrap}><Text style={s.inputLabel}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={label} placeholderTextColor={C.placeholder} style={[s.input, props.multiline && s.inputMultiline]} {...props} /></View>;
  const setRegister = (key: string, value: string) => {
    if (key === 'address_line' || key === 'city' || key === 'pincode') {
      setMapPin(null); setSelectedLocation(null);
    }
    setRegisterForm((old) => ({ ...old, [key]: value }));
  };

  const authScreen = () => <ScrollView contentContainerStyle={s.authScroll} keyboardShouldPersistTaps="handled">
    <View style={s.logoTile}><Text style={s.logoMark}>A<Text style={s.logoSpark}>+</Text></Text><Text style={s.logoWord}>AMEDIX</Text><Text style={s.logoSub}>MEDS</Text></View>
    <Text style={s.authTitle}>AIMEDIX Partner</Text><Text style={s.authSub}>Operations for pharmacies, laboratories and doctors.</Text>
    <View style={s.roleSegment}>{roles.map((entry) => <Pressable key={entry.key} onPress={() => { setRole(entry.key); setNotice(''); }} style={[s.roleSegmentItem, role === entry.key && s.roleSegmentActive]}><AppIcon name={entry.icon} size={16} color={role === entry.key ? C.mint : C.muted} /><Text style={[s.roleSegmentText, role === entry.key && s.roleSegmentTextActive]}>{entry.title}</Text></Pressable>)}</View>
    {role ? <View style={s.authCard}><Text style={s.authCardTitle}>{authMode === 'login' ? `${roleName} sign in` : `Register as ${roleName.toLowerCase()}`}</Text>
      {authMode === 'login' ? <>{input('Phone number','phone',auth.phone,(value) => setAuth((old) => ({ ...old, phone: value })),{ keyboardType: 'phone-pad' })}{input('Password','password',auth.password,(value) => setAuth((old) => ({ ...old, password: value })),{ secureTextEntry: true })}
        <Pressable disabled={busy} onPress={() => void submitAuth()} style={s.primaryButton}>{busy ? <ActivityIndicator color="#041312" /> : <Text style={s.primaryButtonText}>Sign in</Text>}</Pressable><Pressable disabled={busy} onPress={() => void enterDemoWorkspace()} style={s.demoLoginButton}><Text style={s.demoLoginText}>{busy ? 'Opening demo…' : `Enter ${roleName.toLowerCase()} demo workspace`}</Text></Pressable><Pressable onPress={() => void openRegistration()} style={s.linkButton}><Text style={s.linkText}>Register as a new healthcare partner</Text></Pressable>
      </> : <>
        <Text style={s.formHint}>One account is created for the selected role. The website admin checks the licence and service location before account approval.</Text>
        {input('Owner / doctor name','name',registerForm.name,(value) => setRegister('name',value))}
        {input(role === 'doctor' ? 'Clinic name' : role === 'lab' ? 'Laboratory name' : 'Pharmacy name','business_name',registerForm.business_name,(value) => setRegister('business_name',value))}
        {input('Phone number','phone',registerForm.phone,(value) => setRegister('phone',value),{ keyboardType: 'phone-pad' })}
        {input('Email address','email',registerForm.email,(value) => setRegister('email',value),{ keyboardType: 'email-address', autoCapitalize: 'none' })}
        {input('Password (at least 8 characters)','password',registerForm.password,(value) => setRegister('password',value),{ secureTextEntry: true })}
        {input(role === 'doctor' ? 'Medical council licence number' : 'Business / facility licence number','license_number',registerForm.license_number,(value) => setRegister('license_number',value))}
        {role === 'doctor' && <>{input('Speciality','speciality',registerForm.speciality,(value) => setRegister('speciality',value))}{input('Qualification','qualification',registerForm.qualification,(value) => setRegister('qualification',value))}{input('Consultation fee (INR)','consultation_fee',registerForm.consultation_fee,(value) => setRegister('consultation_fee',value),{ keyboardType: 'decimal-pad' })}</>}
        {zones.length > 0 && <><Text style={s.inputLabel}>Service area</Text><View style={s.zonePicker}>{zones.map((zone) => <Pressable key={zone.id} onPress={() => { setZoneId(zone.id); setMapPin(null); setSelectedLocation(null); setLocationChoices([]); setLocationQuery(''); setRegisterForm((old) => ({ ...old, address_line: '', city: zone.city ?? '', pincode: zone.pincode ?? '' })); }} style={[s.zoneOption, zoneId === zone.id && s.zoneOptionOn]}><Text style={[s.zoneOptionText, zoneId === zone.id && s.zoneOptionTextOn]}>{zone.name}</Text></Pressable>)}</View></>}
        {input('Street / building address','address_line',registerForm.address_line,(value) => setRegister('address_line',value))}
        {input('City','city',registerForm.city,(value) => setRegister('city',value))}
        {input('PIN code','pincode',registerForm.pincode,(value) => setRegister('pincode',value),{ keyboardType: 'number-pad' })}
        <Text style={s.inputLabel}>Facility location</Text><Pressable onPress={openLocationPicker} style={s.mapSelectButton}><View style={s.pinIcon}><View style={s.pinIconDot} /></View><View style={{ flex: 1 }}><Text style={s.mapSelectTitle}>{mapPin ? 'Premises pin selected' : 'Choose premises on map'}</Text><Text style={s.mapSelectSub}>{mapPin ? `${mapPin.latitude.toFixed(6)}, ${mapPin.longitude.toFixed(6)}` : 'Search for or tap your pharmacy, lab or clinic'}</Text></View><Text style={s.seeMap}>{mapPin ? 'Change' : 'Open map'}</Text></Pressable>
        <Text style={s.formHint}>{mapPin ? 'Premises pin saved. The website checks it against your service area.' : 'Address text alone does not set your premises. Open the map, choose an address or tap to place a pin, then press “Select this location”.'}</Text>
        <Pressable disabled={busy} onPress={() => void submitAuth()} style={s.primaryButton}>{busy ? <ActivityIndicator color="#041312" /> : <Text style={s.primaryButtonText}>Submit for verification</Text>}</Pressable>
        <Pressable onPress={() => { setAuthMode('login'); setNotice(''); }} style={s.linkButton}><Text style={s.linkText}>Back to sign in</Text></Pressable>
      </>}
    </View> : <View style={s.chooseCard}><Text style={s.chooseTitle}>Choose your account type</Text><Text style={s.chooseCopy}>Sign in to the single role registered for your facility.</Text></View>}
    {notice ? <Text style={s.authNotice}>{notice}</Text> : null}
  </ScrollView>;

  const providerBanner = () => <View style={s.providerBanner}><View style={s.providerAvatar}><Text style={s.providerAvatarText}>{(provider?.business_name || provider?.name || 'A').slice(0,1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.providerName}>{provider?.business_name || provider?.name || 'AIMEDIX Partner'}</Text><Text style={s.providerMeta}>{roleName} | {provider?.city || 'Verified service area'}</Text></View><View style={s.verifiedChip}><AppIcon name="verified" size={13} color="#087f74" /><Text style={s.verifiedText}> VERIFIED</Text></View></View>;

  const statCards = (items: { label: string; value: string; icon: IconName }[]) => <View style={s.statsGrid}>{items.map((item) => <View key={item.label} style={s.statCard}><View style={s.statTop}><AppIcon name={item.icon} size={17} color={C.teal} /><Text style={s.statValue}>{item.value}</Text></View><Text style={s.statLabel}>{item.label}</Text></View>)}</View>;

  const appointmentCard = (task: AnyRow) => {
    const status = String(task.status ?? 'requested');
    const type = role === 'lab' ? 'Lab test' : 'Consultation';
    const nextStatus = role === 'lab' ? ({ requested:'Accept', accepted:'Collect sample', sample_collected:'Start processing', processing:'Upload report' } as AnyRow)[status] : ({ requested:'Confirm appointment', confirmed:'Start consultation', in_progress:'Complete consultation' } as AnyRow)[status];
    const advance = role === 'lab' && status === 'processing' ? async () => await advanceAppointment(task) : () => void advanceAppointment(task);
    return <View key={task.id} style={s.taskCard}><View style={s.taskTop}><Text style={s.taskTag}>{type.toUpperCase()}</Text><Text style={s.statusChip}>{titleCase(status)}</Text></View><Text style={s.taskName}>{task.customer_name || 'Patient'}</Text><Text style={s.taskDetails}>{task.customer_phone || ''} | {task.test_name || task.scheduled_at || task.created_at || ''}</Text>{task.reason ? <Text style={s.taskBody}>{task.reason}</Text> : null}
      {role === 'lab' && status === 'processing' ? <>{input('Secure report URL (optional)','report',reportUrl,setReportUrl,{ autoCapitalize: 'none', keyboardType: 'url' })}{smallAction(reportAsset ? `Selected: ${reportAsset.name}` : 'Choose report PDF or image', async () => { try { const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false }); if (!result.canceled && result.assets[0]) { if (result.assets[0].size && result.assets[0].size > 10 * 1024 * 1024) { setNotice('Choose a report file up to 10 MB.'); return; } setReportAsset(result.assets[0]); setNotice(''); } } catch { setNotice('Could not open the report file picker.'); } })}</> : null}
      {nextStatus ? smallAction(nextStatus, advance) : null}
      {role === 'doctor' && ['in_progress','completed'].includes(status) ? smallAction(task.prescription_items?.length ? 'Edit medicine prescription' : 'Write medicine prescription', () => { setPrescriptionTask(task); setPrescriptionDraft((task.prescription_items ?? []).map((item: AnyRow) => [item.name,item.strength,item.dosage,item.frequency,item.duration,item.instructions].join(' | ')).join('\n')); setModal('prescription'); }) : null}
      {role === 'doctor' && ['confirmed','in_progress'].includes(status) ? smallAction(task.meeting_url ? 'Update meeting link' : 'Share meeting link', () => { setMeetingTask(task); setMeetingUrl(String(task.meeting_url ?? '')); setModal('meeting'); }) : null}
    </View>;
  };

  const orderCard = (item: AnyRow) => {
    const status = item.order_status || 'pending';
    const next: Record<string,string> = { pending:'confirmed', confirmed:'processing', processing:'ready_for_pickup', ready_for_pickup:'out_for_delivery', out_for_delivery:'delivered' };
    return <View key={item.id} style={s.taskCard}><View style={s.taskTop}><Text style={s.taskTag}>ORDER {item.order_number || `#${item.id}`}</Text><Text style={s.statusChip}>{titleCase(status)}</Text></View><Text style={s.taskName}>{item.customer_name || 'Customer'} | {fmtMoney(item.order_amount)}</Text><Text style={s.taskDetails}>{item.customer_phone || ''} | {item.created_at || ''}</Text>{(item.items ?? []).map((product: AnyRow) => <Text key={product.id} style={s.taskBody}>{product.product_name} x {product.quantity}</Text>)}{next[status] ? smallAction(`Mark ${titleCase(next[status])}`, () => void updateStatus('order', Number(item.id), next[status])) : null}</View>;
  };

  const medicineCard = (item: AnyRow) => <View key={item.id} style={s.listRow}><View style={s.rowIconBox}><AppIcon name="prescription" size={17} color={C.mint} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.name}</Text><Text style={s.rowSub}>{fmtMoney(item.discount_price || item.price)} | Stock {item.stock} | {titleCase(item.medicine_type)}</Text></View>{smallAction('Archive', () => void archiveItem(item), true)}</View>;
  const labTestCard = (item: AnyRow) => <View key={item.id} style={s.listRow}><View style={s.rowIconBox}><AppIcon name="lab" size={17} color={C.mint} /></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.name}</Text><Text style={s.rowSub}>{fmtMoney(item.price)} | {item.code || 'Test'} | {item.status || 'active'}</Text></View>{smallAction('Archive', () => void archiveItem(item), true)}</View>;

  const pharmacyRequests = () => tasks.map((task) => <View key={task.id} style={s.taskCard}><View style={s.taskTop}><Text style={s.taskTag}>PRESCRIPTION #{task.id}</Text><Text style={s.statusChip}>{titleCase(task.status)}</Text></View><Text style={s.taskName}>{task.customer_name || 'Patient'} | {task.customer_phone || ''}</Text><Text style={s.taskDetails}>{task.created_at || ''} | {task.prescription_source === 'doctor' ? `Pickup code ${task.pickup_code || ''}` : task.file_name || 'Prescription uploaded'}</Text>{task.medicine_list?.map((item: AnyRow, index: number) => <Text key={`${task.id}-medicine-${index}`} style={s.taskBody}>{item.name}{item.strength ? ` | ${item.strength}` : ''}{item.dosage ? ` | ${item.dosage}` : ''}{item.frequency ? ` | ${item.frequency}` : ''}{item.duration ? ` | ${item.duration}` : ''}{item.instructions ? ` | ${item.instructions}` : ''}</Text>)}{task.note ? <Text style={s.taskBody}>{task.note}</Text> : null}{task.quote_total ? <Text style={s.quoteValue}>Current quote | {fmtMoney(task.quote_total)}</Text> : null}{['assigned','quoted'].includes(task.status) && smallAction(task.quote_total ? 'Update medicine quote' : 'Prepare medicine quote', () => { setQuoteTask(task); setQuoteForm((old) => ({ ...old, medicine_name: (task.medicine_list ?? []).map((item: AnyRow) => `${item.name}${item.strength ? ` (${item.strength})` : ''} | ${item.pack || 'strip'} | ${item.quantity || 1} | `).join('\n') })); setModal('quote'); })}{task.prescription_source === 'doctor' && task.status === 'payment_pending' && smallAction('Mark ready for pickup', () => void markPickupReady(task))}</View>);

  const dashboardScreen = () => <ScrollView contentContainerStyle={s.pageContent} refreshControl={undefined}>
    {providerBanner()}
    {statCards([{ label: 'Total', value: String(analytics.total_tasks ?? 0), icon: 'total' }, { label: 'Pending', value: String(analytics.pending_tasks ?? 0), icon: 'pending' }, { label: 'Completed', value: String(analytics.completed_tasks ?? 0), icon: 'completed' }, { label: 'Paid revenue', value: fmtMoney(analytics.revenue), icon: 'revenue' }])}
    {section(role === 'pharmacy' ? 'Medicine orders' : role === 'lab' ? 'Lab appointments' : 'Consultations', smallAction('Refresh', () => void loadWorkspace()))}
    {role === 'pharmacy' ? orders.slice(0,4).map(orderCard) : tasks.slice(0,5).map(appointmentCard)}
    {role === 'pharmacy' && <>{section('Prescription requests')}{pharmacyRequests().slice(0,4)}</>}
    {role === 'lab' && <>{section('Laboratory tests', smallAction('+ Add test', () => setModal('item')))}{labTests.slice(0,5).map(labTestCard)}</>}
    {role === 'pharmacy' && <>{section('Medicine catalogue', smallAction('+ Add', () => setModal('item')))}{products.slice(0,5).map(medicineCard)}</>}
    {!tasks.length && role !== 'pharmacy' && <Empty title="No new assignments" detail="New patient requests will appear here." />}
  </ScrollView>;

  const patientsScreen = () => <ScrollView contentContainerStyle={s.pageContent}>{providerBanner()}{section('Patients', smallAction('Refresh', () => void loadWorkspace()))}{patients.length ? patients.map((patient, index) => <View key={`${patient.customer_phone}-${index}`} style={s.listRow}><View style={s.patientAvatar}><Text style={s.patientAvatarText}>{(patient.customer_name || 'P').slice(0,1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{patient.customer_name || 'Patient'}</Text><Text style={s.rowSub}>{patient.customer_phone || 'Phone not available'} | {patient.visits || 1} visit(s)</Text><Text style={s.rowSub}>Last visit | {patient.last_visit || '-'}</Text></View></View>) : <Empty title="Patients will appear here" detail="Patient information is shown after your first assignment." />}</ScrollView>;

  const messagesScreen = () => <ScrollView contentContainerStyle={s.pageContent}>{providerBanner()}{conversation ? <><Pressable onPress={() => setConversation(null)} style={s.backLink}><AppIcon name="back" size={15} color={C.teal} /><Text style={s.linkText}>All conversations</Text></Pressable><View style={s.chatCard}><Text style={s.sectionTitle}>{conversation.customer_name || 'Patient'}</Text><Text style={s.rowSub}>{conversation.entity_type || 'Medical'} | #{conversation.entity_id}</Text><ScrollView style={s.messageList}>{messages.map((message, index) => <View key={message.id ?? index} style={[s.messageBubble, message.sender_type === 'provider' && s.messageBubbleMine]}><Text style={s.messageText}>{message.body}</Text><Text style={s.messageTime}>{message.created_at}</Text></View>)}</ScrollView><View style={s.composer}><TextInput value={draft} onChangeText={setDraft} placeholder="Write a message" placeholderTextColor={C.placeholder} style={s.composerInput} /><Pressable onPress={() => void sendMessage()} style={s.sendButton}><AppIcon name="send" size={17} color="#041312" /></Pressable></View></View></> : <>{section('Messages', smallAction('Refresh', () => void loadConversations()))}{conversations.length ? conversations.map((item) => <Pressable key={item.id} onPress={() => void openConversation(item)} style={s.listRow}><View style={s.patientAvatar}><Text style={s.patientAvatarText}>{(item.customer_name || 'P').slice(0,1).toUpperCase()}</Text></View><View style={{ flex: 1 }}><Text style={s.rowTitle}>{item.customer_name || 'Patient'}</Text><Text style={s.rowSub}>{item.last_message || `${titleCase(item.entity_type)} | #${item.entity_id}`}</Text></View><Text style={s.chatTime}>{item.last_message_at || ''}</Text></Pressable>) : <Empty title="No patient conversations yet" detail="Messages with your patients will appear here." />}</>}</ScrollView>;

  const analyticsScreen = () => <ScrollView contentContainerStyle={s.pageContent}>{providerBanner()}{section('Analytics')}{statCards([{ label: 'Total', value: String(analytics.total_tasks ?? 0), icon: 'total' }, { label: 'Pending', value: String(analytics.pending_tasks ?? 0), icon: 'pending' }, { label: 'Completed', value: String(analytics.completed_tasks ?? 0), icon: 'completed' }, { label: 'Paid revenue', value: fmtMoney(analytics.revenue), icon: 'revenue' }])}<View style={s.completionCard}><Text style={s.rowTitle}>Completion rate</Text><View style={s.progressTrack}><View style={[s.progressFill, { width: `${analytics.total_tasks ? Math.round(Number(analytics.completed_tasks || 0) / Number(analytics.total_tasks) * 100) : 0}%` }]} /></View><Text style={s.rowSub}>{analytics.total_tasks ? Math.round(Number(analytics.completed_tasks || 0) / Number(analytics.total_tasks) * 100) : 0}% of assigned work completed</Text></View><View style={s.completionCard}><Text style={s.rowTitle}>Verified operational analytics</Text><Text style={s.rowSub}>Revenue includes only records confirmed as paid by the website.</Text></View></ScrollView>;

  const updateProfileField = (key: string, value: string) => setProvider((old) => old ? ({ ...old, [key]: value }) : old);
  const accountScreen = () => <ScrollView contentContainerStyle={s.pageContent}>{providerBanner()}<View style={s.accountOption}><AppIcon name="profile" size={19} /><View style={{ flex: 1 }}><Text style={s.rowTitle}>Professional profile</Text><Text style={s.rowSub}>{provider?.name} | {provider?.license_number}</Text></View><AppIcon name="arrow" size={16} color={C.muted} /></View><View style={s.accountOption}><AppIcon name="verified" size={19} /><View style={{ flex: 1 }}><Text style={s.rowTitle}>Verification</Text><Text style={s.rowSub}>{provider?.license_number} | {titleCase(provider?.status || 'approved')}</Text></View><AppIcon name="check" size={17} color={C.mint} /></View><Pressable onPress={() => setModal('appearance')} style={s.accountOption}><AppIcon name="appearance" size={19} /><View style={{ flex: 1 }}><Text style={s.rowTitle}>Appearance</Text><Text style={s.rowSub}>Switch between light and dark mode</Text></View><AppIcon name="arrow" size={16} color={C.muted} /></Pressable>
    {section(role === 'pharmacy' ? 'Pharmacy settings' : role === 'lab' ? 'Laboratory settings' : 'Practice settings', smallAction('Save', () => void updateProvider()))}
    <View style={s.profileFields}>{input('Owner / professional name','name',provider?.name ?? '',(value) => updateProfileField('name',value))}{input('Business / clinic name','business_name',provider?.business_name ?? '',(value) => updateProfileField('business_name',value))}{input('Email','email',provider?.email ?? '',(value) => updateProfileField('email',value),{ keyboardType: 'email-address', autoCapitalize:'none' })}
      {role === 'doctor' && <>{input('Speciality','speciality',provider?.speciality ?? '',(value) => updateProfileField('speciality',value))}{input('Qualification','qualification',provider?.qualification ?? '',(value) => updateProfileField('qualification',value))}{input('Consultation fee (INR)','consultation_fee',String(provider?.consultation_fee ?? ''),(value) => updateProfileField('consultation_fee',value),{ keyboardType:'decimal-pad' })}{input('Availability','availability_text',provider?.availability_text ?? '',(value) => updateProfileField('availability_text',value))}</>}
      {input('Address','address',provider?.address ?? '',(value) => updateProfileField('address',value),{ multiline:true })}{input('Opening hours','opening_hours',provider?.opening_hours ?? '',(value) => updateProfileField('opening_hours',value))}{input('Service radius (km)','service_radius_km',String(provider?.service_radius_km ?? ''),(value) => updateProfileField('service_radius_km',value),{ keyboardType:'decimal-pad' })}{input('Public profile description','description',provider?.description ?? '',(value) => updateProfileField('description',value),{ multiline:true })}
      {role === 'pharmacy' && <>{input('Default delivery fee (INR)','default_delivery_fee',String(provider?.default_delivery_fee ?? 0),(value) => updateProfileField('default_delivery_fee',value),{ keyboardType:'decimal-pad' })}{section('Medicine catalogue', smallAction('+ Add', () => setModal('item')))}{products.map(medicineCard)}</>}
      {role === 'lab' && <>{input('Home collection fee (INR)','home_collection_fee',String(provider?.home_collection_fee ?? 0),(value) => updateProfileField('home_collection_fee',value),{ keyboardType:'decimal-pad' })}{section('Laboratory tests', smallAction('+ Add', () => setModal('item')))}{labTests.map(labTestCard)}</>}
    </View><Pressable onPress={signOut} style={s.signoutButton}><AppIcon name="signout" size={16} color="#d9e5e4" /><Text style={s.signoutText}>Sign out</Text></Pressable></ScrollView>;

  const content = useMemo(() => ({ Dashboard: dashboardScreen, Patients: patientsScreen, Messages: messagesScreen, Analytics: analyticsScreen, Account: accountScreen }[tab]()), [tab, workspace, provider, conversation, messages, draft, reportUrl, products, labTests, orders, patients, tasks, analytics, notice, role, refreshing, appearance]);

  const modalContent = () => {
    if (modal === 'prescription') return <><Text style={s.modalTitle}>Doctor prescription</Text><Text style={s.formHint}>Enter one medicine per line: name | strength | dosage | frequency | duration | instructions.</Text><TextInput value={prescriptionDraft} onChangeText={setPrescriptionDraft} placeholder="Medicine name | strength | dosage | frequency | duration | instructions" placeholderTextColor={C.placeholder} multiline textAlignVertical="top" style={[s.input,s.inputMultiline,{ minHeight:150, marginTop:8 }]} />{smallAction(busy ? 'Saving...' : 'Save prescription & notify patient', () => void saveConsultationPrescription())}</>;
    if (modal === 'location') {
      const selectedZone = zones.find((zone) => Number(zone.id) === zoneId);
      const zoneLat = Number(selectedZone?.latitude || 0);
      const zoneLng = Number(selectedZone?.longitude || 0);
      const center = mapPin ?? { latitude: zoneLat || 20.5937, longitude: zoneLng || 78.9629 };
      return <><Text style={s.modalTitle}>Choose your premises location</Text><Text style={s.formHint}>Search an address or tap the map to place a pin, then add the selected location to your registration.</Text>
        <View style={s.locationSearchRow}><TextInput value={locationQuery} onChangeText={(value) => { setLocationQuery(value); setLocationChoices([]); setSelectedLocation(null); setMapPin(null); }} onSubmitEditing={() => void searchLocations()} placeholder="Address, area, landmark, or PIN code" placeholderTextColor={C.placeholder} style={[s.input,s.locationSearchInput]} returnKeyType="search" /></View>
        <Pressable disabled={locationBusy} onPress={() => void searchLocations()} style={[s.primaryButton,locationBusy && s.buttonDisabled]}><Text style={s.primaryButtonText}>{locationBusy ? 'Searching…' : 'Search address'}</Text></Pressable>
        {locationChoices.map((choice, index) => <Pressable key={`${choice.latitude}-${choice.longitude}-${index}`} onPress={() => { setSelectedLocation(choice); setMapPin({ latitude: choice.latitude, longitude: choice.longitude }); setLocationQuery(choice.address); setLocationNotice('Address selected. Add it below to use these premises.'); }} style={s.locationResult}><Text style={s.locationResultTitle}>{choice.address}</Text><Text style={s.locationResultSub}>{[choice.city, choice.pincode].filter(Boolean).join(' · ') || 'Tap to select this address'}</Text></Pressable>)}
        <LocationMap center={center} selected={mapPin} onSelect={selectLocationPin} />
        {locationNotice ? <Text style={s.locationNotice}>{locationNotice}</Text> : mapPin ? <Text style={s.selectedCoordinates}>Selected pin · {mapPin.latitude.toFixed(6)}, {mapPin.longitude.toFixed(6)}</Text> : <Text style={s.selectedCoordinates}>Search for an address or tap the map to place a pin.</Text>}
      </>;
    }
    if (modal === 'appearance') return <><Text style={s.modalTitle}>Appearance</Text>{['Use device setting','Light','Dark'].map((item) => <Pressable key={item} style={s.appearanceChoice} onPress={() => { setAppearance(item); setModal(null); }}><AppIcon name={appearance === item ? 'check' : 'radio'} size={17} color={appearance === item ? C.teal : C.muted} /><Text style={s.rowTitle}>{item}</Text></Pressable>)}</>;
    if (modal === 'quote') return <><Text style={s.modalTitle}>Medicine quote</Text><Text style={s.formHint}>Enter one item per line: medicine name | pack | quantity | unit price. Fill each prescribed medicine price.</Text>{input('Medicines','medicine_name',quoteForm.medicine_name,(value) => setQuoteForm((old) => ({ ...old, medicine_name:value })),{ multiline:true })}<View style={s.fieldRow}>{input('Pack','pack',quoteForm.pack,(value) => setQuoteForm((old) => ({ ...old, pack:value })))}{input('Quantity','quantity',quoteForm.quantity,(value) => setQuoteForm((old) => ({ ...old, quantity:value })),{ keyboardType:'number-pad' })}</View><View style={s.fieldRow}>{input('Unit price (INR)','unit_price',quoteForm.unit_price,(value) => setQuoteForm((old) => ({ ...old, unit_price:value })),{ keyboardType:'decimal-pad' })}{input('Delivery fee (INR)','delivery_fee',quoteForm.delivery_fee,(value) => setQuoteForm((old) => ({ ...old, delivery_fee:value })),{ keyboardType:'decimal-pad' })}</View>{input('Note (optional)','note',quoteForm.note,(value) => setQuoteForm((old) => ({ ...old, note:value })))}{smallAction('Send quote to patient', () => void sendQuote())}</>;
    if (modal === 'item') return <><Text style={s.modalTitle}>{role === 'lab' ? 'Add laboratory test' : 'Add medicine'}</Text>{input(role === 'lab' ? 'Test name' : 'Medicine name','name',itemForm.name,(value) => setItemForm((old) => ({ ...old, name:value })))}{input('Description','description',itemForm.description,(value) => setItemForm((old) => ({ ...old, description:value })),{ multiline:true })}
      {role === 'lab' ? <>{input('Test code','code',itemForm.code,(value) => setItemForm((old) => ({ ...old, code:value })))}{input('Preparation instructions','preparation',itemForm.preparation,(value) => setItemForm((old) => ({ ...old, preparation:value })),{ multiline:true })}<View style={s.fieldRow}>{input('Price (INR)','price',itemForm.price,(value) => setItemForm((old) => ({ ...old, price:value })),{ keyboardType:'decimal-pad' })}{input('Report hours','report_hours',itemForm.report_hours,(value) => setItemForm((old) => ({ ...old, report_hours:value })),{ keyboardType:'number-pad' })}</View></> : <>
        <View style={s.fieldRow}>{input('Unit / pack','unit',itemForm.unit,(value) => setItemForm((old) => ({ ...old, unit:value })))}{input('SKU / barcode','sku',itemForm.sku,(value) => setItemForm((old) => ({ ...old, sku:value })))}</View>
        <View style={s.fieldRow}>{input('MRP (INR)','price',itemForm.price,(value) => setItemForm((old) => ({ ...old, price:value })),{ keyboardType:'decimal-pad' })}{input('Offer price (INR)','discount_price',itemForm.discount_price,(value) => setItemForm((old) => ({ ...old, discount_price:value })),{ keyboardType:'decimal-pad' })}</View>
        {input('Stock quantity','stock',itemForm.stock,(value) => setItemForm((old) => ({ ...old, stock:value })),{ keyboardType:'number-pad' })}
        <Text style={s.inputLabel}>Medicine type</Text><View style={s.roleSegment}>{['otc','prescription_required','restricted'].map((item) => <Pressable key={item} onPress={() => setItemForm((old) => ({ ...old, medicine_type:item }))} style={[s.roleSegmentItem, itemForm.medicine_type === item && s.roleSegmentActive]}><Text style={[s.roleSegmentText, itemForm.medicine_type === item && s.roleSegmentTextActive]}>{titleCase(item)}</Text></Pressable>)}</View>
        {input('Schedule / risk tag','schedule_tag',itemForm.schedule_tag,(value) => setItemForm((old) => ({ ...old, schedule_tag:value })))}
        <View style={s.fieldRow}>{input('Max quantity per order','max_qty_per_order',itemForm.max_qty_per_order,(value) => setItemForm((old) => ({ ...old, max_qty_per_order:value })),{ keyboardType:'number-pad' })}{input('Max quantity per month','max_qty_per_month',itemForm.max_qty_per_month,(value) => setItemForm((old) => ({ ...old, max_qty_per_month:value })),{ keyboardType:'number-pad' })}</View>
        {(['requires_pharmacist_review','requires_age_confirmation','allows_substitution'] as const).map((key) => <Pressable key={key} onPress={() => setItemForm((old) => ({ ...old, [key]: !old[key] }))} style={s.appearanceChoice}><AppIcon name={itemForm[key] ? 'check' : 'radio'} size={17} color={itemForm[key] ? C.teal : C.muted} /><Text style={s.rowTitle}>{key === 'requires_pharmacist_review' ? 'Pharmacist review before fulfillment' : key === 'requires_age_confirmation' ? 'Require age confirmation' : 'Allow medicine substitution'}</Text></Pressable>)}
      </>}
      {smallAction(role === 'lab' ? 'Save test for review' : 'Add medicine for review', () => void submitInventoryItem())}</>;
    if (modal === 'meeting') return <><Text style={s.modalTitle}>Online consultation link</Text><Text style={s.formHint}>Paste a Google Meet or Zoom link. The patient can open it from their appointment details.</Text>{input('Meeting link (Google Meet / Zoom)','meeting',meetingUrl,setMeetingUrl,{ autoCapitalize:'none', keyboardType:'url' })}{smallAction(busy ? 'Sharing...' : 'Share link with patient', () => void shareMeetingLink())}</>;
    return null;
  };

  return <SafeAreaView style={s.safe} edges={['top','left','right']}><StatusBar barStyle="light-content" backgroundColor={C.bg} />
    {!provider ? authScreen() : <>
      <View style={s.header}><View style={s.headerBrand}><View style={s.headerLogo}><Text style={s.headerLogoText}>A</Text></View><View><Text style={s.headerTitle}>{tab}</Text><Text style={s.headerSubtitle}>{roleName} workspace</Text></View></View><Pressable onPress={() => tab === 'Messages' ? void loadConversations() : void loadWorkspace()} style={s.refreshButton}><AppIcon name="refresh" size={20} color={C.teal} /></Pressable></View>
      {notice ? <Pressable onPress={() => setNotice('')} style={s.notice}><Text style={s.noticeText}>{notice}</Text><AppIcon name="close" size={16} color="#ffe2ac" /></Pressable> : null}
      <View style={s.body}>{content}</View>
      <View style={[s.tabBar, { height: 57 + safeAreaInsets.bottom, paddingBottom: safeAreaInsets.bottom }]}>{tabs.map((item) => <Pressable key={item.title} onPress={() => { setTab(item.title); setNotice(''); if (item.title === 'Messages') void loadConversations(); if (item.title === 'Dashboard' || item.title === 'Patients' || item.title === 'Analytics') void loadWorkspace(); }} style={s.tabButton}><AppIcon name={item.icon} size={18} color={tab === item.title ? C.teal : '#768284'} /><Text style={[s.tabLabel, tab === item.title && s.tabSelected]}>{item.title}</Text>{item.title === 'Messages' && conversations.some((c) => Number(c.unread_count) > 0) ? <View style={s.unreadDot} /> : null}</Pressable>)}</View>
    </>}
    <Modal transparent visible={modal !== null} animationType="slide" onRequestClose={() => setModal(null)}><Pressable style={s.modalBackdrop} onPress={() => setModal(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalDock}><Pressable style={s.modalCard} onPress={(event) => event.stopPropagation()}><View style={s.modalHandle} /><ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{modalContent()}</ScrollView>{modal === 'location' && <Pressable disabled={!selectedLocation || locationBusy} onPress={() => void applySelectedLocation()} style={[s.primaryButton,s.locationConfirmButton,(!selectedLocation || locationBusy) && s.buttonDisabled]}><Text style={s.primaryButtonText}>{locationBusy ? 'Adding location…' : selectedLocation ? 'Select this location' : 'Tap map or search first'}</Text></Pressable>}<Pressable onPress={() => setModal(null)} style={s.modalCancel}><Text style={s.modalCancelText}>Cancel</Text></Pressable></Pressable></KeyboardAvoidingView></Pressable></Modal>
  </SafeAreaView>;
}

function Empty({ title, detail }: { title: string; detail: string }) { return <View style={s.empty}><AppIcon name="empty" size={27} color={C.teal} /><Text style={s.emptyTitle}>{title}</Text><Text style={s.emptyCopy}>{detail}</Text></View>; }

const C = { bg:'#070c0d', card:'#121819', raised:'#192123', line:'#253033', teal:'#06b6a4', tealDark:'#087d74', mint:'#c8fff5', white:'#f5f8f8', muted:'#8e9b9d', placeholder:'#657173', green:'#19c7a5' };
const s = StyleSheet.create({
  safe:{ flex:1, width:'100%', maxWidth:480, alignSelf:'center', backgroundColor:C.bg },
  authScroll:{ flexGrow:1, justifyContent:'center', padding:22, paddingBottom:38 },
  logoTile:{ height:85, width:150, alignSelf:'center', alignItems:'center', justifyContent:'center', borderRadius:17, backgroundColor:'#f9ffff', marginBottom:18 },logoMark:{ color:'#087f80', fontWeight:'900', fontSize:35, lineHeight:39 },logoSpark:{ color:C.teal, fontSize:19 },logoWord:{ color:'#087878', fontWeight:'900', fontSize:16, letterSpacing:2, marginTop:-2 },logoSub:{ color:'#456d70', fontSize:7, fontWeight:'800', letterSpacing:4 },
  authTitle:{ textAlign:'center', color:C.white, fontSize:18, fontWeight:'900' },authSub:{ textAlign:'center', color:C.muted, fontSize:10, marginTop:5, marginBottom:17 },roleSegment:{ flexDirection:'row', backgroundColor:C.card, borderWidth:1, borderColor:C.line, borderRadius:12, padding:3, marginBottom:12, gap:3 },roleSegmentItem:{ flex:1, borderRadius:9, minHeight:35, alignItems:'center', justifyContent:'center', paddingHorizontal:4 },roleSegmentActive:{ backgroundColor:'#28504b' },roleSegmentText:{ color:'#9aa5a7', fontSize:9, fontWeight:'800' },roleSegmentTextActive:{ color:C.mint },
  authCard:{ backgroundColor:C.card, borderRadius:17, padding:15, borderWidth:1, borderColor:'#1d272a' },authCardTitle:{ color:C.white, fontWeight:'900', fontSize:14, marginBottom:10 },inputWrap:{ flex:1, marginBottom:8 },inputLabel:{ color:'#bcc8c9', fontSize:8, fontWeight:'700', marginBottom:5 },input:{ minHeight:37, borderRadius:10, backgroundColor:'#1a2225', borderWidth:1, borderColor:'#252f32', paddingHorizontal:10, color:C.white, fontSize:10 },inputMultiline:{ minHeight:64, paddingTop:10, textAlignVertical:'top' },fieldRow:{ flexDirection:'row', gap:9 },formHint:{ color:C.muted, fontSize:9, lineHeight:14, marginBottom:11 },primaryButton:{ minHeight:40, borderRadius:10, backgroundColor:C.teal, alignItems:'center', justifyContent:'center', marginTop:6 },primaryButtonText:{ color:'#041312', fontSize:10, fontWeight:'900' },demoLoginButton:{ minHeight:38, borderRadius:10, borderWidth:1, borderColor:'#28645d', alignItems:'center', justifyContent:'center', marginTop:8, backgroundColor:'#13201f' },demoLoginText:{ color:C.mint, fontSize:9, fontWeight:'900' },linkButton:{ alignItems:'center', paddingTop:11 },linkText:{ color:C.teal, fontSize:9, fontWeight:'800' },authNotice:{ color:'#ffcf85', fontSize:10, lineHeight:15, textAlign:'center', marginTop:11 },chooseCard:{ padding:17, alignItems:'center', backgroundColor:C.card, borderRadius:14 },chooseTitle:{ color:C.white, fontSize:12, fontWeight:'800' },chooseCopy:{ color:C.muted, fontSize:9, marginTop:5 },zonePicker:{ flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:9 },zoneOption:{ paddingHorizontal:9, paddingVertical:7, borderRadius:8, backgroundColor:C.raised },zoneOptionOn:{ backgroundColor:'#164e49', borderColor:C.teal, borderWidth:1 },zoneOptionText:{ color:C.muted, fontSize:8, fontWeight:'700' },zoneOptionTextOn:{ color:C.mint },
  header:{ height:54, flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:15, borderBottomWidth:StyleSheet.hairlineWidth, borderColor:'#202a2c' },headerBrand:{ flexDirection:'row', alignItems:'center', gap:9 },headerLogo:{ height:31, width:31, borderRadius:10, backgroundColor:'#15534d', alignItems:'center', justifyContent:'center' },headerLogoText:{ color:C.mint, fontSize:17, fontWeight:'900' },headerTitle:{ color:C.white, fontSize:13, fontWeight:'800' },headerSubtitle:{ color:C.muted, fontSize:8, marginTop:2 },refreshButton:{ height:34, width:34, alignItems:'center', justifyContent:'center' },refreshGlyph:{ color:C.teal, fontSize:20 },body:{ flex:1 },pageContent:{ padding:13, paddingBottom:25 },
  notice:{ flexDirection:'row', alignItems:'center', backgroundColor:'#352817', borderRadius:10, padding:9, marginHorizontal:12, marginTop:8 },noticeText:{ color:'#ffe2ac', fontSize:9, flex:1 },dismiss:{ color:'#ffe2ac', fontSize:16, paddingHorizontal:5 },providerBanner:{ minHeight:61, backgroundColor:'#08796f', borderRadius:14, flexDirection:'row', alignItems:'center', gap:9, padding:11, marginBottom:11 },providerAvatar:{ height:36, width:36, borderRadius:18, backgroundColor:'#dcfff8', alignItems:'center', justifyContent:'center' },providerAvatarText:{ color:C.tealDark, fontSize:17, fontWeight:'900' },providerName:{ color:'white', fontSize:11, fontWeight:'900' },providerMeta:{ color:'#d8fff8', fontSize:8, marginTop:4 },verifiedChip:{ backgroundColor:'#d7fff4', paddingHorizontal:7, paddingVertical:5, borderRadius:10 },verifiedText:{ color:'#087f74', fontSize:7, fontWeight:'900' },
  statsGrid:{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between', rowGap:8, marginBottom:15 },statCard:{ width:'49%', backgroundColor:C.card, minHeight:57, borderRadius:12, padding:10, borderWidth:1, borderColor:'#1d282b' },statTop:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },statGlyph:{ color:C.teal, fontSize:15, fontWeight:'900' },statValue:{ color:C.white, fontSize:16, fontWeight:'900' },statLabel:{ color:C.muted, fontSize:8, marginTop:4 },sectionHead:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginTop:4, marginBottom:8 },sectionTitle:{ color:C.white, fontSize:12, fontWeight:'900' },smallButton:{ minHeight:30, alignItems:'center', justifyContent:'center', borderRadius:9, backgroundColor:'#087d74', paddingHorizontal:10, marginTop:6, alignSelf:'flex-start' },smallButtonOutline:{ backgroundColor:'transparent', borderWidth:1, borderColor:'#315b56' },smallButtonText:{ color:'#edfffb', fontSize:8, fontWeight:'900' },smallButtonTextOutline:{ color:C.mint },
  taskCard:{ backgroundColor:C.card, borderRadius:13, padding:12, marginBottom:8, borderWidth:1, borderColor:'#1d282a' },taskTop:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 },taskTag:{ color:C.teal, fontSize:7, letterSpacing:1, fontWeight:'900' },statusChip:{ color:'#b2c6c5', fontSize:7, paddingHorizontal:7, paddingVertical:4, backgroundColor:'#202b2d', borderRadius:8, overflow:'hidden' },taskName:{ color:C.white, fontSize:11, fontWeight:'800' },taskDetails:{ color:C.muted, fontSize:8, marginTop:4 },taskBody:{ color:'#bac7c8', fontSize:9, lineHeight:14, marginTop:8 },quoteValue:{ color:C.mint, fontSize:9, marginTop:8, fontWeight:'800' },listRow:{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor:C.card, borderRadius:12, padding:10, marginBottom:7, borderWidth:1, borderColor:'#1c2628' },rowIconBox:{ width:32, height:32, borderRadius:10, backgroundColor:'#164844', alignItems:'center', justifyContent:'center' },rowIconText:{ color:C.mint, fontSize:12, fontWeight:'900' },rowTitle:{ color:'#edf5f4', fontSize:10, fontWeight:'800' },rowSub:{ color:C.muted, fontSize:8, marginTop:4 },patientAvatar:{ width:34, height:34, borderRadius:17, backgroundColor:'#1d4844', alignItems:'center', justifyContent:'center' },patientAvatarText:{ color:C.mint, fontSize:14, fontWeight:'900' },arrow:{ color:'#8c999b', fontSize:20 },empty:{ minHeight:130, alignItems:'center', justifyContent:'center', backgroundColor:C.card, borderRadius:14, padding:18, marginTop:5 },emptyGlyph:{ color:C.teal, fontSize:27 },emptyTitle:{ color:C.white, fontSize:11, fontWeight:'900', marginTop:7, textAlign:'center' },emptyCopy:{ color:C.muted, fontSize:8, lineHeight:13, textAlign:'center', marginTop:5 },
  completionCard:{ backgroundColor:C.card, padding:14, borderRadius:13, marginBottom:9 },progressTrack:{ height:5, backgroundColor:'#253033', borderRadius:5, marginTop:12, marginBottom:7, overflow:'hidden' },progressFill:{ height:'100%', backgroundColor:C.teal, borderRadius:5 },
  accountOption:{ minHeight:52, flexDirection:'row', alignItems:'center', gap:10, backgroundColor:C.card, paddingHorizontal:11, marginBottom:7, borderRadius:11 },optionGlyph:{ color:C.teal, fontSize:17, width:22, textAlign:'center' },profileFields:{ backgroundColor:C.card, padding:12, borderRadius:13 },signoutButton:{ minHeight:36, alignItems:'center', justifyContent:'center', borderRadius:20, borderColor:'#3c4b4d', borderWidth:1, marginTop:13 },signoutText:{ color:'#d9e5e4', fontSize:9, fontWeight:'800' },
  tabBar:{ height:57, flexDirection:'row', justifyContent:'space-around', alignItems:'center', borderTopWidth:StyleSheet.hairlineWidth, borderColor:'#222c2e', backgroundColor:'#0b1112', paddingHorizontal:3 },tabButton:{ width:'20%', alignItems:'center', justifyContent:'center', gap:3, position:'relative' },tabGlyph:{ color:'#768284', fontSize:16 },tabSelected:{ color:C.teal, fontWeight:'900' },tabLabel:{ color:'#7f8a8b', fontSize:7 },unreadDot:{ position:'absolute', width:6, height:6, backgroundColor:'#ed8f60', borderRadius:4, top:0, right:20 },
  chatTime:{ color:C.muted, fontSize:7 },chatCard:{ backgroundColor:C.card, borderRadius:14, padding:12, marginTop:9, height:440 },messageList:{ flex:1, marginVertical:10 },messageBubble:{ alignSelf:'flex-start', backgroundColor:'#202a2c', borderRadius:11, padding:9, maxWidth:'85%', marginBottom:7 },messageBubbleMine:{ alignSelf:'flex-end', backgroundColor:'#115b54' },messageText:{ color:C.white, fontSize:9, lineHeight:14 },messageTime:{ color:'#8f9e9e', fontSize:7, marginTop:4 },composer:{ flexDirection:'row', alignItems:'center', gap:8 },composerInput:{ flex:1, backgroundColor:'#20292b', color:C.white, borderRadius:10, minHeight:36, paddingHorizontal:10, fontSize:9 },sendButton:{ width:35, height:35, backgroundColor:C.teal, borderRadius:11, alignItems:'center', justifyContent:'center' },sendText:{ color:'#041312', fontSize:17, fontWeight:'900' },
  modalBackdrop:{ flex:1, backgroundColor:'rgba(0,0,0,.65)', justifyContent:'flex-end' },modalDock:{ width:'100%', maxWidth:480, alignSelf:'center' },modalCard:{ maxHeight:'90%', backgroundColor:'#111819', borderTopLeftRadius:22, borderTopRightRadius:22, padding:15, paddingBottom:22, borderWidth:1, borderColor:'#263235' },modalHandle:{ alignSelf:'center', width:37, height:4, borderRadius:4, backgroundColor:'#475355', marginBottom:14 },modalTitle:{ color:C.white, fontSize:15, fontWeight:'900', marginBottom:8 },modalCancel:{ alignItems:'center', paddingTop:10 },modalCancelText:{ color:C.muted, fontSize:9, fontWeight:'800' },appearanceChoice:{ flexDirection:'row', alignItems:'center', gap:10, minHeight:40 },selectionMark:{ color:C.muted, fontSize:15 },selectionMarkOn:{ color:C.teal },mapSelectButton:{ minHeight:55, flexDirection:'row', alignItems:'center', gap:9, paddingHorizontal:10, borderRadius:11, backgroundColor:'#192526', borderWidth:1, borderColor:'#28645d', marginBottom:9 },pinIcon:{ width:22, height:22, borderRadius:11, backgroundColor:C.teal, alignItems:'center', justifyContent:'center' },pinIconDot:{ width:7, height:7, borderRadius:4, backgroundColor:'#041312' },mapSelectTitle:{ color:C.white, fontSize:9, fontWeight:'900' },mapSelectSub:{ color:C.muted, fontSize:8, marginTop:4 },seeMap:{ color:C.teal, fontSize:8, fontWeight:'900' },locationSearchRow:{ marginBottom:7 },locationSearchInput:{ width:'100%' },locationResult:{ padding:10, marginTop:6, borderRadius:10, backgroundColor:'#192526', borderWidth:1, borderColor:'#28645d' },locationResultTitle:{ color:C.white, fontSize:9, fontWeight:'800' },locationResultSub:{ color:C.muted, fontSize:8, marginTop:4 },locationNotice:{ color:'#ffcf85', fontSize:9, lineHeight:14, textAlign:'center', marginVertical:7 },selectedCoordinates:{ color:C.mint, fontSize:8, textAlign:'center', marginVertical:5 },locationConfirmButton:{ marginTop:8, marginBottom:2 },buttonDisabled:{ opacity:0.45 },
  authNoticeText:{ color:C.muted },zoneError:{ color:C.muted }
});

