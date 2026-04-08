import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const getAllowedOrigin = (requestOrigin: string | null): string => {
  const allowedOrigins = [
    "https://app.acaigestor.com.br",
    "http://localhost:5173",
    "http://localhost:4173"
  ];

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  return allowedOrigins[0];
};

const getCorsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, Stripe-Signature",
  "Vary": "Origin",
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const stripePriceStarter = Deno.env.get("STRIPE_PRICE_STARTER");
    const stripePricePro = Deno.env.get("STRIPE_PRICE_PRO");
    const stripePricePremium = Deno.env.get("STRIPE_PRICE_PREMIUM");

    if (!stripeSecretKey || !stripeWebhookSecret) {
      console.error("ERROR: Stripe keys not configured");
      return new Response(
        JSON.stringify({ error: "Stripe configuration missing" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    // Validate signature first (critical security check)
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error("ERROR: Missing stripe-signature header");
      return new Response(
        JSON.stringify({ error: "Missing signature" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    let body: string;
    let event: Stripe.Event;

    try {
      body = await req.text();
    } catch (error) {
      console.error("ERROR: Failed to read request body:", error);
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    try {
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        stripeWebhookSecret
      );
    } catch (error: any) {
      console.error("ERROR: Signature verification failed:", error.message);
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`✅ Webhook received: ${event.type} - Event ID: ${event.id}`);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // IDEMPOTENCY: Atomically insert event record to prevent race conditions
    // If event_id already exists, unique constraint will fail and we return 200
    const { data: eventRecord, error: eventInsertError } = await supabase
      .from("stripe_webhook_events")
      .insert({
        event_id: event.id,
        event_type: event.type,
        store_id: null, // Will be updated after processing
      })
      .select("id")
      .maybeSingle();

    if (eventInsertError) {
      // Check if it's a duplicate (unique constraint violation)
      if (eventInsertError.code === '23505') {
        console.log(`⏭️  DUPLICATE: Event ${event.id} already processed. Returning 200.`);
        return new Response(
          JSON.stringify({ received: true, message: "Event already processed" }),
          {
            status: 200,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          }
        );
      }

      // Other database error
      console.error("ERROR: Failed to insert event record:", eventInsertError);
      return new Response(
        JSON.stringify({ error: "Database error" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    console.log(`📝 Event ${event.id} recorded. Starting processing...`);

    // Helper function to determine plan from price ID
    const getPlanFromPriceId = (priceId: string): { plan: string; plan_name: string } => {
      if (priceId === stripePriceStarter) {
        return { plan: "starter", plan_name: "Starter" };
      } else if (priceId === stripePricePro) {
        return { plan: "professional", plan_name: "Pro" };
      } else if (priceId === stripePricePremium) {
        return { plan: "premium", plan_name: "Premium" };
      }
      // Default to Pro if price ID is unknown
      return { plan: "professional", plan_name: "Pro" };
    };

    let processedStoreId: string | null = null;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const storeId = session.metadata?.store_id;
        const stripeCustomerId = session.customer as string;
        const stripeSubscriptionId = session.subscription as string;

        if (!storeId) {
          console.error("❌ ERROR: store_id not found in checkout session metadata");
          break;
        }

        console.log(`📦 Processing checkout for store: ${storeId}, customer: ${stripeCustomerId}`);
        processedStoreId = storeId;

        // DEFENSIVE CHECK: Verify this store is not already linked to different Stripe IDs
        const { data: currentStore, error: fetchError } = await supabase
          .from("stores")
          .select("stripe_customer_id, stripe_subscription_id")
          .eq("id", storeId)
          .maybeSingle();

        if (fetchError) {
          console.error(`❌ ERROR: Failed to fetch store ${storeId} before update:`, fetchError);
          break;
        }

        if (!currentStore) {
          console.error(`❌ ERROR: Store ${storeId} not found in database`);
          break;
        }

        // Check if store already has different customer ID
        if (currentStore.stripe_customer_id && currentStore.stripe_customer_id !== stripeCustomerId) {
          console.error(`❌ CRITICAL: Store ${storeId} already linked to customer ${currentStore.stripe_customer_id}, cannot link to ${stripeCustomerId}`);
          break;
        }

        // Check if store already has different subscription ID
        if (currentStore.stripe_subscription_id && stripeSubscriptionId && currentStore.stripe_subscription_id !== stripeSubscriptionId) {
          console.error(`❌ CRITICAL: Store ${storeId} already linked to subscription ${currentStore.stripe_subscription_id}, cannot link to ${stripeSubscriptionId}`);
          break;
        }

        // DEFENSIVE CHECK: Verify no other store owns these Stripe IDs
        if (stripeCustomerId) {
          const { data: customerConflict } = await supabase
            .from("stores")
            .select("id")
            .eq("stripe_customer_id", stripeCustomerId)
            .neq("id", storeId)
            .maybeSingle();

          if (customerConflict) {
            console.error(`❌ CRITICAL: Customer ${stripeCustomerId} already linked to store ${customerConflict.id}, cannot link to ${storeId}`);
            break;
          }
        }

        if (stripeSubscriptionId) {
          const { data: subscriptionConflict } = await supabase
            .from("stores")
            .select("id")
            .eq("stripe_subscription_id", stripeSubscriptionId)
            .neq("id", storeId)
            .maybeSingle();

          if (subscriptionConflict) {
            console.error(`❌ CRITICAL: Subscription ${stripeSubscriptionId} already linked to store ${subscriptionConflict.id}, cannot link to ${storeId}`);
            break;
          }
        }

        const updateData: any = {
          stripe_customer_id: stripeCustomerId,
          subscription_status: "active",
        };

        if (stripeSubscriptionId) {
          updateData.stripe_subscription_id = stripeSubscriptionId;

          const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

          // Determine plan from subscription items
          if (subscription.items.data.length > 0) {
            const priceId = subscription.items.data[0].price.id;
            const planInfo = getPlanFromPriceId(priceId);
            updateData.plan = planInfo.plan;
            updateData.plan_name = planInfo.plan_name;
            console.log(`Plan detected: ${planInfo.plan_name} (${priceId})`);
          }

          if (subscription.current_period_end) {
            updateData.subscription_ends_at = new Date(subscription.current_period_end * 1000).toISOString();
          }
        }

        const { error } = await supabase
          .from("stores")
          .update(updateData)
          .eq("id", storeId);

        if (error) {
          console.error(`❌ ERROR: Failed to update store ${storeId}:`, error);
          if (error.code === '23505') {
            console.error("❌ CRITICAL: UNIQUE CONSTRAINT VIOLATION - Stripe ID already assigned to another store");
          }
        } else {
          console.log(`✅ SUCCESS: Store ${storeId} updated (checkout completed)`);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (!customerId) {
          console.error("❌ ERROR: customer_id missing in invoice.paid event");
          break;
        }

        console.log(`📦 Processing invoice.paid for customer: ${customerId}`);

        // DEFENSIVE CHECK: Find exactly one store by customer ID
        const { data: stores, error: findError } = await supabase
          .from("stores")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError) {
          console.error(`❌ ERROR: Failed to find store by customer_id ${customerId}:`, findError);
          break;
        }

        if (!stores || stores.length === 0) {
          console.error(`❌ ERROR: No store found for customer ${customerId}`);
          break;
        }

        if (stores.length > 1) {
          console.error(`❌ CRITICAL: Multiple stores (${stores.length}) found for customer ${customerId}. This violates unique constraint!`);
          break;
        }

        const targetStore = stores[0];

        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);

        const updateData: any = {
          subscription_status: "active",
        };

        // Determine plan from subscription items
        if (subscription.items.data.length > 0) {
          const priceId = subscription.items.data[0].price.id;
          const planInfo = getPlanFromPriceId(priceId);
          updateData.plan = planInfo.plan;
          updateData.plan_name = planInfo.plan_name;
          console.log(`Plan detected on invoice.paid: ${planInfo.plan_name} (${priceId})`);
        }

        if (subscription.current_period_end) {
          updateData.subscription_ends_at = new Date(subscription.current_period_end * 1000).toISOString();
        }

        const { data: storeData, error: storeError } = await supabase
          .from("stores")
          .update(updateData)
          .eq("id", targetStore.id)
          .select("id")
          .maybeSingle();

        if (storeError) {
          console.error(`❌ ERROR: Failed to update store (invoice.paid) for customer ${customerId}:`, storeError);
        } else if (storeData) {
          processedStoreId = storeData.id;
          console.log(`✅ SUCCESS: Store ${storeData.id} updated (invoice.paid) - Customer: ${customerId}`);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        if (!customerId) {
          console.error("❌ ERROR: customer_id missing in invoice.payment_failed event");
          break;
        }

        console.log(`📦 Processing invoice.payment_failed for customer: ${customerId}`);

        // DEFENSIVE CHECK: Find exactly one store by customer ID
        const { data: stores, error: findError } = await supabase
          .from("stores")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError) {
          console.error(`❌ ERROR: Failed to find store by customer_id ${customerId}:`, findError);
          break;
        }

        if (!stores || stores.length === 0) {
          console.error(`❌ ERROR: No store found for customer ${customerId}`);
          break;
        }

        if (stores.length > 1) {
          console.error(`❌ CRITICAL: Multiple stores (${stores.length}) found for customer ${customerId}. This violates unique constraint!`);
          break;
        }

        const targetStore = stores[0];

        const { data: storeData, error: storeError } = await supabase
          .from("stores")
          .update({ subscription_status: "past_due" })
          .eq("id", targetStore.id)
          .select("id")
          .maybeSingle();

        if (storeError) {
          console.error(`❌ ERROR: Failed to update store (payment failed) for customer ${customerId}:`, storeError);
        } else if (storeData) {
          processedStoreId = storeData.id;
          console.log(`✅ SUCCESS: Store ${storeData.id} marked as past_due - Customer: ${customerId}`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        if (!customerId) {
          console.error("❌ ERROR: customer_id missing in subscription.updated event");
          break;
        }

        console.log(`📦 Processing subscription.updated for customer: ${customerId}, status: ${subscription.status}`);

        // DEFENSIVE CHECK: Find exactly one store by customer ID
        const { data: stores, error: findError } = await supabase
          .from("stores")
          .select("id, stripe_subscription_id")
          .eq("stripe_customer_id", customerId);

        if (findError) {
          console.error(`❌ ERROR: Failed to find store by customer_id ${customerId}:`, findError);
          break;
        }

        if (!stores || stores.length === 0) {
          console.error(`❌ ERROR: No store found for customer ${customerId}`);
          break;
        }

        if (stores.length > 1) {
          console.error(`❌ CRITICAL: Multiple stores (${stores.length}) found for customer ${customerId}. This violates unique constraint!`);
          break;
        }

        const targetStore = stores[0];

        // Check if subscription ID conflicts with existing assignment
        if (targetStore.stripe_subscription_id && targetStore.stripe_subscription_id !== subscription.id) {
          console.error(`WARNING: Store ${targetStore.id} has subscription ${targetStore.stripe_subscription_id}, replacing with ${subscription.id}`);
        }

        const updateData: any = {
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id,
        };

        if (subscription.current_period_end) {
          updateData.subscription_ends_at = new Date(subscription.current_period_end * 1000).toISOString();
        }

        if (subscription.trial_end) {
          updateData.trial_ends_at = new Date(subscription.trial_end * 1000).toISOString();
        }

        const { data: storeData, error: storeError } = await supabase
          .from("stores")
          .update(updateData)
          .eq("id", targetStore.id)
          .select("id")
          .maybeSingle();

        if (storeError) {
          console.error(`❌ ERROR: Failed to update store (subscription.updated) for customer ${customerId}:`, storeError);
          if (storeError.code === '23505') {
            console.error("❌ CRITICAL: UNIQUE CONSTRAINT VIOLATION - Subscription ID already assigned to another store");
          }
        } else if (storeData) {
          processedStoreId = storeData.id;
          console.log(`✅ SUCCESS: Store ${storeData.id} updated (subscription.updated) - Status: ${subscription.status}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        if (!customerId) {
          console.error("❌ ERROR: customer_id missing in subscription.deleted event");
          break;
        }

        console.log(`📦 Processing subscription.deleted for customer: ${customerId}`);

        // DEFENSIVE CHECK: Find exactly one store by customer ID
        const { data: stores, error: findError } = await supabase
          .from("stores")
          .select("id")
          .eq("stripe_customer_id", customerId);

        if (findError) {
          console.error(`❌ ERROR: Failed to find store by customer_id ${customerId}:`, findError);
          break;
        }

        if (!stores || stores.length === 0) {
          console.error(`❌ ERROR: No store found for customer ${customerId}`);
          break;
        }

        if (stores.length > 1) {
          console.error(`❌ CRITICAL: Multiple stores (${stores.length}) found for customer ${customerId}. This violates unique constraint!`);
          break;
        }

        const targetStore = stores[0];

        const { data: storeData, error: storeError } = await supabase
          .from("stores")
          .update({
            subscription_status: "cancelled",
            subscription_ends_at: new Date().toISOString(),
          })
          .eq("id", targetStore.id)
          .select("id")
          .maybeSingle();

        if (storeError) {
          console.error(`❌ ERROR: Failed to update store (subscription.deleted) for customer ${customerId}:`, storeError);
        } else if (storeData) {
          processedStoreId = storeData.id;
          console.log(`✅ SUCCESS: Store ${storeData.id} subscription cancelled - Customer: ${customerId}`);
        }
        break;
      }

      default:
        console.log(`ℹ️  Unhandled event type: ${event.type}`);
    }

    // Update the event record with the store_id
    if (processedStoreId) {
      const { error: updateError } = await supabase
        .from("stripe_webhook_events")
        .update({ store_id: processedStoreId })
        .eq("event_id", event.id);

      if (updateError) {
        console.error("WARNING: Failed to update event record with store_id:", updateError);
        // Non-critical error, don't fail the webhook
      } else {
        console.log(`✅ Event ${event.id} processed successfully for store ${processedStoreId}`);
      }
    } else {
      console.log(`✅ Event ${event.id} processed (no store affected)`);
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("❌ CRITICAL ERROR in webhook handler:", error);

    // Return 500 for unexpected errors (Stripe will retry)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
