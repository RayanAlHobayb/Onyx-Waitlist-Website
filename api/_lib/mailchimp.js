import mailchimp from "@mailchimp/mailchimp_marketing";

const apiKey = process.env.MAILCHIMP_API_KEY;
const server = process.env.MAILCHIMP_SERVER_PREFIX;

if (apiKey && server) {
  mailchimp.setConfig({ apiKey, server });
}

export default apiKey && server ? mailchimp : null;
