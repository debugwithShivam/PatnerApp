import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';
import type { LocationMapProps } from './location-map';

export function LocationMap({ center, selected, onSelect }: LocationMapProps) {
  const focus = selected ?? center;
  return (
    <View style={s.frame}>
      <MapView
        key={`${focus.latitude}:${focus.longitude}`}
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

const s: any = StyleSheet.create({ frame: { height: 370, width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 8, backgroundColor: '#1d292a' }, map: { flex: 1 } });
