import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, apikey",
};

interface CreateTeamMemberRequest {
  email: string;
  fullName: string;
  password: string;
  role: 'owner' | 'manager' | 'staff';
}

Deno.serve(async (req: Request) => {
  // VERSION MARKER - MULTI-OWNER SUPPORT ACTIVE
  console.log('🔥 CREATE TEAM MEMBER MULTI-OWNER V2 ACTIVE 🔥');

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Create Supabase admin client for privileged operations
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header (already validated by verifyJWT: true)
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

    // Create client with user context for RLS-aware queries
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Get current user from JWT (already validated by Supabase)
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

    // Get current user's profile and effective store_id (considering support mode)
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("store_id, support_mode_store_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Failed to retrieve user profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Determine effective store_id (support_mode_store_id takes precedence for super_admin)
    const storeId = profile.support_mode_store_id || profile.store_id;

    if (!storeId) {
      return new Response(
        JSON.stringify({ error: "User does not belong to a store" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check permissions: super_admin in support mode OR owner via store_users
    const isSuperAdminInSupport =
      profile.role === 'super_admin' &&
      profile.support_mode_store_id === storeId;

    let hasPermission = false;

    if (isSuperAdminInSupport) {
      // Super admin in support mode has owner permissions
      hasPermission = true;
    } else {
      // Check if normal user is owner via store_users
      const { data: storeUser, error: storeUserError } = await supabaseClient
        .from("store_users")
        .select("role")
        .eq("store_id", storeId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (storeUserError) {
        return new Response(
          JSON.stringify({ error: "Failed to verify permissions" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      hasPermission = storeUser?.role === 'owner';
    }

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: "Only store owners can create team members" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body first to get the requested role
    const body: CreateTeamMemberRequest = await req.json();
    const { email, fullName, password, role } = body;

    console.log('[create-team-member] Request details:', {
      requester_user_id: user.id,
      effective_store_id: storeId,
      target_email: email,
      requested_role: role
    });

    // Validate input
    if (!email || !fullName || !password || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, fullName, password, role" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate role - OWNER IS ALLOWED
    const allowedRoles = ['owner', 'manager', 'staff'];

    console.log('[create-team-member] Role validation:', {
      requestedRole: role,
      allowedRoles: allowedRoles,
      isValid: allowedRoles.includes(role)
    });

    if (!allowedRoles.includes(role)) {
      return new Response(
        JSON.stringify({
          error: "Invalid role. Allowed roles: owner, manager, staff",
          requestedRole: role,
          allowedRoles: allowedRoles
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get store plan to check limits
    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("plan")
      .eq("id", storeId)
      .single();

    if (storeError || !store) {
      console.error('[create-team-member] Failed to retrieve store:', storeError);
      return new Response(
        JSON.stringify({ error: "Failed to retrieve store information" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const planName = (store.plan || 'starter').toLowerCase();

    console.log('[create-team-member] Store plan:', planName);

    // If requesting owner role, check owner limit
    if (role === 'owner') {
      // Count current owners using RPC function
      const { data: ownerCount, error: ownerCountError } = await supabaseAdmin
        .rpc('count_store_owners', { p_store_id: storeId });

      if (ownerCountError) {
        console.error('[create-team-member] Failed to count owners:', ownerCountError);
        return new Response(
          JSON.stringify({ error: "Failed to check owner limits" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get max owners for plan using RPC function
      const { data: maxOwners, error: maxOwnersError } = await supabaseAdmin
        .rpc('get_max_owners', { plan: planName });

      if (maxOwnersError) {
        console.error('[create-team-member] Failed to get max owners:', maxOwnersError);
        return new Response(
          JSON.stringify({ error: "Failed to check owner limits" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log('[create-team-member] Owner limit check:', {
        current_owners: ownerCount,
        max_owners: maxOwners,
        plan: planName
      });

      // Check if adding a new owner would exceed the limit
      if ((ownerCount || 0) >= (maxOwners || 1)) {
        return new Response(
          JSON.stringify({
            error: `Limite de proprietários atingido para o plano ${planName} (${maxOwners} proprietários)`,
            code: 'OWNER_LIMIT_REACHED',
            currentCount: ownerCount,
            maxOwners: maxOwners,
            plan: planName,
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Count current active users in the store for general user limit
    const { count: activeUserCount, error: countError } = await supabaseAdmin
      .from("store_users")
      .select("*", { count: 'exact', head: true })
      .eq("store_id", storeId)
      .eq("is_active", true);

    if (countError) {
      console.error('[create-team-member] Error counting active users:', countError);
      return new Response(
        JSON.stringify({ error: "Failed to check user limits" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Define plan limits for total users
    const planLimits: Record<string, number> = {
      'starter': 3,
      'pro': 10,
      'professional': 10,
      'premium': 999,
    };

    const maxUsers = planLimits[planName] || planLimits['starter'];

    console.log('[create-team-member] User limit check:', {
      current_users: activeUserCount,
      max_users: maxUsers,
      plan: planName
    });

    // Check if adding a new user would exceed the limit
    if ((activeUserCount || 0) >= maxUsers) {
      return new Response(
        JSON.stringify({
          error: `Limite do plano atingido (${maxUsers} usuários). Faça upgrade para adicionar mais membros.`,
          code: 'USER_LIMIT_REACHED',
          currentCount: activeUserCount,
          maxUsers: maxUsers,
          plan: planName,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate password strength
    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingProfile) {
      return new Response(
        JSON.stringify({ error: "A user with this email already exists" }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create auth user with service role
    const { data: newUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName,
      },
    });

    if (createUserError || !newUser.user) {
      console.error("Error creating user:", createUserError);
      return new Response(
        JSON.stringify({ error: "Failed to create user account" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create profile (role field is legacy, real role comes from store_users)
    const { error: profileCreateError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: newUser.user.id,
        email: email.toLowerCase(),
        full_name: fullName,
        store_id: storeId,
        role: role, // Use requested role for consistency
      });

    if (profileCreateError) {
      console.error("Error creating profile:", profileCreateError);

      // Rollback: delete auth user
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);

      return new Response(
        JSON.stringify({ error: "Failed to create user profile" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create store_users record with the specified role
    const { error: storeUserCreateError } = await supabaseAdmin
      .from("store_users")
      .insert({
        store_id: storeId,
        user_id: newUser.user.id,
        role: role,
        is_active: true,
      });

    if (storeUserCreateError) {
      console.error("Error creating store_users record:", storeUserCreateError);

      // Rollback: delete profile and auth user
      await supabaseAdmin.from("profiles").delete().eq("id", newUser.user.id);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);

      return new Response(
        JSON.stringify({ error: "Failed to assign role to user" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Success response
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: newUser.user.id,
          email: email.toLowerCase(),
          fullName: fullName,
          role: role,
        },
      }),
      {
        status: 201,
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
