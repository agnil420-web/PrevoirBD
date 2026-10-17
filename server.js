/**
 * PrevoirBD — Official E-Commerce Backend Server (Node.js + Express)
 * ------------------------------------------------------------------
 * Handles Products, Campaigns, Customer Orders (Privacy-Protected),
 * Customer Q&A Queries, and Password-Protected Admin CMS APIs.
 *
 * How to run locally:
 *   1. Place server.js, package.json, and index.html (renamed from novamart_ecommerce.html) in one folder
 *   2. Run: npm install
 *   3. Run: npm start
 *   4. Open: http://localhost:4000
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DB_FILE = path.join(__dirname, 'prevoirbd_db.json');

app.use(cors());
app.use(express.json({ limit: '15mb' })); // Supports base64 product image uploads
app.use(express.static(__dirname));

// --- Initial Default Database Seed ---
const DEFAULT_DB = {
  campaign: {
    badge: 'PREVOIR EXCLUSIVE',
    code: 'PREVOIR20',
    discountPercent: 20,
    heroTitle: 'Future-Ready Gear, Designed to Stand Out.',
    heroSub: 'Experience Bangladesh’s most refined destination for flagship audio, custom mechanical keyboards, smart wearables, and minimalist lifestyle gear.',
    timerHours: 5
  },
  products: [
    {
      id: 'p1',
      name: 'AeroPulse ANC Studio Pro',
      category: 'Electronics',
      priceBDT: 4850,
      oldPriceBDT: 6400,
      rating: 4.9,
      reviews: 214,
      onSale: true,
      badge: 'Flagship Drop',
      desc: 'Active Noise Cancelling wireless headphones with 45-hour battery life, spatial audio mode, and plush memory foam earcups.',
      specs: ['45h Battery', 'Hybrid ANC', 'Bluetooth 5.3', 'USB-C Fast Charge'],
      image: ''
    },
    {
      id: 'p2',
      name: 'Chronos Titanium Watch Ultra',
      category: 'Electronics',
      priceBDT: 3290,
      oldPriceBDT: 4200,
      rating: 4.8,
      reviews: 162,
      onSale: true,
      badge: '-22% OFF',
      desc: '1.96" Ultra-bright AMOLED display smartwatch with Bluetooth calling, SpO2 & heart rate tracking, and IP68 water resistance.',
      specs: ['AMOLED 60Hz', 'BT Calling', 'IP68 Waterproof', '7-Day Battery'],
      image: ''
    }
  ],
  orders: [
    {
      id: '#PV-78412',
      date: '16 Oct 2026',
      name: 'Tanvir Hasan',
      phone: '01711000000',
      address: 'Road 11, Banani, Dhaka',
      payment: 'bKash',
      itemsSummary: 'AeroPulse ANC Studio Pro (×1)',
      totalBDT: 4910,
      status: 'Packed at PrevoirBD Dhaka Hub'
    }
  ],
  queries: [
    {
      id: 'q1',
      name: 'Mahmudul Karim',
      phone: '01819-XXXXXX',
      topic: 'KeyCraft K75 Custom Mechanical',
      message: 'Does this keyboard come with extra Mac keycaps and a keycap puller in the box?',
      reply: 'Yes! Every KeyCraft K75 box includes Windows/Mac modifier keycaps, a 2-in-1 switch & keycap puller, and a braided Type-C cable.',
      date: 'Today, 2:15 PM'
    }
  ]
};

// --- Load or Initialize Database ---
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(DEFAULT_DB));
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (err) {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// --- Admin Authentication Middleware ---
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-password'] || req.body.adminPassword;
  if (key !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Admin Password' });
  }
  next();
}

// ==========================================
// 1. PUBLIC STOREFRONT ENDPOINTS (Customers)
// ==========================================

// Get storefront products, active campaign & public customer Q&A (NO customer orders exposed!)
app.get('/api/store', (req, res) => {
  const db = readDB();
  res.json({
    campaign: db.campaign,
    products: db.products,
    queries: db.queries.map(q => ({
      id: q.id,
      name: q.name,
      topic: q.topic,
      message: q.message,
      reply: q.reply,
      date: q.date
    }))
  });
});

// Place a new Customer Order
app.post('/api/orders', (req, res) => {
  const db = readDB();
  const { name, phone, address, payment, itemsSummary, totalBDT } = req.body;
  if (!name || !phone || !address || !itemsSummary) {
    return res.status(400).json({ error: 'Missing required order fields' });
  }
  const newOrder = {
    id: '#PV-' + Math.floor(10000 + Math.random() * 90000),
    date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    name: String(name).trim(),
    phone: String(phone).trim(),
    address: String(address).trim(),
    payment: payment || 'COD',
    itemsSummary,
    totalBDT: Number(totalBDT) || 0,
    status: 'Confirmed — Processing at Dhaka Hub'
  };
  db.orders.unshift(newOrder);
  writeDB(db);
  res.status(201).json({ status: 'ok', order: newOrder });
});

// Private Customer Order Lookup (Only returns matching Order ID or Phone Number)
app.get('/api/orders/track', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (!q || q.length < 4) {
    return res.status(400).json({ error: 'Enter your Order ID (#PV-...) or Phone Number' });
  }
  const db = readDB();
  const matched = db.orders.filter(
    o => o.id.toLowerCase() === q || o.phone.toLowerCase().includes(q)
  );
  res.json({ orders: matched });
});

// Submit a Customer Question / Support Query
app.post('/api/queries', (req, res) => {
  const db = readDB();
  const { name, phone, topic, message } = req.body;
  if (!name || !phone || !message) {
    return res.status(400).json({ error: 'Name, phone, and message are required' });
  }
  const newQuery = {
    id: 'q' + Date.now(),
    name: String(name).trim(),
    phone: String(phone).trim(),
    topic: String(topic || 'General Query').trim(),
    message: String(message).trim(),
    reply: '',
    date: new Date().toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
  };
  db.queries.unshift(newQuery);
  writeDB(db);
  res.status(201).json({ status: 'ok', query: newQuery });
});

// ==========================================
// 2. PROTECTED ADMIN ENDPOINTS (Store Owner)
// ==========================================

// Verify Admin Login Password
app.post('/api/admin/login', requireAdmin, (req, res) => {
  res.json({ status: 'ok', message: 'Admin authenticated' });
});

// Get ALL Customer Orders & Full Queries (Admin Only)
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const db = readDB();
  res.json(db);
});

// Upload / Add a New Product (Admin Only)
app.post('/api/admin/products', requireAdmin, (req, res) => {
  const db = readDB();
  const prod = req.body;
  const newProduct = {
    id: 'p' + Date.now(),
    name: prod.name,
    category: prod.category || 'Electronics',
    priceBDT: Number(prod.priceBDT) || 1000,
    oldPriceBDT: Number(prod.oldPriceBDT) || Number(prod.priceBDT) || 1000,
    rating: 5.0,
    reviews: 1,
    onSale: Number(prod.oldPriceBDT) > Number(prod.priceBDT),
    badge: prod.badge || 'New Arrival',
    desc: prod.desc || '',
    specs: Array.isArray(prod.specs) ? prod.specs : ['Official Warranty'],
    image: prod.image || ''
  };
  db.products.unshift(newProduct);
  writeDB(db);
  res.status(201).json({ status: 'ok', product: newProduct });
});

// Delete a Product (Admin Only)
app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const db = readDB();
  db.products = db.products.filter(p => p.id !== req.params.id);
  writeDB(db);
  res.json({ status: 'ok' });
});

// Update Campaign & Promo Code (Admin Only)
app.put('/api/admin/campaigns', requireAdmin, (req, res) => {
  const db = readDB();
  db.campaign = { ...db.campaign, ...req.body };
  writeDB(db);
  res.json({ status: 'ok', campaign: db.campaign });
});

// Update Customer Order Delivery Status (Admin Only)
app.put('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.status = req.body.status || order.status;
  writeDB(db);
  res.json({ status: 'ok', order });
});

// Reply to Customer Query (Admin Only)
app.put('/api/admin/queries/:id', requireAdmin, (req, res) => {
  const db = readDB();
  const q = db.queries.find(item => item.id === req.params.id);
  if (!q) return res.status(404).json({ error: 'Query not found' });
  q.reply = req.body.reply || '';
  writeDB(db);
  res.json({ status: 'ok', query: q });
});

// Universal Webhook Receiver (Compatible with Frontend Cloud Sync)
app.post('/api/webhook', (req, res) => {
  const db = readDB();
  const payload = req.body || {};
  if (payload.type === 'NEW_ORDER' && payload.id) {
    db.orders.unshift({
      id: payload.id,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      name: payload.name || 'Customer',
      phone: payload.phone || '',
      address: payload.address || 'Dhaka',
      payment: payload.payment || 'bKash',
      itemsSummary: payload.summary || '',
      totalBDT: Number(payload.totalBDT) || 0,
      status: 'Confirmed via Cloud Sync'
    });
    writeDB(db);
  }
  res.json({ status: 'ok', received: payload.type || 'PING' });
});

// Serve Frontend if index.html or novamart_ecommerce.html exists
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  const altPath = path.join(__dirname, 'novamart_ecommerce.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  if (fs.existsSync(altPath)) return res.sendFile(altPath);
  res.json({ message: 'PrevoirBD Backend API Server is running!' });
});

app.listen(PORT, () => {
  console.log(`🚀 PrevoirBD Backend Server running at http://localhost:${PORT}`);
});
