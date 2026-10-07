import MapView, { Marker } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

export type LocationPin = {
  latitude: number;
  longitude: number;
};

export type LocationMapProps = {
  center: LocationPin;
  selected: LocationPin | null;
  onSelect: (pin: LocationPin) => void;
};

export function LocationMap({
  center,
  selected,
  onSelect,
}: LocationMapProps) {
  const focus = selected ?? center;

  return (
    <View style={s.frame}>
      <MapView
        style={s.map}
        initialRegion={{
          ...focus,
          latitudeDelta: 0.08,
          longitudeDelta: 0.08,
        }}
        onPress={({ nativeEvent }) => {
          onSelect(nativeEvent.coordinate);
        }}
      >
        {selected && (
          <Marker
            coordinate={selected}
            title="Your premises"
          />
        )}
      </MapView>
    </View>
  );
}

const s: any = StyleSheet.create({
  frame: {
    height: 370,
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#1d292a',
  },

  map: {
    flex: 1,
  },
});