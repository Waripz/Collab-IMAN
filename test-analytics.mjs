import fs from 'fs';
import path from 'path';

// Manual env parsing
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
  const data = await res.json();
  if(!data.access_token) {
      console.log("Auth error:", data);
      process.exit(1);
  }
  return data.access_token;
}

async function test() {
  const token = await getAdminToken();
  const res = await fetch(`https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?status=any&limit=250&created_at_min=2020-01-01T00:00:00Z`, {
    headers: { 'X-Shopify-Access-Token': token }
  });
  
  const data = await res.json();
  const orders = data.orders || [];
  
  // Filter for our 2 products
  const allowed = new Set([8546817638553, 8608119390361]);
  
  let validOrders = [];
  let totalGross = 0;
  let totalDiscount = 0;
  let totalNet = 0;

  for (const o of orders) {
    if (o.cancelled_at || o.financial_status === "refunded") continue;
    
    // Check if order has our products
    const matchingItems = o.line_items.filter(li => allowed.has(li.product_id));
    if (matchingItems.length === 0) continue;

    // Duplicating the route logic
    const orderTotalDiscount = parseFloat(o.total_discounts || "0");
    let totalAllocated = 0;
    let orderGross = 0;
    for (const li of o.line_items || []) {
      orderGross += parseFloat(li.price) * li.quantity;
      totalAllocated += (li.discount_allocations || []).reduce(
        (sum, da) => sum + parseFloat(da.amount || "0"), 0
      );
    }
    let shippingDiscount = 0;
    for (const app of o.discount_applications || []) {
      if (app.target_type === "shipping_line") {
        shippingDiscount += parseFloat(app.value || "0");
      }
    }
    const unallocatedLineDiscount = Math.max(0, orderTotalDiscount - totalAllocated - shippingDiscount);

    for(const item of matchingItems) {
      const allocatedDiscount = (item.discount_allocations || []).reduce(
        (sum, da) => sum + parseFloat(da.amount || "0"), 0
      );
      const itemGross = parseFloat(item.price) * item.quantity;
      const proportionalShare = orderGross > 0
        ? (itemGross / orderGross) * unallocatedLineDiscount
        : 0;

      const totalD = allocatedDiscount + proportionalShare;
      
      validOrders.push({
        date: o.created_at,
        orderNumber: o.name,
        productName: item.title,
        price: parseFloat(item.price),
        quantity: item.quantity,
        discount: totalD
      });
      
      totalGross += parseFloat(item.price) * item.quantity;
      totalDiscount += totalD;
      totalNet += (parseFloat(item.price) * item.quantity) - totalD;
    }
  }

  console.log(`Matched Items: ${validOrders.length}`);
  console.log(`Gross: ${totalGross.toFixed(2)}`);
  console.log(`Discount: ${totalDiscount.toFixed(2)}`);
  console.log(`Net: ${totalNet.toFixed(2)}`);
  
  // Group by product
  let grouped = {};
  for(const vo of validOrders) {
      if(!grouped[vo.productName]) grouped[vo.productName] = { units: 0, gross: 0, net: 0, orders: new Set() };
      grouped[vo.productName].units += vo.quantity;
      grouped[vo.productName].gross += vo.price * vo.quantity;
      grouped[vo.productName].net += (vo.price * vo.quantity) - vo.discount;
      grouped[vo.productName].orders.add(vo.orderNumber);
  }
  
  for(const [name, stats] of Object.entries(grouped)) {
      console.log(`${name}: ${stats.orders.size} orders, ${stats.units} units, Net: ${stats.net.toFixed(2)}`);
      // list the orders for this product
      const productOrders = validOrders.filter(v => v.productName === name).map(v => `${v.orderNumber} (${v.date.split("T")[0]}) - Net: ${(v.price*v.quantity - v.discount).toFixed(2)}`);
      console.log(productOrders);
  }
}

test();
