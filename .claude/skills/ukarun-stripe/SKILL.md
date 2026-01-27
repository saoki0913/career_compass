---
name: ukarun:stripe
description: Stripe決済連携ガイド
---

# Skill: ウカルン Stripe決済

Use this skill when working with Stripe payment integration for the Career Compass (ウカルン) application.

## When to Use
- User asks to implement payment features
- User mentions "決済", "課金", "Stripe", "サブスクリプション"
- User wants to add billing functionality

## Context
- **SDK**: Stripe Node.js SDK
- **Server**: `src/lib/stripe/index.ts`
- **Client**: `src/lib/stripe/client.ts`
- **Webhook**: `src/app/api/webhooks/stripe/route.ts`

## Pricing Structure

### Plans
| Plan | Price | Credits/Month | Features |
|------|-------|---------------|----------|
| Free | 0円 | 30 | 企業5社, リライト1本, スタイル3種 |
| Standard | 980円/月 | 300 | 無制限, リライト3本, スタイル8種, 設問別指摘 |
| Pro | 2,980円/月 | 800 | Standard + RAG 150ページ, ガクチカ20件 |

### Stripe Products (to create)
```typescript
// Products
const PRODUCTS = {
  STANDARD: 'prod_standard',
  PRO: 'prod_pro',
};

// Prices (recurring monthly)
const PRICES = {
  STANDARD_MONTHLY: 'price_standard_monthly',  // ¥980
  PRO_MONTHLY: 'price_pro_monthly',            // ¥2,980
};
```

## Implementation Patterns

### 1. Checkout Session Creation
```typescript
// src/app/api/checkout/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { auth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { priceId } = await request.json();

  // Get or create Stripe customer
  let customerId = await getStripeCustomerId(session.user.id);
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
    await saveStripeCustomerId(session.user.id, customerId);
  }

  // Create checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
    metadata: { userId: session.user.id },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    locale: 'ja',
  });

  return NextResponse.json({ url: checkoutSession.url });
}
```

### 2. Webhook Handler
```typescript
// src/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await handleSubscriptionChange(event.data.object);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionCanceled(event.data.object);
      break;

    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
```

### 3. Subscription Handlers
```typescript
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  // Subscription is handled by subscription.created webhook
  console.log(`Checkout completed for user ${userId}`);
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const userId = await getUserIdByStripeCustomer(customerId);
  if (!userId) return;

  const priceId = subscription.items.data[0].price.id;
  const plan = getPlanByPriceId(priceId);

  // Update user's plan
  await db.update(users)
    .set({
      plan: plan,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  // Reset credits to new plan's monthly amount
  const newCredits = PLAN_CREDITS[plan];
  await db.update(credits)
    .set({
      balance: newCredits,
      lastRefreshAt: new Date(),
      nextRefreshAt: new Date(subscription.current_period_end * 1000),
    })
    .where(eq(credits.userId, userId));

  // Create notification
  await createNotification(userId, {
    type: 'PLAN_CHANGED',
    message: `プランが${plan}に変更されました`,
  });
}

async function handleSubscriptionCanceled(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const userId = await getUserIdByStripeCustomer(customerId);
  if (!userId) return;

  // Downgrade to Free at period end (already handled by status)
  // Or immediate if payment failed
  if (subscription.status === 'canceled') {
    await db.update(users)
      .set({
        plan: 'FREE',
        subscriptionStatus: 'canceled',
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  const userId = await getUserIdByStripeCustomer(customerId);
  if (!userId) return;

  // Immediate downgrade to Free on payment failure
  await db.update(users)
    .set({
      plan: 'FREE',
      subscriptionStatus: 'past_due',
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await createNotification(userId, {
    type: 'PAYMENT_FAILED',
    message: '支払いに失敗しました。Freeプランにダウングレードされました。',
    variant: 'destructive',
  });
}
```

### 4. Customer Portal
```typescript
// Allow users to manage their subscription
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = await getStripeCustomerId(session.user.id);
  if (!customerId) {
    return NextResponse.json({ error: 'No subscription' }, { status: 400 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

## Plan Rules

### Plan Change Rules
1. **Immediate effect**: Plan changes apply immediately
2. **Credit reset**: Credits reset to new plan's monthly amount
3. **Billing cycle reset**: Next credit refresh date = plan change date + 1 month
4. **Cancellation**: Features continue until period end
5. **Payment failure**: Immediate downgrade to Free

### Credit System
```typescript
const PLAN_CREDITS = {
  GUEST: 15,
  FREE: 30,
  STANDARD: 300,
  PRO: 800,
};

// Monthly refresh (on billing date)
async function refreshCredits(userId: string) {
  const user = await getUser(userId);
  const newCredits = PLAN_CREDITS[user.plan];

  await db.update(credits)
    .set({
      balance: newCredits,  // No carryover
      lastRefreshAt: new Date(),
    })
    .where(eq(credits.userId, userId));
}
```

## Testing with Stripe CLI

```bash
# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed

# Test cards
4242424242424242  # Success
4000000000000341  # Attaching fails
4000000000009995  # Insufficient funds
```

## Security Considerations
- Always verify webhook signatures
- Use HTTPS in production
- Store Stripe customer ID securely
- Don't expose secret key to client
- Validate priceId against allowed values
