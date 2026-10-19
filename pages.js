'use strict';
// Content for the Help, About and Policy pages. Edit freely.
// Legal pages are starting points only: have them reviewed before you launch for real.

module.exports = {
  help: {
    title: 'Help centre',
    intro: 'Quick answers to the most common questions. Still stuck? Send us a message at the bottom of this page.',
    faq: [
      { q: 'How do I track my order?', a: 'Use "Track an order" and enter your order number and the email you used at checkout. If you were signed in, your orders are also listed under My orders.' },
      { q: 'How long does delivery take?', a: 'Most orders arrive in 3 to 7 days. Orders over ৳3,000 ship free; smaller orders pay a flat ৳80.' },
      { q: 'Can I cancel an order?', a: 'Yes, while the order is still in the "Placed" stage. Open the order and choose Cancel order. Once it is packed or shipped it can no longer be cancelled, but you can return it.' },
      { q: 'How do vouchers work?', a: 'Enter a code in your cart and choose Apply. One voucher can be used per order. Some vouchers need a minimum spend or only apply to one category.' },
      { q: 'How do I return an item?', a: 'You have 30 days from delivery. See Returns & refunds for the steps.' },
      { q: 'Which payment methods can I use?', a: 'Cash on delivery and bank transfer are available now. Cards and wallets are coming soon.' }
    ],
    cta: [{ label: 'Track an order', open: 'track' }, { label: 'How to buy', open: 'page:how-to-buy' }],
    support: true
  },
  'how-to-buy': {
    title: 'How to buy',
    intro: 'Shopping on Prevoir takes a few minutes.',
    sections: [
      { h: 'Find what you want', p: 'Search by name, browse the category tiles, or open Flash deals for timed discounts.' },
      { h: 'Check the details', p: 'Hover a product (or tap Quick view on a phone) for a preview. Open the product for the full description, colours and customer reviews.' },
      { h: 'Add to cart', p: 'Add as many items as you like. Free shipping applies on orders over ৳3,000. Apply a voucher code in the cart if you have one.' },
      { h: 'Check out', p: 'Enter your delivery details, choose how to pay and place the order. You get an order number straight away.' }
    ],
    cta: [{ label: 'Need help? Visit the help centre', open: 'page:help' }]
  },
  returns: {
    title: 'Returns & refunds',
    intro: 'If something is not right, we will help you sort it out.',
    sections: [
      { h: 'Return window', p: 'You can return most items within 30 days of delivery, as long as they are unused and in their original packaging.' },
      { h: 'How to start a return', ul: ['Open the help centre and send us a message with your order number.', 'Tell us which item and why you are returning it.', 'We reply with return instructions and, where it applies, a prepaid label.'] },
      { h: 'Refunds', p: 'Once a return arrives and passes a quick check, the refund goes back to the original payment method. Cash on delivery and bank transfer orders are refunded by bank transfer.' },
      { h: 'Items that cannot be returned', p: 'Opened beauty products and personalised items cannot be returned unless they arrive damaged or faulty.' }
    ],
    cta: [{ label: 'Contact support', open: 'page:help' }]
  },
  payments: {
    title: 'Payment methods',
    sections: [
      { h: 'Cash on delivery', p: 'Pay the courier in cash when your order arrives. Please keep the exact amount ready.' },
      { h: 'Bank transfer', p: 'Choose bank transfer at checkout. We show the account details and your order number, which you must use as the payment reference. Orders are packed once the transfer arrives.' },
      { h: 'Cards and wallets', p: 'Coming soon. We will add them once our payment partner is connected.' }
    ]
  },
  'our-story': {
    title: 'Our story',
    intro: 'Prevoir brings independent sellers and trusted brands together in one place.',
    sections: [
      { h: 'Why we started', p: 'Great small sellers are hard to find online. We wanted one place where independent shops and trusted brands sit side by side and a single cart covers everything.' },
      { h: 'What we care about', ul: ['Fair prices with the discount shown up front', 'Honest product descriptions and real customer reviews', 'Simple returns', 'Sellers who can start with no listing fees'] }
    ]
  },
  careers: {
    title: 'Careers',
    sections: [
      { h: 'Open roles', p: 'We have no open roles at the moment. Send us a message through the help centre if you would like us to keep your details for later.' }
    ],
    cta: [{ label: 'Contact us', open: 'page:help' }]
  },
  press: {
    title: 'Press',
    sections: [
      { h: 'Media enquiries', p: 'Journalists can reach the team through the help centre. Choose "Other" as the topic and mention your publication.' }
    ],
    cta: [{ label: 'Contact us', open: 'page:help' }]
  },
  'seller-blog': {
    title: 'Seller blog',
    intro: 'Tips for new sellers.',
    sections: [
      { h: 'Write titles buyers search for', p: 'Lead with the product type, then the material or size. "Canvas tote bag with zip pocket" works better than a brand-only name.' },
      { h: 'Price with the discount in mind', p: 'Shoppers respond to a clear before and after price. Keep the original price honest and recent.' },
      { h: 'Reply to reviews', p: 'A short, friendly reply to a critical review shows future buyers how you handle problems.' }
    ],
    cta: [{ label: 'Open your shop', open: 'seller' }]
  },
  privacy: {
    title: 'Privacy policy',
    intro: 'Starter text. Have it reviewed before you launch.',
    sections: [
      { h: 'What we collect', p: 'Your name, email, delivery address and phone number when you create an account or place an order; the items in your cart and wishlist; and the messages you send us.' },
      { h: 'How we use it', p: 'To process and deliver your orders, run your account, answer support messages and keep the store secure.' },
      { h: 'Cookies', p: 'We use one cookie to keep you signed in and remember your cart. We do not use advertising cookies.' },
      { h: 'Your choices', p: 'Ask us through the help centre to export or delete your data.' }
    ]
  },
  terms: {
    title: 'Terms of use',
    intro: 'Starter text. Have it reviewed before you launch.',
    sections: [
      { h: 'Using Prevoir', p: 'You must provide accurate details when ordering and keep your account password private.' },
      { h: 'Orders and prices', p: 'An order is confirmed when it appears in your account or tracking page. If a price is shown in error we may cancel the order and refund any payment.' },
      { h: 'Sellers', p: 'Sellers are responsible for their listings. We may remove listings that break our rules.' }
    ]
  },
  cookies: {
    title: 'Cookie policy',
    intro: 'Starter text. Have it reviewed before you launch.',
    sections: [
      { h: 'Essential cookie', p: 'A single "sid" cookie keeps you signed in and keeps your cart between visits. It lasts 30 days and cannot be switched off without losing the cart.' },
      { h: 'Browser storage', p: 'Your browser may also remember your preferred colour scheme. Nothing is shared with advertisers.' }
    ]
  }
};
