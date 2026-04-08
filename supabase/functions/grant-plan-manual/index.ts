import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GrantPlanRequest {
  storeId: string;
  plan: 'starter' | 'pro' | 'premium';
  durationDays: number;
  reason: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create client with user context
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get current user's profile - must be super_admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile || profile.role !== 'super_admin') {
      return new Response(
        JSON.stringify({ error: "Only super admins can grant plans manually" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const body: GrantPlanRequest = await req.json();
    const { storeId, plan, durationDays, reason } = body;

    // Validate input
    if (!storeId || !plan || !durationDays || !reason) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: storeId, plan, durationDays, reason" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate plan
    if (!['starter', 'pro', 'premium'].includes(plan)) {
      return new Response(
        JSON.stringify({ error: "Plan must be 'starter', 'pro', or 'premium'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate duration
    if (durationDays <= 0 || durationDays > 365 * 5) {
      return new Response(
        JSON.stringify({ error: "Duration must be between 1 and 1825 days (5 years)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate reason
    if (reason.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Reason must be at least 3 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if store exists
    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("id, name, plan, subscription_status, access_mode")
      .eq("id", storeId)
      .single();

    if (storeError || !store) {
      return new Response(
        JSON.stringify({ error: "Store not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate subscription end date
    const subscriptionEndsAt = new Date();
    subscriptionEndsAt.setDate(subscriptionEndsAt.getDate() + durationDays);

    // Update store with manual plan grant
    const { error: updateError } = await supabaseAdmin
      .from("stores")
      .update({
        plan: plan,
        subscription_status: 'active',
        is_blocked: false,
        subscription_ends_at: subscriptionEndsAt.toISOString(),
        access_mode: 'manual',
        granted_by: user.id,
        granted_at: new Date().toISOString(),
        grant_reason: reason.trim(),
      })
      .eq("id", storeId);

    if (updateError) {
      console.error("Error updating store:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to grant plan" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Log to super admin audit log
    const { error: auditError } = await supabaseAdmin
      .from("super_admin_audit_log")
      .insert({
        super_admin_id: user.id,
        action_type: 'grant_plan_manual',
        target_store_id: storeId,
        metadata: {
          store_id: storeId,
          store_name: store.name,
          plan: plan,
          duration_days: durationDays,
          reason: reason.trim(),
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          previous_plan: store.plan,
          previous_status: store.subscription_status,
          previous_access_mode: store.access_mode,
        },
      });

    if (auditError) {
      console.error("Error creating audit log:", auditError);
      // Don't fail the request, just log the error
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        store: {
          id: storeId,
          name: store.name,
          plan: plan,
          subscription_status: 'active',
          subscription_ends_at: subscriptionEndsAt.toISOString(),
          access_mode: 'manual',
          granted_by: user.id,
          granted_at: new Date().toISOString(),
          grant_reason: reason.trim(),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
