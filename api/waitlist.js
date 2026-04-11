import { supabase } from "./_lib/supabase.js";
import { resend } from "./_lib/resend.js";
import mailchimp from "./_lib/mailchimp.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM_EMAIL = process.env.FROM_EMAIL || "rayan.alhobayb@gmail.com";
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { full_name, email, neighborhood } = req.body ?? {};

  // --- validation ---
  const missing = [];
  if (!full_name?.trim()) missing.push("full_name");
  if (!email?.trim()) missing.push("email");
  if (!neighborhood?.trim()) missing.push("neighborhood");

  if (missing.length) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(", ")}`,
    });
  }

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  const trimmedName = full_name.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const firstName = trimmedName.split(" ")[0];

  // --- insert ---
  const { data, error } = await supabase
    .from("waitlist")
    .insert({
      full_name: trimmedName,
      email: trimmedEmail,
      neighborhood: neighborhood.trim(),
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "This email is already on the waitlist" });
    }
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }

  // --- confirmation email ---
  if (resend) try {
    await resend.emails.send({
      from: `Onyx <${FROM_EMAIL}>`,
      to: trimmedEmail,
      subject: "You're on the Onyx waitlist",
      html: `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1C1C22;">
          <h1 style="font-size: 24px; color: #C5A55A; margin-bottom: 16px;">Welcome, ${firstName}!</h1>
          <p style="font-size: 16px; line-height: 1.6;">
            You're officially on the Onyx waitlist. We're building the first credit card
            in Saudi Arabia that rewards your rent — and you'll be among the first to know
            when we launch.
          </p>
          <p style="font-size: 16px; line-height: 1.6;">
            We'll be in touch soon with updates. In the meantime, keep an eye on your inbox.
          </p>
          <p style="font-size: 14px; color: #888; margin-top: 32px;">
            — The Onyx Team
          </p>
        </div>
      `,
    });
  } catch (emailErr) {
    console.error("Failed to send confirmation email:", emailErr);
  }

  // --- mailchimp sync ---
  if (mailchimp && MAILCHIMP_LIST_ID) {
    try {
      await mailchimp.lists.addListMember(MAILCHIMP_LIST_ID, {
        email_address: trimmedEmail,
        status: "subscribed",
        merge_fields: {
          FNAME: firstName,
        },
      });
    } catch (mcErr) {
      console.error("Failed to add subscriber to Mailchimp:", mcErr?.response?.body || mcErr);
    }
  }

  // --- admin notification ---
  if (resend && NOTIFY_EMAIL) {
    try {
      await resend.emails.send({
        from: `Onyx <${FROM_EMAIL}>`,
        to: NOTIFY_EMAIL,
        subject: `New waitlist signup: ${trimmedName}`,
        text: [
          `New waitlist signup:`,
          ``,
          `Name:         ${trimmedName}`,
          `Email:        ${trimmedEmail}`,
          `Neighborhood: ${neighborhood.trim()}`,
          `Signed up at: ${data.created_at}`,
        ].join("\n"),
      });
    } catch (notifyErr) {
      console.error("Failed to send admin notification:", notifyErr);
    }
  }

  return res.status(200).json({ message: "You're on the waitlist!", data });
}
