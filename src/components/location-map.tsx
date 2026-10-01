import { Text, View, StyleSheet } from 'react-native';

export type LocationPin = { latitude: number; longitude: number };
export type LocationMapProps = { center: LocationPin; selected: LocationPin | null; onSelect: (pin: LocationPin) => void };

export function LocationMap(_props: LocationMapProps) {
  return <View style={s.frame}><Text style={s.notice}>Open the Android or iOS app to choose a premises pin.</Text></View>;
}

const s = StyleSheet.create({ frame: { height: 370, width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#1d292a', alignItems: 'center', justifyContent: 'center', padding: 20 }, notice: { color: '#f5f8f8', textAlign: 'center', fontSize: 11 } });
