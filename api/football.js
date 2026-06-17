const FOOTBALL_API_KEY = import.meta.env?.VITE_FOOTBALL_API_KEY || '82bc59a2988d42a7b2c65f5abffd582b';

export default async function handler(req, res) {
  const { path, ...params } = req.query;
  const query = new URLSearchParams(params).toString();
  const url = `https://api.football-data.org/v4${path}${query ? "?" + query : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'X-Auth-Token': FOOTBALL_API_KEY,
      },
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}