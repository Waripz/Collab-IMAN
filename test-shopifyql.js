const fs = require('fs');

async function run() {
  const env = fs.readFileSync('.env.local', 'utf-8');
  let t = '';
  let s = '';
  for(let line of env.split('\n')){
    if(line.startsWith('SHOPIFY_ACCESS_TOKEN=')) t = line.split('=')[1].trim();
    if(line.startsWith('SHOPIFY_SHOP=')) s = line.split('=')[1].trim();
  }
  const query = `
    mutation {
      shopifyqlQuery(query: "FROM sales SHOW net_sales, gross_sales, discounts BY product_title SINCE -30d") {
        table {
          schema { name type }
          rows
        }
        parseErrors { message }
      }
    }
  `;
  const url = 'https://' + s + '.myshopify.com/admin/api/2024-01/graphql.json';
  const resp = await fetch(url, { 
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
