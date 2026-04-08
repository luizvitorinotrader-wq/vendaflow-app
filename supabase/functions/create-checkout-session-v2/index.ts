import Stripe from "npm:stripe@18.4.0";
import { createClient } from "npm:@supabase/supabase-js@2";

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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  const jsonResponse = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Método não permitido" }, 405);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripePriceStarter = Deno.env.get("STRIPE_PRICE_STARTER");
    const stripePricePro = Deno.env.get("STRIPE_PRICE_PRO");
    const stripePricePremium = Deno.env.get("STRIPE_PRICE_PREMIUM");
    const siteUrl = Deno.env.get("SITE_URL");

    if (!supabaseUrl || !supabaseAnonKey || !stripeSecretKey || !siteUrl) {
      console.error("Missing required environment variables");
      return jsonResponse({ error: "Service misconfigured" }, 500);
    }

    // Criar client com o token do usuário
    const supabase = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("Erro de autenticação:", userError);
      return jsonResponse({ error: "Não autorizado" }, 401);
    }

    console.log("Usuário autenticado:", user.id);

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      // Se não há body, usar store_id do perfil
      requestBody = {};
    }

    const { storeId, plan } = requestBody;

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("store_id, email")
      .eq("id", user.id)
      .maybeSingle();

    console.log("Perfil encontrado:", profile);

    if (profileError) {
      console.error("Erro ao buscar perfil:", profileError);
      return jsonResponse({ error: "Erro ao buscar perfil" }, 500);
    }

    let store;

    // Priority 1: Use provided storeId from request
    if (storeId) {
      if (typeof storeId !== 'string') {
        return jsonResponse({ error: 'storeId must be a string' }, 400);
      }

      const { data: requestedStore, error: storeError } = await supabase
        .from('stores')
        .select('id, plan, owner_id, subscription_status, stripe_customer_id')
        .eq('id', storeId)
        .eq('owner_id', user.id)
        .maybeSingle();

      if (storeError || !requestedStore) {
        console.error("Store validation error:", storeError);
        return jsonResponse({ error: 'Loja não encontrada ou não autorizada' }, 403);
      }

      store = requestedStore;
    }
    // Priority 2: Use profile's current store_id if available
    else if (profile?.store_id) {
      const { data: profileStore, error: storeError } = await supabase
        .from('stores')
        .select('id, plan, owner_id, subscription_status, stripe_customer_id')
        .eq('id', profile.store_id)
        .eq('owner_id', user.id)
        .maybeSingle();

      if (!storeError && profileStore) {
        store = profileStore;
      }
    }

    // Priority 3: Auto-select from user's stores
    if (!store) {
      const { data: userStores, error: storesError } = await supabase
        .from('stores')
        .select('id, plan, owner_id, subscription_status, stripe_customer_id, created_at')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true });

      if (storesError) {
        console.error("Error fetching stores:", storesError);
        return jsonResponse({ error: "Erro ao buscar lojas" }, 500);
      }

      if (!userStores || userStores.length === 0) {
        console.error("No stores found for user:", user.id);
        return jsonResponse({ error: "Nenhuma loja encontrada" }, 404);
      }

      // Prefer active subscription, otherwise use oldest
      store = userStores.find(s => s.subscription_status === 'active') || userStores[0];
    }

    if (!store) {
      console.error("Store ID não encontrado após todas as tentativas");
      return jsonResponse({ error: "Loja não encontrada" }, 404);
    }

    const selectedPlan = plan || store.plan || "professional";
    const finalStoreId = store.id;

    // Validate store.id exists before proceeding
    if (!finalStoreId || typeof finalStoreId !== 'string') {
      console.error("CRITICAL: store.id is missing or invalid:", finalStoreId);
      return jsonResponse({ error: "Invalid store ID" }, 500);
    }

    // Determine which price ID to use based on plan
    let stripePriceId: string;
    if (selectedPlan === "starter" && stripePriceStarter) {
      stripePriceId = stripePriceStarter;
    } else if (selectedPlan === "premium" && stripePricePremium) {
      stripePriceId = stripePricePremium;
    } else if (stripePricePro) {
      stripePriceId = stripePricePro;
    } else {
      console.error("No valid Stripe price ID configured for plan:", selectedPlan);
      return jsonResponse({ error: "Plan pricing not configured" }, 500);
    }

    const customerEmail = profile.email || user.email;
    console.log("Email do cliente:", customerEmail);

    const stripe = new Stripe(stripeSecretKey);

    // Fetch the full store data including stripe_customer_id
    const { data: fullStore, error: fullStoreError } = await supabase
      .from('stores')
      .select('stripe_customer_id')
      .eq('id', finalStoreId)
      .maybeSingle();

    if (fullStoreError) {
      console.error("Error fetching full store data:", fullStoreError);
      return jsonResponse({ error: "Erro ao buscar dados da loja" }, 500);
    }

    let stripeCustomerId = fullStore?.stripe_customer_id;

    // SAFE CUSTOMER REUSE LOGIC
    // Step 1: If store already has a stripe_customer_id, reuse it
    if (stripeCustomerId) {
      console.log("Reusing existing stripe_customer_id from store:", stripeCustomerId);
    }
    // Step 2: If not, search Stripe by email and attempt to reuse
    else if (customerEmail) {
      console.log("No stripe_customer_id in store. Searching Stripe for existing customer by email:", customerEmail);

      try {
        const existingCustomers = await stripe.customers.list({
          email: customerEmail,
          limit: 10,
        });

        if (existingCustomers.data.length > 0) {
          // Filter out deleted customers
          const activeCustomers = existingCustomers.data.filter(c => !c.deleted);

          if (activeCustomers.length === 1) {
            // Exactly one active customer found - safe to reuse
            const reusableCustomer = activeCustomers[0];
            stripeCustomerId = reusableCustomer.id;
            console.log("Found exactly 1 matching Stripe customer. Reusing:", stripeCustomerId);

            // Step 3: Persist this customer ID to the store to avoid duplicate searches
            try {
              const { error: updateError } = await supabase
                .from('stores')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', finalStoreId)
                .eq('owner_id', user.id); // Extra safety: ensure ownership

              if (updateError) {
                // Check if error is due to unique constraint violation
                if (updateError.code === '23505') {
                  console.error("CRITICAL: Duplicate stripe_customer_id detected. Another store already owns this customer:", stripeCustomerId);
                  // Don't reuse - let Stripe create a new customer
                  stripeCustomerId = null;
                } else {
                  console.error("Warning: Failed to save stripe_customer_id to store:", updateError);
                  // Continue anyway - checkout can still proceed with the reused ID
                }
              } else {
                console.log("Successfully saved stripe_customer_id to store:", finalStoreId);
              }
            } catch (saveError) {
              console.error("Exception while saving stripe_customer_id:", saveError);
              // Continue - checkout can proceed even if save fails
            }
          } else if (activeCustomers.length > 1) {
            // Multiple customers found - use the most recent one
            const mostRecentCustomer = activeCustomers.sort((a, b) => b.created - a.created)[0];
            stripeCustomerId = mostRecentCustomer.id;
            console.log(`Found ${activeCustomers.length} customers for ${customerEmail}. Using most recent:`, stripeCustomerId);

            // Attempt to persist
            try {
              const { error: updateError } = await supabase
                .from('stores')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', finalStoreId)
                .eq('owner_id', user.id);

              if (updateError) {
                if (updateError.code === '23505') {
                  console.error("CRITICAL: Duplicate stripe_customer_id detected. Another store already owns this customer:", stripeCustomerId);
                  stripeCustomerId = null;
                } else {
                  console.error("Warning: Failed to save stripe_customer_id to store:", updateError);
                }
              } else {
                console.log("Successfully saved stripe_customer_id to store:", finalStoreId);
              }
            } catch (saveError) {
              console.error("Exception while saving stripe_customer_id:", saveError);
            }
          } else {
            console.log("No active Stripe customers found for email:", customerEmail);
          }
        } else {
          console.log("No existing Stripe customer found for email:", customerEmail);
        }
      } catch (stripeError) {
        console.error("Error searching Stripe customers:", stripeError);
        // Continue - we'll create a new customer via customer_email
      }
    }

    // Final validation before creating Stripe session
    if (!store.id) {
      console.error("CRITICAL ERROR: store.id is missing before Stripe checkout creation");
      throw new Error("store.id is required for Stripe checkout");
    }

    const checkoutMetadata = {
      store_id: store.id,
      owner_id: user.id,
      plan: selectedPlan || plan || store.plan || 'starter',
    };

    console.log("Creating Stripe checkout with metadata:", checkoutMetadata);

    // Build checkout session params
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${siteUrl}/app/my-subscription?success=1`,
      cancel_url: `${siteUrl}/app/my-subscription`,
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: checkoutMetadata,
      },
    };

    // Use existing customer if available, otherwise use email to create new one
    if (stripeCustomerId) {
      sessionParams.customer = stripeCustomerId;
      console.log("Reusing Stripe customer:", stripeCustomerId);
    } else {
      sessionParams.customer_email = customerEmail;
      console.log("Will create new Stripe customer with email:", customerEmail);
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log("Sessão criada com sucesso:", session.id);

    return jsonResponse({ url: session.url });

  } catch (error) {
    console.error("Erro geral:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Erro interno" },
      500
    );
  }
});
