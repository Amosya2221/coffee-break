// Принимает заказ с сайта и создаёт входящий заказ в Poster.
// Ключи берутся из Netlify → Site configuration → Environment variables:
//   POSTER_ACCOUNT  (например coffeebreak — часть адреса coffeebreak.joinposter.com)
//   POSTER_TOKEN    (токен доступа Poster)
//   POSTER_SPOT_ID  (номер заведения в Poster, обычно 1)
const json = (code, body) => ({ statusCode: code, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const norm = s => String(s).toLowerCase().replace(/ё/g, "е").replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "method" });
  const { POSTER_ACCOUNT: acc, POSTER_TOKEN: token, POSTER_SPOT_ID: spot } = process.env;
  if (!acc || !token) return json(500, { error: "not_configured" });
  let d;
  try { d = JSON.parse(event.body || "{}"); } catch (e) { return json(400, { error: "bad_json" }); }
  const phone = String(d.phone || "").replace(/[^\d+]/g, "");
  const items = Array.isArray(d.items) ? d.items.slice(0, 40) : [];
  if (phone.length < 10 || !items.length) return json(400, { error: "bad_data" });

  try {
    const base = `https://${acc}.joinposter.com/api/`;
    const menu = await (await fetch(`${base}menu.getProducts?token=${token}`)).json();
    const byName = new Map((menu.response || []).map(p => [norm(p.product_name), p.product_id]));
    const products = [], rest = [];
    for (const it of items) {
      const q = Math.max(1, Math.min(20, parseInt(it.q, 10) || 1));
      const id = byName.get(norm(it.name));
      if (id) products.push({ product_id: Number(id), count: q });
      else rest.push(`${it.name} × ${q}`);
    }
    const comment = "Заказ с сайта." + (rest.length ? " Не найдено в кассе, добавить вручную: " + rest.join("; ") : "");
    const r = await fetch(`${base}incomingOrders.createIncomingOrder?token=${token}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spot_id: Number(spot || 1), phone, first_name: String(d.name || "").slice(0, 60), comment, products })
    });
    const out = await r.json();
    if (out.error || !out.response) return json(502, { error: "poster", detail: out.message || out.error });
    return json(200, { ok: true, unmatched: rest.length });
  } catch (e) { return json(502, { error: "network" }); }
};
