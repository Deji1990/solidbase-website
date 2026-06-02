// ============================================================
// SOLIDBASE — assessment-intake Edge Function
// Deploy in: Supabase Dashboard → Edge Functions → New Function
// Name it: assessment-intake
// ============================================================
//
// REQUIRED SECRETS (set in Edge Functions → Manage Secrets):
//   RESEND_API_KEY    — your Resend API key
//   DB_URL            — https://zphecbxxnxtebizjrbqi.supabase.co
//   DB_ANON_KEY       — your Supabase anon/public key
//   DB_SERVICE_KEY    — your Supabase service_role key (server-side only, never in frontend)
//   COMPANY_EMAIL     — email address to receive new lead notifications
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY")!;
const DB_URL          = Deno.env.get("DB_URL")!;
const DB_SERVICE_KEY  = Deno.env.get("DB_SERVICE_KEY")!;
const COMPANY_EMAIL   = Deno.env.get("COMPANY_EMAIL") || "solidbaseltd@hotmail.com";
const FROM_EMAIL      = "info@solidbaseconsultingltd.com";

const supabase = createClient(DB_URL, DB_SERVICE_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  console.log("Resend:", JSON.stringify(data));
}

function tierLabel(t: string) {
  return { basic: "Basic", standard: "Standard", premium: "Premium" }[t] ?? t;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const d = await req.json();
    console.log("Assessment intake from:", d.email, "| tier:", d.selected_tier);

    // 1. Save to database
    const { data: row, error: dbErr } = await supabase
      .from("assessment_requests")
      .insert({
        selected_tier:           d.selected_tier,
        full_name:               d.full_name,
        email:                   d.email,
        phone:                   d.phone,
        country_of_residence:    d.country_of_residence,
        referral_source:         d.referral_source  || null,
        plot_address:            d.plot_address,
        estate_name:             d.estate_name      || null,
        lga:                     d.lga,
        plot_size:               d.plot_size        || null,
        survey_plan_number:      d.survey_plan_number || null,
        title_number:            d.title_number     || null,
        number_of_plots:         d.number_of_plots  || null,
        acquisition_method:      d.acquisition_method,
        seller_agent_name:       d.seller_agent_name || null,
        concerns:                d.concerns         || [],
        other_concerns:          d.other_concerns   || null,
        preferred_call_datetime: d.preferred_call_datetime || null,
        uploaded_documents:      d.uploaded_documents || [],
        consent_given:           d.consent_given,
      })
      .select()
      .single();

    if (dbErr) { console.error("DB error:", JSON.stringify(dbErr)); throw new Error("Failed to save submission."); }
    console.log("Saved — id:", row.id);

    // 2. Generate 7-day signed URLs for uploaded documents
    const docLinks = await Promise.all(
      (d.uploaded_documents || []).map(async (doc: any) => {
        const { data: signed } = await supabase.storage
          .from("assessment-documents")
          .createSignedUrl(doc.path, 60 * 60 * 24 * 7);
        const link = signed?.signedUrl
          ? `<a href="${signed.signedUrl}" style="color:#006837;">${doc.name}</a>`
          : doc.name;
        return `<li><strong>${doc.label}:</strong> ${link}</li>`;
      })
    );

    const tier     = tierLabel(d.selected_tier);
    const concerns = d.concerns?.join(", ") || "None specified";

    // 3. Company notification email
    try {
      await sendEmail(
        COMPANY_EMAIL,
        `New ${tier} Assessment — ${d.full_name}`,
        `
        <div style="font-family:Arial,sans-serif;max-width:640px;color:#0A0A0A;">
          <div style="background:#0A0A0A;padding:24px 32px;">
            <h1 style="color:#8ECF0F;margin:0;font-size:22px;">New ${tier} Assessment Request</h1>
            <p style="color:rgba(255,255,255,0.4);font-size:11px;margin:6px 0 0;letter-spacing:0.15em;text-transform:uppercase;">Ref: ${row.id}</p>
          </div>
          <div style="padding:32px;">
            <h3 style="border-bottom:1px solid #eee;padding-bottom:8px;">§ A — Client</h3>
            <p><strong>Name:</strong> ${d.full_name}</p>
            <p><strong>Email:</strong> <a href="mailto:${d.email}">${d.email}</a></p>
            <p><strong>Phone:</strong> ${d.phone}</p>
            <p><strong>Country:</strong> ${d.country_of_residence}</p>
            <p><strong>Referral:</strong> ${d.referral_source || "Not specified"}</p>

            <h3 style="border-bottom:1px solid #eee;padding-bottom:8px;margin-top:24px;">§ B — Property</h3>
            <p><strong>Address:</strong> ${d.plot_address}</p>
            <p><strong>Estate:</strong> ${d.estate_name || "—"}</p>
            <p><strong>LGA:</strong> ${d.lga}</p>
            <p><strong>Size:</strong> ${d.plot_size || "—"}</p>
            <p><strong>Survey Plan No:</strong> ${d.survey_plan_number || "Not provided"}</p>
            <p><strong>Title No:</strong> ${d.title_number || "Not provided"}</p>
            ${d.number_of_plots ? `<p><strong>Number of Plots:</strong> ${d.number_of_plots}</p>` : ""}
            <p><strong>Acquisition:</strong> ${d.acquisition_method || "—"}</p>
            <p><strong>Seller/Agent:</strong> ${d.seller_agent_name || "—"}</p>

            <h3 style="border-bottom:1px solid #eee;padding-bottom:8px;margin-top:24px;">§ D — Concerns</h3>
            <p>${concerns}</p>
            ${d.other_concerns ? `<p><strong>Other:</strong> ${d.other_concerns}</p>` : ""}
            ${d.preferred_call_datetime ? `<p><strong>Preferred Call:</strong> ${d.preferred_call_datetime}</p>` : ""}

            <h3 style="border-bottom:1px solid #eee;padding-bottom:8px;margin-top:24px;">§ C — Documents (7-day links)</h3>
            ${docLinks.length > 0 ? `<ul>${docLinks.join("")}</ul>` : "<p>No documents uploaded.</p>"}
          </div>
        </div>`
      );
    } catch (e) { console.error("Company email failed:", e); }

    // 4. Client confirmation email
    try {
      await sendEmail(
        d.email,
        `Your ${tier} Assessment is Confirmed — Solidbase Consulting`,
        `
        <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#0A0A0A;">
          <div style="background:#0A0A0A;padding:32px;text-align:center;">
            <h1 style="color:#8ECF0F;font-size:26px;margin:0;">Solidbase Consulting</h1>
            <p style="color:rgba(255,255,255,0.4);font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;">Planning Risk Intelligence · Lagos</p>
          </div>
          <div style="padding:40px 32px;">
            <h2 style="font-size:24px;margin-bottom:6px;">Thank you, ${d.full_name}.</h2>
            <p style="color:#555;line-height:1.8;font-size:15px;">
              Your <strong>${tier} Assessment Request</strong> has been received and is now in our queue.
              A registered town planner will review your submission and follow up within <strong>24–48 hours</strong>.
            </p>

            <div style="background:#F5F3EE;border-left:4px solid #8ECF0F;padding:20px 24px;margin:28px 0;">
              <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.2em;color:#006837;margin:0 0 14px;font-family:monospace;">Your Submission Summary</p>
              <p style="margin:5px 0;font-size:14px;"><strong>Tier:</strong> ${tier}</p>
              <p style="margin:5px 0;font-size:14px;"><strong>Property:</strong> ${d.plot_address}</p>
              <p style="margin:5px 0;font-size:14px;"><strong>Estate / Area:</strong> ${d.estate_name || "—"}</p>
              <p style="margin:5px 0;font-size:14px;"><strong>LGA:</strong> ${d.lga}</p>
              ${d.concerns?.length ? `<p style="margin:5px 0;font-size:14px;"><strong>Concerns flagged:</strong> ${concerns}</p>` : ""}
              ${d.uploaded_documents?.length ? `<p style="margin:5px 0;font-size:14px;"><strong>Documents uploaded:</strong> ${d.uploaded_documents.length}</p>` : ""}
              <p style="margin:10px 0 0;font-size:11px;color:#999;font-family:monospace;">Reference: ${row.id}</p>
            </div>

            <h3 style="font-size:16px;margin-bottom:8px;">What happens next?</h3>
            <ol style="color:#555;line-height:2.2;padding-left:20px;font-size:14px;">
              <li>A registered town planner reviews your submission and documents</li>
              <li>We may contact you for any missing information or clarification</li>
              <li>Your Planning Risk Report is prepared and signed</li>
              ${d.selected_tier === "standard" ? "<li>We schedule your 30-minute advisory call at your preferred time</li>" : ""}
              ${d.selected_tier === "premium"  ? "<li>Site visit and portfolio review are coordinated separately</li><li>90-day advisory retainer begins upon report delivery</li>" : ""}
              <li>Your signed report is delivered to this email address</li>
            </ol>

            <p style="color:#777;font-size:13px;margin-top:24px;line-height:1.7;">
              Questions in the meantime? Reply to this email or contact us at
              <a href="mailto:info@solidbaseconsultingltd.com" style="color:#006837;">info@solidbaseconsultingltd.com</a>
            </p>
          </div>
          <div style="background:#0A0A0A;padding:24px;text-align:center;">
            <p style="color:rgba(255,255,255,0.3);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;margin:0;">
              © 2026 Solidbase Consulting Limited · Lagos, Nigeria<br>
              Don't Buy Blind. Buy With Solidbase.
            </p>
          </div>
        </div>`
      );
    } catch (e) { console.error("Client email failed:", e); }

    return new Response(JSON.stringify({ success: true, id: row.id }), {
      headers: { "Content-Type": "application/json", ...CORS },
    });

  } catch (err: any) {
    console.error("Function error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }
});
