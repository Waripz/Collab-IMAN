import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const API_VERSION = '2024-01';
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const stores = [
  { shop: env['SHOPIFY_SHOP'], clientId: env['SHOPIFY_CLIENT_ID'], clientSecret: env['SHOPIFY_CLIENT_SECRET'] },
  { shop: env['SHOPIFY_SHOP_2'], clientId: env['SHOPIFY_CLIENT_ID_2'], clientSecret: env['SHOPIFY_CLIENT_SECRET_2'] },
  { shop: env['SHOPIFY_SHOP_3'], clientId: env['SHOPIFY_CLIENT_ID_3'], clientSecret: env['SHOPIFY_CLIENT_SECRET_3'] },
].filter(s => s.shop).map(s => ({
  ...s,
  shop: s.shop.replace('.myshopify.com', '').trim(),
  clientId: s.clientId.trim(),
  clientSecret: s.clientSecret.trim(),
}));

const FROM_DATE = '2024-01-01T00:00:00+08:00';

async function getToken(store) {
  const res = await fetch(`https://${store.shop}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: store.clientId, client_secret: store.clientSecret }),
  });
  return (await res.json()).access_token;
}

async function run() {
  console.log('=== LOCAL FULL SYNC ===\n');

  const PAGE_SIZE = 1000;
  let allPerms = [];
  let start = 0;
  let more = true;
  while (more) {
    const { data } = await supabase.from('publisher_products').select('shopify_product_id').range(start, start + PAGE_SIZE - 1);
    if (!data || data.length === 0) more = false;
    else {
      allPerms = allPerms.concat(data);
      start += PAGE_SIZE;
    }
  }
  const allowedSet = new Set(allPerms.map(p => p.shopify_product_id));
  console.log(`Tracking ${allowedSet.size} product IDs across all publishers.`);

  if (allowedSet.size === 0) { console.log('No tracked products!'); return; }

  const allMatchedOrders = [];

  for (let i = 0; i < stores.length; i++) {
    const store = stores[i];
    console.log(`--- Store ${i + 1}: ${store.shop} ---`);
    const token = await getToken(store);

    let pageInfo = null, hasNext = true, pageCount = 0, storeOrders = 0;

    while (hasNext) {
      pageCount++;
      let url = `https://${store.shop}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
      if (pageInfo) {
        url += `limit=250&page_info=${pageInfo}`;
      } else {
        url += `status=any&limit=250&created_at_min=${FROM_DATE}`;
      }

      const response = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });

      if (!response.ok) {
        if (response.status === 429) {
          console.log('  Rate limited, waiting 2s...');
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        console.error(`  API error: ${response.status}`);
        break;
      }

      const data = await response.json();
      const orders = data.orders || [];

      if (orders.length === 0) { hasNext = false; break; }

      for (const order of orders) {
        if (order.cancelled_at || order.financial_status === 'refunded') continue;
        for (const item of order.line_items || []) {
          if (allowedSet.has(item.product_id)) {
            const discount = (item.discount_allocations || []).reduce((s, da) => s + parseFloat(da.amount || '0'), 0);
            allMatchedOrders.push({
              order_date: order.created_at,
              order_number: order.name,
              product_name: item.title,
              product_id: item.product_id,
              quantity: item.quantity,
              price: parseFloat(item.price),
              discount,
              channel: order.source_name === 'pos' ? 'POS' : 'Online',
              synced_at: new Date().toISOString(),
            });
            storeOrders++;
          }
        }
      }

      if (pageCount % 10 === 0) console.log(`  Page ${pageCount}... (${storeOrders} matched items so far)`);

      // Parse next page
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nl = linkHeader.split(',').find(l => l.includes('rel="next"'));
        const m = nl?.match(/page_info=([^>&]*)/);
        pageInfo = m ? m[1] : null; hasNext = !!pageInfo;
      } else hasNext = false;
    }

    console.log(`  Done! ${pageCount} pages, ${storeOrders} matched items.\n`);
  }

  console.log(`Total matched order items across all stores: ${allMatchedOrders.length}`);

  // Upsert to Supabase
  console.log('\nUpserting to Supabase...');
  let upserted = 0;
  for (let i = 0; i < allMatchedOrders.length; i += 200) {
    const chunk = allMatchedOrders.slice(i, i + 200);
    const { error } = await supabase.from('orders_cache').upsert(chunk, { onConflict: 'order_number,product_id' });
    if (error) console.error('Upsert error:', error.message);
    else upserted += chunk.length;
  }

  // Save sync log
  await supabase.from('sync_logs').insert({
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    from_date: '2024-01-01',
    run_by: 'Local Script',
    items_found: upserted,
    status: 'success',
  });

  console.log(`\n✅ Sync complete! ${upserted} order items upserted to database.`);
}

run();
