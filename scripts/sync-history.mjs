import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const envContent = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const SHOP = env['SHOPIFY_SHOP'];
const CLIENT_ID = env['SHOPIFY_CLIENT_ID'];
const CLIENT_SECRET = env['SHOPIFY_CLIENT_SECRET'];
const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SUPABASE_KEY = env['SUPABASE_SERVICE_ROLE_KEY']; // Use service role for bulk inserts
const API_VERSION = "2024-01";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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

async function syncAllOrders() {
  console.log("Starting full historical sync...");
  console.log("1. Fetching all tracked products from Supabase...");
  
  const { data: allPerms } = await supabase.from("publisher_products").select("shopify_product_id");
  const trackedIds = new Set((allPerms || []).map((p) => p.shopify_product_id));
  
  if (trackedIds.size === 0) {
    console.log("No tracked products found! Aborting sync.");
    return;
  }
  
  console.log(`Found ${trackedIds.size} tracked products.`);
  console.log("2. Fetching orders from Shopify and uploading...");

  const token = await getAdminToken();
  let pageInfo = null;
  let hasNext = true;
  let pages = 0;
  let totalSaved = 0;

  const baseParams = "status=any&limit=250&created_at_min=2020-01-01T00:00:00Z";

  try {
    while (hasNext) {
      pages++;
      let url = `https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/orders.json?`;
      if (pageInfo) {
        url += `limit=250&page_info=${pageInfo}`;
      } else {
        url += baseParams;
      }

      console.log(`\nFetching Page ${pages}...`);
      let res;
      let retries = 5;
      while (retries > 0) {
        try {
          res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
          if (res.ok) break;
          // Handle rate limits (429) or other errors by retrying
          if (res.status === 429) {
            console.log(`Rate limited! Waiting 3 seconds...`);
            await new Promise(r => setTimeout(r, 3000));
          } else {
            console.log(`Shopify API error ${res.status}. Retrying...`);
            await new Promise(r => setTimeout(r, 2000));
          }
        } catch (e) {
          console.log(`Network error: ${e.message}. Retrying...`);
          await new Promise(r => setTimeout(r, 4000)); // Wait before retry on socket drop
        }
        retries--;
      }

      if (!res || !res.ok) {
        console.error(`Failed to fetch page ${pages} after 5 retries. Aborting...`);
        break;
      }

      const data = await res.json();
      const shopifyOrders = data.orders || [];

      if (shopifyOrders.length === 0) {
        hasNext = false;
        break;
      }

      let validOrders = [];

      for (const o of shopifyOrders) {
        if (o.cancelled_at || o.financial_status === "refunded") continue;
        
        const matchingItems = (o.line_items || []).filter(li => trackedIds.has(li.product_id));
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

        for (const item of matchingItems) {
          const allocatedDiscount = (item.discount_allocations || []).reduce((sum, da) => sum + parseFloat(da.amount || "0"), 0);
          const itemGross = parseFloat(item.price) * item.quantity;
          const proportionalShare = orderGross > 0 ? (itemGross / orderGross) * unallocatedLineDiscount : 0;
          const finalDiscount = allocatedDiscount + proportionalShare;
          
          validOrders.push({
            order_date: o.created_at,
            order_number: o.name,
            product_name: item.title,
            product_id: item.product_id,
            quantity: item.quantity,
            price: parseFloat(item.price),
            discount: finalDiscount,
            channel: o.source_name === "pos" ? "POS" : "Online",
            synced_at: new Date().toISOString()
          });
        }
      }

      if (validOrders.length > 0) {
        // Upload chunk to Supabase!
        const { error } = await supabase.from('orders_cache').upsert(validOrders, { onConflict: "order_number,product_id" });
        if (error) {
           console.error("Error inserting to Supabase:", error);
        } else {
           totalSaved += validOrders.length;
           console.log(`-> Found and synced ${validOrders.length} line items across tracked products (Total so far: ${totalSaved}).`);
        }
      } else {
        console.log(`-> Page ${pages} had 0 matched products. Safe to skip.`);
      }

      const linkHeader = res.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const links = linkHeader.split(",");
        const nextLink = links.find(l => l.includes('rel="next"'));
        if (nextLink) {
          const match = nextLink.match(/page_info=([^>&]*)/);
          pageInfo = match ? match[1] : null;
        } else {
          hasNext = false;
        }
      } else {
        hasNext = false;
      }
    }
    
    console.log(`\n\n✅ SYNC COMPLETE! Uploaded ${totalSaved} total line items to orders_cache!`);
  } catch (err) {
    console.error("Crash during sync:", err);
  }
}

syncAllOrders();
