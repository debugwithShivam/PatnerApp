import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import type { LocationMapProps } from './location-map';

export function LocationMap({ center, selected, onSelect }: LocationMapProps) {
  const mapsEnabled = Constants.expoConfig?.extra?.googleMapsAndroidEnabled === true;
  if (!mapsEnabled) {
    return <View style={s.frame}><Text style={s.unavailable}>Google Maps is paused in this APK to prevent a crash. Enable it after verifying the Android Maps API key and app signing restrictions.</Text></View>;
  }

  const focus = selected ?? center;
  return (
    <View style={s.frame}>
      <MapView
        style={s.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={{ ...focus, latitudeDelta: 0.08, longitudeDelta: 0.08 }}
        onPress={({ nativeEvent }) => onSelect(nativeEvent.coordinate)}
      >
        {selected && <Marker coordinate={selected} title="Your premises" />}
      </MapView>
    </View>
  );
}

const s = StyleSheet.create({ frame: { height: 370, width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#1d292a', alignItems: 'center', justifyContent: 'center', padding: 20 }, map: { flex: 1 }, unavailable: { color: '#f5f8f8', textAlign: 'center', fontSize: 11, lineHeight: 16 } });
