const appJson = require('./app.json');
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    const localEnv = path.join(__dirname, '.env.local');
    if (fs.existsSync(localEnv)) {
      const entry = fs.readFileSync(localEnv, 'utf8').split(/\r?\n/).find((line) => line.startsWith('GOOGLE_MAPS_API_KEY='));
      if (entry) process.env.GOOGLE_MAPS_API_KEY = entry.slice('GOOGLE_MAPS_API_KEY='.length).trim();
    }
  }
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const plugins = (config.plugins ?? []).filter((plugin) =>
    (Array.isArray(plugin) ? plugin[0] : plugin) !== 'react-native-maps'
  );
  plugins.push([
    'react-native-maps',
    mapsKey ? { androidGoogleMapsApiKey: mapsKey } : {},
  ]);
  return {
    ...appJson.expo,
    ...config,
    extra: {
      ...appJson.expo.extra,
      ...config.extra,
      googleMapsApiKeyConfigured: Boolean(mapsKey),
      googleMapsAndroidEnabled: Boolean(mapsKey),
    },
    plugins,
  };
};
