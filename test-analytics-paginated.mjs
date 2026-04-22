import fs from 'fs';
import path from 'path';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const SHOP = env['SHOPIFY_SHOP'];
const CLIENT_ID = env['SHOPIFY_CLIENT_ID'];
const CLIENT_SECRET = env['SHOPIFY_CLIENT_SECRET'];
const API_VERSION = "2024-01";

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

async function test() {
  const token = await getAdminToken();
  const allowed = new Set([8546817638553, 8608119390361]);
  let validOrders = [];
  
  let pageInfo = null;
  let hasNext = true;
  let pages = 0;

  let baseParams = "status=any&limit=250&created_at_min=2020-01-01T00:00:00Z";

  while (hasNext && pages < 100) {
    pages++;
    let url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
    if (pageInfo) {
      url += `limit=250&page_info=${pageInfo}`;
    } else {
      url += baseParams;
    }

    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    const data = await res.json();
    const shopifyOrders = data.orders || [];
    
    for (const o of shopifyOrders) {
      if (o.cancelled_at || o.financial_status === "refunded") continue;
      
      const matchingItems = (o.line_items || []).filter(li => allowed.has(li.product_id));
      if (matchingItems.length === 0) continue;

      const orderTotalDiscount = parseFloat(o.total_discounts || "0");
      let totalAllocated = 0;
      let orderGross = 0;
      for (const li of o.line_items || []) {
        orderGross += parseFloat(li.price) * li.quantity;
        totalAllocated += (li.discount_allocations || []).reduce((sum, da) => sum + parseFloat(da.amount || "0"), 0);
      }
      let shippingDiscount = 0;
      for (const app of o.discount_applications || []) {
        if (app.target_type === "shipping_line") shippingDiscount += parseFloat(app.value || "0");
      }
      const unallocatedLineDiscount = Math.max(0, orderTotalDiscount - totalAllocated - shippingDiscount);

      for(const item of matchingItems) {
        const allocatedDiscount = (item.discount_allocations || []).reduce((sum, da) => sum + parseFloat(da.amount || "0"), 0);
        const itemGross = parseFloat(item.price) * item.quantity;
        const proportionalShare = orderGross > 0 ? (itemGross / orderGross) * unallocatedLineDiscount : 0;
        
        validOrders.push({
          date: o.created_at,
          orderNumber: o.name,
          productName: item.title,
          price: parseFloat(item.price),
          quantity: item.quantity,
          discount: allocatedDiscount + proportionalShare
        });
      }
    }

    const linkHeader = res.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^>&]*)/);
      pageInfo = match ? match[1] : null;
    } else {
      hasNext = false;
    }
  }

  console.log(`Pages fetched: ${pages}`);
  let grouped = {};
  for(const vo of validOrders) {
      if(!grouped[vo.productName]) grouped[vo.productName] = { units: 0, orders: new Set() };
      grouped[vo.productName].units += vo.quantity;
      grouped[vo.productName].orders.add(vo.orderNumber);
  }
  
  console.log(`Total Found Orders: ${new Set(validOrders.map(v => v.orderNumber)).size}`);
  for(const [name, stats] of Object.entries(grouped)) {
      console.log(`${name.substring(0,25)}...: ${stats.orders.size} orders, ${stats.units} units`);
      const productOrders = validOrders.filter(v => v.productName === name).map(v => `${v.orderNumber} (${v.date.split("T")[0]})`);
      console.log(productOrders);
  }
}

test();
