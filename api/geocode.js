export default async function handler(req, res) {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q requis' });
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'AUREUS-X/0.1 research-map' } });
    if (!r.ok) throw new Error(`Nominatim ${r.status}`);
    const data = await r.json();
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ results: data.map(x => ({
      name: x.display_name,
      lat: Number(x.lat),
      lng: Number(x.lon),
      type: x.type,
      importance: x.importance,
      boundingbox: x.boundingbox
    })) });
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
