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

async function testGraphQL() {
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', CLIENT_ID);
  params.append('client_secret', CLIENT_SECRET);
  const authRes = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const token = (await authRes.json()).access_token;

  const query = `
    {
      orders(first: 10, query: "line_item_title:'Suri Hati Nabi: Riwayat Hidup Para Wanita di Sekeliling Rasulullah SAW'") {
        edges {
          node {
            name
            createdAt
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
                }
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(`https://${SHOP}.myshopify.com/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query })
  });

  const data = await res.json();
  console.dir(data, { depth: null });
}

testGraphQL();
