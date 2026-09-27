export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    googleMapId: process.env.GOOGLE_MAP_ID || '',
    appVersion: '0.1.0'
  });
}
