const { Stripe } = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const allowed = new Set(["track_a", "track_b", "consult"]);
    const track = allowed.has(body.track) ? body.track : "track_a";

    const priceMap = {
      track_a: process.env.STRIPE_PRICE_TRACK_A,
      track_b: process.env.STRIPE_PRICE_TRACK_B,
      consult: process.env.STRIPE_PRICE_CONSULT,
    };
    const priceId = priceMap[track];
    if (!priceId) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error:
            "Online checkout for this option is not configured yet — please use the Contact form below or email contact@thecitationagency.com.",
        }),
      };
    }

    const domain = process.env.DOMAIN || process.env.URL || "https://thecitationagency.com";

    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted_page",
      mode: "payment",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: false },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: "auto",
      success_url: `${domain}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${domain}/?checkout=cancelled`,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        source: "thecitationagency.com",
        track,
        business_name: String(body.businessName || "").slice(0, 120),
        contact_phone: String(body.phone || "").slice(0, 40),
        website_url: String(body.websiteUrl || "").slice(0, 160),
      },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe Checkout error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Unable to start Stripe Checkout right now. Please email contact@thecitationagency.com.",
      }),
    };
  }
};
