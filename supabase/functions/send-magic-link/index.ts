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

const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const MAX_ATTEMPTS_PER_EMAIL = 3;
const MAX_ATTEMPTS_PER_IP = 10;

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    const siteUrl = Deno.env.get("SITE_URL");

    if (!supabaseUrl || !supabaseServiceKey || !turnstileSecret || !siteUrl) {
      console.error("Missing required environment variables");
      return new Response(
        JSON.stringify({ error: 'Service misconfigured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let requestBody;
    try {
      requestBody = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { email, captchaToken } = requestBody;
    const clientIp = req.headers.get("x-forwarded-for") || "unknown";

    // Validate required fields
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Valid email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!captchaToken || typeof captchaToken !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Captcha token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const verifyResponse = await fetch(verifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        secret: turnstileSecret,
        response: captchaToken,
      }),
    });

    const verifyResult = await verifyResponse.json();

    if (!verifyResult.success) {
      return new Response(
        JSON.stringify({
          error: "Captcha verification failed"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const fifteenMinutesAgo = new Date(Date.now() - RATE_LIMIT_WINDOW).toISOString();

    const { data: emailAttempts } = await supabaseAdmin
      .from("magic_link_tokens")
      .select("id")
      .eq("email", email.toLowerCase())
      .gte("created_at", fifteenMinutesAgo);

    if (emailAttempts && emailAttempts.length >= MAX_ATTEMPTS_PER_EMAIL) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { data: ipAttempts } = await supabaseAdmin
      .from("magic_link_tokens")
      .select("id")
      .eq("ip_address", clientIp)
      .gte("created_at", fifteenMinutesAgo);

    if (ipAttempts && ipAttempts.length >= MAX_ATTEMPTS_PER_IP) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
    const user = userData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: insertError } = await supabaseAdmin
      .from("magic_link_tokens")
      .insert({
        user_id: user.id,
        token: token,
        email: email.toLowerCase(),
        expires_at: expiresAt,
        ip_address: clientIp,
      });

    if (insertError) {
      console.error("Error inserting token:", insertError);
      return new Response(
        JSON.stringify({
          success: true,
          message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const magicLink = `${siteUrl}/magic-link?token=${token}`;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Seu link de acesso</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 40px auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(135deg, #9333ea 0%, #2563eb 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">AçaíGestor Pro</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Seu link de acesso</h2>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 20px 0;">
                Recebemos uma solicitação para entrar na sua conta sem senha.
              </p>
              <p style="color: #4b5563; line-height: 1.6; margin: 0 0 30px 0;">
                Clique no botão abaixo para acessar com segurança:
              </p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${magicLink}" style="display: inline-block; background: linear-gradient(135deg, #9333ea 0%, #2563eb 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                  Acessar minha conta
                </a>
              </div>
              <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                Ou copie e cole este link no seu navegador:
              </p>
              <p style="color: #2563eb; font-size: 13px; word-break: break-all; background-color: #f3f4f6; padding: 12px; border-radius: 4px;">
                ${magicLink}
              </p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #ef4444; font-size: 14px; line-height: 1.6; margin: 0 0 10px 0;">
                  <strong>Importante:</strong>
                </p>
                <ul style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0; padding-left: 20px;">
                  <li>Este link é válido por 15 minutos</li>
                  <li>Pode ser usado apenas uma vez</li>
                  <li>Se você não fez esta solicitação, ignore este e-mail</li>
                </ul>
              </div>
            </div>
            <div style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} AçaíGestor Pro. Todos os direitos reservados.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { error: emailError } = await supabaseAdmin.auth.admin.sendEmail(
      email,
      "magic_link",
      {
        subject: "Seu link de acesso",
        html: emailHtml,
      }
    );

    if (emailError) {
      console.error("Error sending email:", emailError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (error) {
    console.error("Error in send-magic-link:", error);
    return new Response(
      JSON.stringify({
        success: true,
        message: "Se o e-mail estiver cadastrado, você receberá um link de acesso em instantes."
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
