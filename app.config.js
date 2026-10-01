const appJson = require('./app.json');

module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY;
  const android = { ...config.android };
  if (mapsKey) {
    android.config = {
      ...android.config,
      googleMaps: { ...android.config?.googleMaps, apiKey: mapsKey },
    };
  }
  return { ...appJson.expo, ...config, android };
};
