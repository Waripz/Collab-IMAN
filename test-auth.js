const fs = require('fs');

async function test() {
  const env = fs.readFileSync('.env.local', 'utf-8');
  let id = '', secret = '', shop = '';
  for (let line of env.split('\n')) {
    if (line.startsWith('SHOPIFY_CLIENT_ID=')) id = line.split('=')[1].trim();
    if (line.startsWith('SHOPIFY_CLIENT_SECRET=')) secret = line.split('=')[1].trim();
    if (line.startsWith('SHOPIFY_SHOP=')) shop = line.split('=')[1].trim();
  }

  const authResp = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  const token = (await authResp.json()).access_token;

  // Fetch ALL line item fields for one order to see what's available
  const resp = await fetch(`https://${shop}.myshopify.com/admin/api/2024-01/orders.json?status=any&limit=3&fields=name,total_discounts,discount_codes,discount_applications,line_items`, {
    headers: { "X-Shopify-Access-Token": token },
  });
  const data = await resp.json();

  for (const o of data.orders || []) {
    console.log(`\n=== Order ${o.name} ===`);
    console.log(`Order total_discounts: ${o.total_discounts}`);
    console.log(`discount_codes:`, JSON.stringify(o.discount_codes));
    console.log(`discount_applications:`, JSON.stringify(o.discount_applications));
    
    let allocatedSum = 0;
    let orderGross = 0;
    
    for (const li of o.line_items || []) {
      const liGross = parseFloat(li.price) * li.quantity;
      orderGross += liGross;
      
      const liAllocated = (li.discount_allocations || []).reduce(
        (sum, da) => sum + parseFloat(da.amount || "0"), 0
      );
      allocatedSum += liAllocated;
      
      console.log(`  Line: "${li.title.substring(0, 60)}" qty=${li.quantity} price=${li.price} gross=${liGross}`);
      console.log(`    total_discount=${li.total_discount} allocated=${liAllocated}`);
      console.log(`    discount_allocations:`, JSON.stringify(li.discount_allocations));
    }
    
    const unallocated = parseFloat(o.total_discounts) - allocatedSum;
    console.log(`  TOTAL: orderGross=${orderGross} allocated=${allocatedSum} unallocated=${unallocated}`);
  }
}

test().catch(console.error);
