import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
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
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { token } = requestBody;

    if (!token || typeof token !== 'string' || token.length < 32) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Valid token is required"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from("magic_link_tokens")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (tokenError || !tokenData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "invalid"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (tokenData.used) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "used"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);

    if (now > expiresAt) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "expired"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.createSession({
      user_id: tokenData.user_id,
    });

    if (sessionError || !sessionData) {
      console.error("Error creating session:", sessionError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "session_error"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("magic_link_tokens")
      .update({
        used: true,
        used_at: new Date().toISOString()
      })
      .eq("token", token);

    if (updateError) {
      console.error("Error updating token:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        session: sessionData.session,
        user: sessionData.user
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error in validate-magic-link:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "server_error"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
