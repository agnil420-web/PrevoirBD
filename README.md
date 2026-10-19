# Prevoir marketplace

A small online marketplace: an Express + SQLite backend and a plain HTML/CSS/JavaScript storefront. No build step.

```
npm install
npm start          # http://localhost:3000
```

Needs Node 22 or newer. On first start it creates `data/prevoir.db` and fills it with 25 sample products, reviews and three voucher codes.

Other commands: `npm run dev` (restart on change), `npm test` (API checks), `npm run test:ui` (loads the page in a simulated browser and clicks through it), `npm run test:all`.

## Changing the name and the look

- **Name and logo:** `public/index.html` (header, footer, title), `pages.js` (policy and about copy) and the order prefix `PV-` in `server.js`.
- **Colours:** every colour is a variable at the top of `public/styles.css`, with a light set and a dark set. Change `--brand` (azure), `--deal` (coral) and `--fg` (ink navy) and the whole site follows.
- **Fonts:** Unbounded for headings and the logo, Figtree for everything else. They load from Google Fonts in the first `<link>` of `index.html`.
- The Our story, Careers and Press pages are placeholder text. Replace them with your own.

## How it works

```
 Browser (public/)                          Server (server.js)                    SQLite (data/prevoir.db)
 ───────────────────                        ──────────────────                    ─────────────────────
 index.html  markup                         /api/*   JSON endpoints     ───────►  users, sessions
 styles.css  look and feel   ── fetch ──►   sessionMiddleware (cookie)            products, reviews
 app.js      all behaviour   ◄── JSON ───   pricing + stock rules                 cart_items, wishlist
                                            static files from /public             orders, order_items
                                                                                  vouchers, sellers
                                                                                  support_tickets, app_waitlist
```

- **The server is the source of truth.** Prices, stock, vouchers, shipping and totals are all calculated on the server. The page only displays what the API returns, so changing a price in the browser cannot change what someone pays.
- **Visitors get a session cookie (`sid`) on their first API call.** A guest's cart, voucher and wishlist belong to that session for 30 days. When they sign in or register, the guest cart and wishlist are merged into their account.
- **Checkout runs in one database transaction:** it re-checks stock, re-validates the voucher, creates the order and its items, reduces stock, and empties the cart. If anything fails, nothing is saved. Cancelling an order puts the stock back.
- **Passwords** are hashed with scrypt and a random salt. Sessions are rotated at sign in. Every write request must carry an `X-Prevoir: 1` header and cookies are `SameSite=Lax`, which blocks cross-site request forgery. Auth, checkout, support and tracking endpoints are rate limited.

## What every button does

| Where | Button | What happens |
|---|---|---|
| Top strip | Sell on Prevoir, Start selling | Seller application form, saved to `sellers` (status `pending`) |
| Top strip | Help centre | FAQ plus a contact form, saved to `support_tickets` |
| Top strip, footer | Get the app, App Store, Google Play | Waitlist form, saved to `app_waitlist` |
| Header | Search, search hints | `GET /api/products?q=` |
| Header | Saved | Wishlist list with Add to cart and Remove |
| Header | Sign in / your name | Sign in or create an account. Once signed in: My orders, Saved items, Sign out |
| Header | Cart | Drawer with quantities, voucher box, shipping, total, Checkout |
| Hero | Slider arrows, dots, buttons | Switch slides; buttons jump to the deals or the feed |
| Promo tiles, category tiles | | Filter the feed by category |
| Flash deals | Add to cart, heart, preview | Live stock, "claimed" bar and countdown from the server |
| Product cards | Title or image | Product page with description, colours, specs, reviews, quantity, Add to cart, Buy now |
| Product cards | Hover (desktop) or Quick view (touch) | Preview with Add to cart, heart and View full details |
| Feed | For you, Top sellers, New arrivals, Under ৳2,500, Show more | Server-side tabs and paging |
| Cart | + / − / Remove, Apply voucher | `PATCH`/`DELETE /api/cart/...`, `POST /api/cart/voucher` |
| Cart | Checkout | Delivery form, Cash on delivery or Bank transfer, Place order |
| Order screens | Track an order | Look up an order by number and email, no account needed |
| Order screens | Cancel order | Allowed while the order is still "Placed"; asks you to confirm |
| Product page | Post review | Signed-in users, one review per product |
| Footer | How to buy, Returns, Payments, Our story, Careers, Press, Seller blog, Privacy, Terms, Cookies | Content pages from `pages.js` |

Voucher codes in the sample data: `WELCOME10` (10% off a first order over ৳2,000), `GLOW15` (15% off Beauty items), `FREESHIP`.
Prices are in Bangladeshi taka (৳) and stored in poisha (1 taka = 100 poisha). Shipping is ৳80 under ৳3,000 and free above. Change `FREE_SHIP_CENTS` and `SHIP_CENTS` at the top of `server.js`.

## API

All paths are under `/api`. Mutating requests need the `X-Prevoir: 1` header and a JSON body.

| Method and path | Purpose |
|---|---|
| `POST /auth/register`, `/auth/login`, `/auth/logout`; `GET /me` | Accounts |
| `GET /categories`, `/products?q=&cat=&tab=&limit=&offset=`, `/products/:id`, `/flash` | Catalogue |
| `POST /products/:id/reviews` | Review (signed in) |
| `GET /wishlist`; `PUT` / `DELETE /wishlist/:id` | Wishlist |
| `GET /cart`; `POST /cart/items`; `PATCH` / `DELETE /cart/items/:id`; `DELETE /cart` | Cart |
| `POST /cart/voucher`; `DELETE /cart/voucher` | Vouchers |
| `POST /orders`; `GET /orders`; `GET /orders/track?number=&email=`; `POST /orders/cancel` | Orders |
| `GET /pages/:slug`; `POST /support`; `POST /sellers`; `POST /app-waitlist` | Content and forms |
| `GET /config`; `POST /orders/pay`; `POST /pay/success`, `/pay/fail`, `/pay/cancel`, `/pay/ipn` (gateway callbacks, not under /api) | Online payment |
| `GET /admin/summary`, `/admin/orders`, `/admin/sellers`, `/admin/support`; `PATCH /admin/orders/:number`, `/admin/sellers/:id` | Admin (header `x-admin-key`) |

Admin examples (the key is printed when the server starts, or set `ADMIN_KEY`):

```
curl -H "x-admin-key: $ADMIN_KEY" localhost:3000/api/admin/orders
curl -X PATCH -H "x-admin-key: $ADMIN_KEY" -H "X-Prevoir: 1" -H "Content-Type: application/json" \
     -d '{"status":"shipped"}' localhost:3000/api/admin/orders/PV-20261013-A1B2C3
```

Order status moves `placed → packed → shipped → delivered`. Customers can only cancel while it is `placed`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | Port to listen on |
| `DB_PATH` | `data/prevoir.db` | SQLite file (`:memory:` for tests). Existing `data/previorbd.db` or `data/haat.db` files from earlier versions are reused |
| `ADMIN_KEY` | random each start | Key for the admin endpoints. Set it in production |
| `BANK_DETAILS` | placeholder text | Shown to customers who choose bank transfer. Set your real account details |
| `SSLCOMMERZ_STORE_ID`, `SSLCOMMERZ_STORE_PASSWORD`, `PUBLIC_URL` | empty | All three turn on the Pay online option (see DEPLOY.md, part 5) |
| `SSLCOMMERZ_MODE` | `sandbox` | `live` for real money |

## What is demo-only today

- **Online payment** works through SSLCommerz once you add your keys. Without keys the option shows "coming soon".
- **No emails.** Nothing is sent when an order is placed or a ticket is created. Customers keep their order number and use Track an order.
- **No product images.** Products use icon tiles. Colours, highlights and descriptions are sample text.
- **No seller accounts yet.** Seller applications are collected, but sellers cannot log in or list products. Admin tasks are API-only.
- **Legal pages are starter text.** Have privacy, terms and cookie pages reviewed before launch.

## Next steps, in a sensible order

1. **Payments.** Add a payment provider: create a checkout session on the server, mark the order `pending payment`, and move it to `placed` from the provider's webhook. Never take card numbers on your own server.
2. **Email.** Order confirmation, status changes and a "forgot password" flow (add a `password_resets` table with expiring tokens). Use any transactional email service.
3. **Real product data.** Add `seller_id`, `images`, variants (colours, sizes) and a proper category tree to `products`. Store images in object storage with a CDN.
4. **Seller dashboard.** Seller login (a `role` column on `users`), approve applications, add and edit products, see and fulfil their own orders, payouts.
5. **Admin screen.** A small UI over the existing `/api/admin/*` endpoints: orders, sellers, tickets, vouchers, stock.
6. **Search.** Switch to SQLite FTS5 for typo-tolerant, ranked search; add filters for price, rating and free shipping.
7. **Flash sales.** Replace the rolling three-hour window with a `flash_sales` table (start, end, limit, price) so you can schedule campaigns.
8. **Growth path.** SQLite is fine for one server. When you need several servers, move to Postgres, keep sessions in Redis and rate limits in a shared store.
9. **Deploy.** HTTPS, set `ADMIN_KEY` and `BANK_DETAILS`, put `data/` on a persistent disk, back it up, add error logging and uptime monitoring, add cookie consent if you add analytics.
10. **Quality.** Run `npm run test:all` in CI; add accessibility and mobile checks in a real browser.

## Project layout

```
start.js         Entry point used by hosting (loads .env, starts the server)
server.js        Express app, all API routes, pricing and order logic
db.js            Schema and first-run sample data
pages.js         Help, policy and about content
public/          index.html, styles.css, app.js (the storefront)
test/smoke.mjs   API tests
test/ui.mjs      Simulated-browser tests
data/            SQLite file is created here
```
