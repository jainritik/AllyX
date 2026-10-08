const supportEmail = "kitirjain@gmail.com";
const supportSubject = "AllyX Support Request";

export const supportContact = {
    email: supportEmail,
    // `mailto:` silently does nothing in many browsers when no desktop mail app is
    // configured. Open a browser compose window instead, which works for the Gmail
    // account most customers already use. Keep the generic URI available for a
    // future in-app mail client or a customer's own support tooling.
    emailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(supportEmail)}&su=${encodeURIComponent(supportSubject)}`,
    emailFallbackUrl: `mailto:${supportEmail}?subject=${encodeURIComponent(supportSubject)}`,
    whatsappDisplay: "+91-8377038800",
    whatsappUrl: "https://wa.me/918377038800",
} as const;
