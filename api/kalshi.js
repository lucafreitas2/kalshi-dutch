export default async function handler(req, res) {
  const { path, ...params } = req.query;

  const query = new URLSearchParams(params).toString();
  const url = `https://external-api.kalshi.com/trade-api/v2${path}${query ? "?" + query : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}