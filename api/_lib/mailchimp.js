import mailchimp from "@mailchimp/mailchimp_marketing";

const apiKey = process.env.MAILCHIMP_API_KEY;
const server = process.env.MAILCHIMP_SERVER_PREFIX;

if (!apiKey || !server) {
  throw new Error("Missing MAILCHIMP_API_KEY or MAILCHIMP_SERVER_PREFIX environment variables");
}

mailchimp.setConfig({ apiKey, server });

export default mailchimp;
