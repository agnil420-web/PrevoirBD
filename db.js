'use strict';
// SQLite database: schema and first-run seed data.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Databases from earlier versions (previorbd.db, haat.db) are reused so no data is lost.
const dataDir = path.join(__dirname, 'data');
const current = path.join(dataDir, 'prevoir.db');
const older = ['previorbd.db', 'haat.db'].map((n) => path.join(dataDir, n)).find((f) => fs.existsSync(f));
const DB_PATH = process.env.DB_PATH || (!fs.existsSync(current) && older ? older : current);
if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  voucher TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  icon TEXT NOT NULL,
  tile TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  old_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  sold INTEGER NOT NULL,
  rating REAL NOT NULL,
  review_count INTEGER NOT NULL,
  free_ship INTEGER NOT NULL,
  is_new INTEGER NOT NULL,
  flash_order INTEGER,
  flash_limit INTEGER,
  flash_claimed INTEGER NOT NULL DEFAULT 0,
  seller TEXT NOT NULL,
  description TEXT NOT NULL,
  highlights TEXT NOT NULL,
  colors TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE TABLE IF NOT EXISTS cart_items (
  owner TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  PRIMARY KEY (owner, product_id)
);
CREATE TABLE IF NOT EXISTS wishlist (
  owner TEXT NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (owner, product_id)
);
CREATE TABLE IF NOT EXISTS vouchers (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  value INTEGER NOT NULL,
  min_cents INTEGER NOT NULL DEFAULT 0,
  category TEXT,
  first_order_only INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postcode TEXT NOT NULL,
  payment TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  voucher TEXT,
  status TEXT NOT NULL DEFAULT 'placed',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(email);
CREATE TABLE IF NOT EXISTS order_items (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  user_id INTEGER REFERENCES users(id),
  author TEXT NOT NULL,
  rating INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (product_id, user_id)
);
CREATE TABLE IF NOT EXISTS sellers (
  id INTEGER PRIMARY KEY,
  shop_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  category TEXT,
  about TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  topic TEXT NOT NULL,
  order_number TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_waitlist (
  id INTEGER PRIMARY KEY,
  contact TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

// ---------- small migrations for databases created by earlier versions ----------
for (const [col, ddl] of [['paid_at', 'TEXT'], ['gateway_ref', 'TEXT']]) {
  if (!db.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${ddl}`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_orders_gateway ON orders(gateway_ref)');

// ---------- seed (runs once, when the catalogue is empty) ----------
const HL = {
  Audio: ['Active noise cancelling', 'Up to 40 hours of playback', 'Bluetooth 5.3 with multipoint'],
  Watches: ['5 ATM water resistant', 'Scratch-resistant glass', 'Fits wrists 14 to 22 cm'],
  Bags: ['Fits a 13-inch laptop', 'Water-resistant lining', 'Reinforced stitching'],
  Shoes: ['Breathable upper', 'Cushioned, non-slip sole', 'Free size exchange'],
  Kitchen: ['Dishwasher and oven safe', 'Food-grade materials', 'Gift-ready box'],
  Home: ['Set up in ten minutes', 'Energy-saving design', '1-year seller warranty'],
  Phones: ['Fits most phone models', 'Light, durable build', 'Ships within 24 hours'],
  Fashion: ['Pre-washed 100% cotton', 'Unisex relaxed fit', 'Machine washable'],
  Garden: ['Beginner friendly', 'Weather-tolerant materials', 'Includes a care guide'],
  Cameras: ['Quick-release fit', 'Works with most mounts', 'Padded for protection'],
  Gaming: ['Low-latency wireless', 'Rechargeable battery', 'Works with PC and mobile'],
  Books: ['Premium 100gsm paper', 'Lay-flat binding', 'Pack of three'],
  Sports: ['Non-slip and durable', 'Easy to carry', 'Made for daily use'],
  Gifts: ['Ready to wrap', 'Suitable for ages 8+', 'Includes a card'],
  Beauty: ['Dermatologist tested', 'Long-wear formula', 'Cruelty-free'],
  Tools: ['32 interchangeable bits', 'Built-in LED light', 'USB-C rechargeable'],
  Projector: ['1080p support', 'Built-in speaker', 'HDMI and USB inputs']
};
const DESC = {
  Audio: 'Clear sound and a comfortable fit for commutes, work and travel. Pairs quickly with phones, tablets and laptops.',
  Watches: 'A clean everyday design that works with casual and formal outfits. Comes with a spare strap pin and a gift box.',
  Bags: 'Roomy, light and built to carry a full day of essentials. Finished with durable hardware and double stitching.',
  Shoes: 'Made for all-day wear with a soft footbed and a grippy outsole. Order your usual size; exchanges are free.',
  Kitchen: 'Made from food-safe materials that heat evenly and clean up easily. Packed in a sturdy box that is ready to gift.',
  Home: 'Adds warmth and function to any room without a complicated setup. Backed by a one-year seller warranty.',
  Gadgets: 'A practical everyday accessory that fits most devices and travels well. Ships from the seller within 24 hours.',
  Fashion: 'A relaxed everyday basic that holds its shape wash after wash. Available in several colours.',
  Garden: 'A simple way to grow fresh herbs and greenery at home, with clear instructions for beginners.',
  Cameras: 'A reliable accessory for creators who shoot on the move. Compact, padded and quick to attach.',
  Gaming: 'Responsive controls and a battery that lasts through long sessions. Connects to PC, phone and tablet.',
  Books: 'Smooth, thick paper that handles pens, markers and highlighters without bleed-through.',
  Sports: 'Built for regular use at home, the gym or outdoors. Easy to clean and easy to carry.',
  Gifts: 'A thoughtful gift that arrives ready to wrap, with a message card included.',
  Beauty: 'A comfortable, buildable formula that lasts through the day. Tested on skin and made without animal testing.',
  Tools: 'A compact set for repairs, DIY and electronics. Everything stores neatly in one case.'
};
const SELLERS = ['Northwind Goods', 'Kasa & Co', 'UrbanLeaf', 'Bright Mart', 'Tiger Lane', 'Lotus Supply'];
const SWATCH = ['#1f2937', '#f3c24f', '#e4572e', '#3fbf8f', '#6b7bd6', '#e9d8c4', '#d96a8a', '#94a3b8'];

// id, name, category, icon, tile, price, old price, sold, rating, reviews, free shipping, new, highlights key
// Seed prices were written in dollars. They are converted once, at first run, to taka rounded to the nearest ৳10.
const taka = (usd) => Math.round((usd * 120) / 10) * 10;
const PRODUCTS = [
  [1, 'Wireless over-ear headphones, 40h battery, active noise cancelling', 'Audio', 'audio', 'c', 39.9, 89, 2840, 4.7, 1260, 1, 0, 'Audio'],
  [2, 'Minimalist quartz watch, stainless mesh strap, 5 ATM water resistant', 'Watches', 'watch', 'f', 24.5, 59, 1930, 4.6, 884, 1, 0, 'Watches'],
  [3, 'Canvas tote bag with zip pocket, heavy cotton, everyday carry', 'Bags', 'bag', 'd', 12.9, 28, 5210, 4.8, 2310, 0, 0, 'Bags'],
  [4, 'Lightweight running sneakers, breathable knit, cushioned sole', 'Shoes', 'shoe', 'e', 34.0, 72, 3120, 4.5, 1470, 1, 0, 'Shoes'],
  [5, 'Ceramic mug set of 4, matte glaze, dishwasher safe', 'Kitchen', 'mug', 'a', 18.5, 36, 2260, 4.7, 903, 0, 0, 'Kitchen'],
  [6, 'Dimmable desk lamp with USB-C port and three colour modes', 'Home', 'lamp', 'b', 21.0, 45, 1740, 4.6, 612, 1, 1, 'Home'],
  [7, 'Smartphone tripod with Bluetooth remote, 1.6m extendable', 'Gadgets', 'phone', 'a', 9.9, 24, 6480, 4.4, 3120, 0, 0, 'Phones'],
  [8, 'Oversized cotton tee, pre-washed, unisex fit, six colours', 'Fashion', 'shirt', 'b', 11.5, 22, 4410, 4.5, 1980, 0, 0, 'Fashion'],
  [9, 'Self-watering planter pots, set of 3, indoor herbs', 'Garden', 'plant', 'a', 15.9, 30, 1180, 4.8, 447, 0, 1, 'Garden'],
  [10, 'Compact mirrorless camera strap, quick release, leather', 'Cameras', 'camera', 'c', 16.5, 34, 760, 4.7, 198, 0, 0, 'Cameras'],
  [11, 'Wireless game controller with hall-effect sticks', 'Gaming', 'game', 'e', 27.9, 55, 2050, 4.6, 1020, 1, 0, 'Gaming'],
  [12, 'Pocket notebook trio, dotted pages, 100gsm paper', 'Books', 'book', 'f', 6.4, 13, 7340, 4.9, 3860, 0, 0, 'Books'],
  [13, 'Yoga mat, 6mm non-slip, carry strap included', 'Sports', 'ball', 'd', 19.9, 42, 2980, 4.6, 1150, 1, 0, 'Sports'],
  [14, 'Build-your-own wooden puzzle box, ages 8+', 'Gifts', 'gift', 'b', 14.2, 26, 860, 4.7, 320, 0, 1, 'Gifts'],
  [15, 'Hydrating lip tint trio with vitamin E, long wear', 'Beauty', 'beauty', 'd', 7.8, 16, 9120, 4.7, 5240, 0, 0, 'Beauty'],
  [16, 'Cordless precision screwdriver set, 32 bits, LED light', 'Tools', 'tools', 'c', 22.5, 49, 1420, 4.6, 540, 1, 0, 'Tools'],
  [17, 'True wireless earbuds, touch controls, charging case', 'Audio', 'audio', 'c', 17.9, 45, 8830, 4.4, 4410, 1, 0, 'Audio'],
  [18, 'Leather crossbody bag, adjustable strap, two compartments', 'Bags', 'bag', 'd', 31.0, 68, 1260, 4.7, 396, 1, 1, 'Bags'],
  [19, 'Slip-on leather loafers, memory foam insole', 'Shoes', 'shoe', 'e', 42.0, 85, 980, 4.5, 274, 1, 0, 'Shoes'],
  [20, 'Cast iron skillet 26cm, pre-seasoned, oven safe', 'Kitchen', 'mug', 'a', 26.9, 48, 1640, 4.8, 770, 1, 0, 'Kitchen'],
  [21, 'Linen throw blanket, stonewashed, 130 x 170 cm', 'Home', 'lamp', 'b', 29.5, 58, 830, 4.7, 215, 1, 1, 'Home'],
  [22, 'Phone case with card holder and wrist strap', 'Gadgets', 'phone', 'a', 5.9, 15, 12400, 4.3, 6020, 0, 0, 'Phones'],
  [23, 'Insulated sports bottle 750ml, keeps cold 24 hours', 'Sports', 'ball', 'd', 13.4, 25, 5560, 4.8, 2410, 0, 0, 'Sports'],
  [24, 'Mini projector, 1080p support, built-in speaker', 'Gadgets', 'camera', 'c', 64.0, 139, 610, 4.5, 188, 1, 1, 'Projector'],
  [25, 'Non-stick frying pan 20cm, induction ready, PFOA-free', 'Kitchen', 'mug', 'a', 12.9, 26, 3340, 4.6, 1280, 0, 0, 'Kitchen']
];
const FLASH_IDS = [17, 1, 7, 3, 15, 2, 23, 22, 12, 4];

const REVIEW_AUTHORS = ['Maya R.', 'Daniel K.', 'Priya S.', 'Tomas L.', 'Aisha N.', 'Chen W.', 'Lena B.', 'Omar H.'];
const REVIEW_BODIES = {
  5: ['Exactly as described and arrived earlier than expected. Very happy with it.', 'Great quality for the price. I already ordered a second one.'],
  4: ['Good value. Packaging could be better but the product itself is solid.', 'Does the job well. Small difference in colour from the photo, nothing serious.'],
  3: ['Decent for the price, though it feels a little lighter than I expected.']
};

function seed() {
  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n > 0) return;
  const ins = db.prepare(`INSERT INTO products
    (id,name,category,icon,tile,price_cents,old_cents,stock,sold,rating,review_count,free_ship,is_new,
     flash_order,flash_limit,flash_claimed,seller,description,highlights,colors)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insReview = db.prepare('INSERT INTO reviews (product_id,user_id,author,rating,body,created_at) VALUES (?,?,?,?,?,?)');
  const insVoucher = db.prepare('INSERT INTO vouchers (code,kind,value,min_cents,category,first_order_only,active,label) VALUES (?,?,?,?,?,?,1,?)');
  db.transaction(() => {
    for (const r of PRODUCTS) {
      const [id, name, cat, icon, tile, price, old, sold, rating, reviews, free, isNew, hl] = r;
      const fo = FLASH_IDS.indexOf(id);
      const colors = [0, 1, 2].map((k) => SWATCH[(id + k * 3) % SWATCH.length]);
      ins.run(id, name, cat, icon, tile, taka(price) * 100, taka(old) * 100,
        12 + ((id * 17) % 70), sold, rating, reviews, free, isNew,
        fo >= 0 ? fo + 1 : null, fo >= 0 ? 100 : null, fo >= 0 ? 35 + (sold % 60) : 0,
        SELLERS[id % SELLERS.length], DESC[cat] || DESC.Gadgets, JSON.stringify(HL[hl]), JSON.stringify(colors));
      for (let k = 0; k < 3; k++) {
        const stars = k === 2 ? 3 : k === 1 ? 4 : 5;
        const bodies = REVIEW_BODIES[stars];
        const day = 3 + ((id * 5 + k * 11) % 40);
        insReview.run(id, null, REVIEW_AUTHORS[(id + k) % REVIEW_AUTHORS.length], stars,
          bodies[(id + k) % bodies.length], new Date(Date.now() - day * 86400000).toISOString());
      }
    }
    insVoucher.run('WELCOME10', 'percent', 10, 200000, null, 1, '10% off your first order over ৳2,000');
    insVoucher.run('GLOW15', 'percent', 15, 0, 'Beauty', 0, '15% off Beauty items');
    insVoucher.run('FREESHIP', 'shipping', 0, 0, null, 0, 'Free shipping on this order');
  })();
}
seed();

// stale sessions are removed on startup
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

module.exports = { db };
