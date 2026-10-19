# Putting Prevoir online

## 0. Check your hosting first (this decides everything)

Prevoir is a **Node.js server** with a database file. It is not a static site.

| Your hosting | Works? |
|---|---|
| **VPS / cloud server** (DigitalOcean, Hetzner, AWS Lightsail, a Bangladeshi VPS with root access) | Yes. Follow Part 2. Best choice. |
| **cPanel with "Setup Node.js App"** | Yes, with Node 22. Follow Part 3. |
| Plain shared hosting (PHP only, no Node option) | No. Ask the host to add Node 22, or move to a VPS. |
| GitHub Pages, Netlify static, Vercel static | No. They cannot run the backend. |

The domain is only a name. You point it at the server in Part 1.

## 1. GitHub

1. Create a **private** repository on github.com, for example `prevoir-shop`.
2. Unzip the project. In a terminal inside the folder:
   ```
   git init
   git add .
   git commit -m "Prevoir first version"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/prevoir-shop.git
   git push -u origin main
   ```
3. The `.gitignore` already keeps `node_modules`, `.env` and the database out of GitHub. **Never upload `.env`.** It holds your admin key.
4. Every push runs the tests automatically (`.github/workflows/ci.yml`). A green tick means the code is healthy.

## 2. VPS (Ubuntu 22.04 or 24.04)

### 2.1 Point the domain
In your domain's DNS panel add two **A records**, both to the server's IP address:

```
@     A   YOUR.SERVER.IP
www   A   YOUR.SERVER.IP
```
It can take from a few minutes to a few hours to spread.

### 2.2 Prepare the server
Log in with SSH (`ssh root@YOUR.SERVER.IP`), then:
```
apt update && apt install -y nginx git sqlite3 certbot python3-certbot-nginx build-essential
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pm2
```

### 2.3 Get the code and start it
```
mkdir -p /var/www && cd /var/www
git clone https://github.com/YOUR-NAME/prevoir-shop.git
cd prevoir-shop
npm install --omit=dev
cp .env.example .env
nano .env          # set ADMIN_KEY and BANK_DETAILS (see below), save with Ctrl+O, exit Ctrl+X
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # run the one command it prints, so the shop restarts after a reboot
```
Make a strong admin key:
```
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Check it: `curl http://127.0.0.1:3000/api/health` should print `{"ok":true}`.

For a private repository, `git clone` will ask for your GitHub username and a personal access token (GitHub → Settings → Developer settings → Tokens) instead of a password.

### 2.4 Put nginx and HTTPS in front
```
cp deploy/nginx.conf /etc/nginx/sites-available/prevoir
nano /etc/nginx/sites-available/prevoir     # replace yourdomain.com with your domain
ln -s /etc/nginx/sites-available/prevoir /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
Open `https://your-domain`. The shop should load with a padlock. HTTPS matters here because sign-in cookies are only marked `Secure` over HTTPS.

Open the firewall if you use one: `ufw allow 'Nginx Full' && ufw allow OpenSSH && ufw enable`.

### 2.5 Updating later
```
cd /var/www/prevoir-shop && git pull && npm install --omit=dev && pm2 restart prevoir
```

### 2.6 Backups (do this on day one)
Your orders live in `data/prevoir.db`. Set a nightly copy:
```
crontab -e
30 2 * * * /var/www/prevoir-shop/deploy/backup.sh
```
Also download a copy to your own computer now and then (`scp root@IP:/var/backups/prevoir/*.db .`).

## 3. cPanel with Node.js

1. cPanel → **Setup Node.js App** → Create Application. Node 22, mode Production, application root `prevoir-shop`, startup file `start.js`, and your domain as the URL.
2. Upload the project into that folder (cPanel **Git Version Control** can clone your GitHub repo, or use File Manager).
3. Add your settings, either way works: (a) on the app screen add the variables from `.env.example` (`ADMIN_KEY`, `BANK_DETAILS`, and the payment ones later), or (b) in File Manager copy `.env.example` to a new file named `.env` inside `prevoir-shop` and fill it in (`start.js` reads it; it is never uploaded to GitHub). Then click **Run NPM Install**, then **Restart**.
   - If the page shows an error after starting, open the app's log (cPanel shows `stderr.log` in the app folder). A common cause is the wrong Node version; choose 22.
   - Git users: in cPanel **Git Version Control** clone your GitHub repo into the home folder, then use **Deploy HEAD Commit**. After each update press Restart in Setup Node.js App (and Run NPM Install if `package.json` changed).
4. Turn on free SSL (AutoSSL / Let's Encrypt) for the domain and force HTTPS.
5. If the install fails on `better-sqlite3`, ask your host to enable build tools, or use a VPS.

## 4. Docker alternative

```
docker build -t prevoir .
docker run -d --name prevoir --restart unless-stopped -p 127.0.0.1:3000:3000 \
  -v prevoir-data:/data -e ADMIN_KEY=your-long-key -e BANK_DETAILS="..." prevoir
```
Then use the same nginx and certbot steps as 2.4. The `prevoir-data` volume keeps the database safe when you rebuild.

## 5. Turn on online payment (bKash, Nagad, Rocket, cards, net banking)

Prevoir uses **SSLCommerz**, a Bangladeshi payment gateway. One merchant account gives your customers bKash, Nagad, Rocket, Visa, Mastercard, Amex and net banking on one secure page. You never handle card numbers or wallet PINs.

### 5.1 Test first (free, fake money)
1. Register a sandbox account at https://developer.sslcommerz.com/registration/ . They email you a **Store ID** and **Store Password** for testing.
2. Add these to `.env` (VPS) or to the environment variables screen (cPanel Node.js App):
   ```
   SSLCOMMERZ_STORE_ID=your_test_store_id
   SSLCOMMERZ_STORE_PASSWORD=your_test_store_password
   SSLCOMMERZ_MODE=sandbox
   PUBLIC_URL=https://yourdomain.com
   ```
   `PUBLIC_URL` must be your real HTTPS address with no slash at the end. The gateway sends customers back to it.
3. Restart (`pm2 restart prevoir`, or Restart in cPanel). The start-up log says `Online payments: ON (sandbox)`.
4. Place an order, choose **Pay online**, and pay with the test cards and test wallet details shown in the SSLCommerz sandbox documentation. The order must flip from "Awaiting payment" to "Placed" with a "Paid online" tag.

### 5.2 Go live
1. Apply for a live merchant account with SSLCommerz (trade licence, bank account and website details are normally required). Approval is theirs, not ours, and takes days.
2. When approved they give you a live Store ID and Password. Put them in `.env`, set `SSLCOMMERZ_MODE=live`, restart.
3. In your SSLCommerz merchant panel, set the IPN (payment notification) address to `https://your-domain/pay/ipn` if it asks for one.
4. Make one small real purchase yourself, then refund it from the SSLCommerz panel.

### 5.3 How a payment flows
1. Customer picks **Pay online** and presses Place order. The server creates the order as **Awaiting payment**, holds the stock, and asks SSLCommerz for a payment page.
2. The customer pays on the SSLCommerz page (bKash and others open there).
3. SSLCommerz sends the customer back to `/pay/success`. The server does **not** trust that message. It asks SSLCommerz directly whether the payment is real and checks the amount and currency. Only then the order becomes **Placed** and is marked paid. A faked callback does nothing.
4. If the customer fails or cancels, the order stays open for 30 minutes and shows a **Pay now** button to try again. After 30 minutes an unpaid order is cancelled and its stock goes back on sale.
5. If a payment arrives after the 30 minutes, the order stays cancelled but is marked paid, and Admin shows **"Customer paid but the order expired. Refund them"**. Refund from the SSLCommerz panel.

### 5.4 Things to know
- **Currency:** the whole shop is in taka (৳), so the amount shown at checkout is exactly what SSLCommerz charges.
- The gateway is for **BDT 10 to 500,000** per payment.
- Cash on delivery and bank transfer keep working next to online payment. If you leave the SSLCommerz settings empty, the Pay online option simply stays hidden.
- On cPanel, make sure the domain has working HTTPS before testing. The gateway will not send customers to an insecure address on a live account.
- SSLCommerz takes a fee per payment. Check their current rates when you apply.

---

## How order tracking works

**Customer side**
1. The customer adds items to the cart and checks out (Cash on delivery, bank transfer or online payment; an online order waits as "Awaiting payment" until the money is confirmed). The server creates the order with a number like `PV-20261017-88370D` and the status **placed**. The number is shown on the confirmation screen.
2. The customer can follow it at any time with **Track an order** (in the footer under Customer care). They enter the order number and the email used at checkout. Signed-in customers can also see **My orders**.
3. The tracker shows the steps **Placed → Packed → Shipped → Delivered** with the items and the total.
4. While the order is still **Placed**, the customer can cancel it. Stock goes back automatically. After it is packed, cancelling is closed and they must use Returns.

**Your side (admin)**
1. Open `https://your-domain/admin.html` and enter your `ADMIN_KEY`. The page is hidden from search engines and every action needs the key.
2. **Orders** tab: each order shows customer name, phone, email, address, items, payment method and total. Press **Mark packed**, then **Mark shipped**, then **Mark delivered** as you work through it. The customer sees the new status the next time they track the order. **Cancel** returns stock.
3. **Sellers** tab: approve or reject seller applications. **Support** tab: read messages from the Help centre form.
4. Top boxes show orders, revenue, customers, pending sellers, tickets and waitlist.

Daily routine: open Admin, call or message new orders to confirm, pack, hand to the courier, mark Shipped, mark Delivered when it arrives. For bank transfer orders, check the money arrived before you pack.

## How the backend fits together

```
Customer browser ──HTTPS──► nginx ──► Node (start.js, run by PM2) ──► data/prevoir.db
   index.html, app.js                      /api/*  prices, stock, orders
   admin.html (you)                        static files from /public
```
- All money maths, stock checks, vouchers and order numbers are done on the server, so customers cannot change prices from the browser.
- One process, one SQLite file. That is fine for a young shop (thousands of orders). Do not run several copies.
- `ADMIN_KEY` is the only password for admin. Keep it private and change it if it leaks (edit `.env`, then `pm2 restart prevoir`).

## Launch checklist

- [ ] `.env` has your own `ADMIN_KEY` and real `BANK_DETAILS`
- [ ] Site opens on `https://` and `http://` redirects to it
- [ ] Place a test order, track it, mark it packed in Admin, cancel a second test order
- [ ] Nightly backup is running
- [ ] Replace sample products with yours (see below)
- [ ] Replace the Our story, Careers, Press, Privacy, Terms and Cookies text in `pages.js` and have the legal pages reviewed
- [ ] Online payment tested in sandbox, then switched to live (Part 5)
- [ ] Check the sample prices, the ৳80 delivery charge and the free-delivery limit (৳3,000) suit you; they are set in `server.js`

## Before you take real customers

This version is a solid foundation, but be aware of what is still missing:
- **Products:** the 25 products are sample data in `db.js`. To use your own, edit that list (name, price, stock, category) and delete `data/prevoir.db` once before launch so the database is rebuilt. After launch, add products through new admin screens (next step to build) rather than deleting the database.
- **Online payment** is built in (SSLCommerz) but stays off until you add your keys (Part 5). It needs an approved merchant account to take real money.
- **No emails or SMS.** Customers are not notified when status changes. They must use Track an order. Adding SMS or email on status change is a small next step.
- **No product photos yet.**
