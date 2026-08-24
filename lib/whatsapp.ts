/**
 * WhatsApp sales contact — the single source of truth for plan purchases.
 *
 * Every "buy a plan" / "upgrade" CTA across the marketing site and the app
 * routes to this number so that Pro and Enterprise licenses are issued
 * manually (as signed keys) after a direct WhatsApp conversation.
 */

export const WHATSAPP_PHONE_DISPLAY = "+92 319 6198859";

/** Digits-only E.164 form used to build the wa.me deep link. */
export const WHATSAPP_PHONE_E164 = WHATSAPP_PHONE_DISPLAY.replace(/[^\d]/g, "");

/** Prefilled WhatsApp inquiry messages, keyed by plan tier. */
export const WHATSAPP_MESSAGES = {
  generic: "Hi! I'd like to buy a Fluxentiq plan. Please share pricing details.",
  pro: "Hi! I'd like to buy the Fluxentiq Pro plan.",
  enterprise: "Hi! I'd like to buy the Fluxentiq Enterprise plan.",
} as const;

/**
 * Builds a wa.me deep link that opens a WhatsApp chat with the sales number,
 * optionally prefilled with a message.
 */
export function whatsappLink(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_PHONE_E164}`;
  if (!message) {
    return base;
  }
  return `${base}?text=${encodeURIComponent(message)}`;
}
