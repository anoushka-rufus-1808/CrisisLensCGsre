export const EMAILJS_CONFIG = {
  serviceId:  import.meta.env.VITE_EMAILJS_SERVICE_ID  ?? "",
  templateId: import.meta.env.VITE_EMAILJS_TEMPLATE_ID ?? "",
  publicKey:  import.meta.env.VITE_EMAILJS_PUBLIC_KEY  ?? "",
  recipients: [
    {
      name:  import.meta.env.VITE_ALERT_RECIPIENT_NAME  ?? "Education Officer",
      email: import.meta.env.VITE_ALERT_RECIPIENT_EMAIL ?? "",
    },
  ],
};
