import { fetchAllOrders } from "./lib/shopify";

async function run() {
  try {
    const orders = await fetchAllOrders("2020-01-01T00:00:00Z");
    console.log(`Total orders fetched: ${orders.length}`);
    if (orders.length > 0) {
      // Find oldest order
      const oldest = orders.reduce((min, o) => new Date(o.created_at) < new Date(min.created_at) ? o : min, orders[0]);
      console.log(`Oldest order date: ${oldest.created_at}`);
    }
  } catch (err) {
    console.error("Error:", err);
  }
}
run();
