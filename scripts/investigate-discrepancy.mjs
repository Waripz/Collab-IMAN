import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SHOP = env['SHOPIFY_SHOP'];
const CLIENT_ID = env['SHOPIFY_CLIENT_ID'];
const CLIENT_SECRET = env['SHOPIFY_CLIENT_SECRET'];

async function getAdminToken() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return (await res.json()).access_token;
}

async function investigate() {
  const token = await getAdminToken();
  const TARGET_PRODUCT_ID = 8725046624409; // Pratempah Pakej Khas Sedekad

  let pageInfo = null;
  let hasNext = true;
  let totalGross = 0;
  let totalDiscount = 0;
  let totalUnits = 0;
  let duplicateLineItems = 0;
  let pages = 0;

  while (hasNext) {
    pages++;
    let url = `https://${SHOP}.myshopify.com/admin/api/2024-01/orders.json?`;
    if (pageInfo) {
      url += `limit=250&page_info=${pageInfo}`;
    } else {
      url += `status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`;
    }

    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) break;
    const data = await res.json();
    const orders = data.orders || [];
    if (orders.length === 0) break;

    for (const o of orders) {
      if (o.cancelled_at || o.financial_status === 'refunded') continue;
      const matching = (o.line_items || []).filter(li => li.product_id === TARGET_PRODUCT_ID);
      if (matching.length === 0) continue;

      if (matching.length > 1) {
        duplicateLineItems++;
        console.log(`Order ${o.name} has ${matching.length} line items for same product! Prices: ${matching.map(m => m.price + ' x' + m.quantity).join(', ')}`);
      }

      for (const item of matching) {
        totalUnits += item.quantity;
        totalGross += parseFloat(item.price) * item.quantity;
        const allocDiscount = (item.discount_allocations || []).reduce((s, d) => s + parseFloat(d.amount || '0'), 0);
        totalDiscount += allocDiscount;
      }
    }

    const linkHeader = res.headers.get('Link');
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const links = linkHeader.split(',');
      const nextLink = links.find(l => l.includes('rel="next"'));
      if (nextLink) {
        const match = nextLink.match(/page_info=([^>&]*)/);
        pageInfo = match ? match[1] : null;
      } else hasNext = false;
    } else hasNext = false;

    if (pages % 100 === 0) console.log(`Scanned ${pages} pages...`);
  }

  console.log(`\n=== Results for Product ${TARGET_PRODUCT_ID} ===`);
  console.log(`Pages scanned: ${pages}`);
  console.log(`Total Units: ${totalUnits}`);
  console.log(`Total Gross: RM ${totalGross.toFixed(2)}`);
  console.log(`Total Discount (allocated only): RM ${totalDiscount.toFixed(2)}`);
  console.log(`Net (gross - discount): RM ${(totalGross - totalDiscount).toFixed(2)}`);
  console.log(`Orders with duplicate line items for same product: ${duplicateLineItems}`);
}

investigate();
