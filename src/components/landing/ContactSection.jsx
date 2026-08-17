import React, { useState } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

const needTags = ["Scaling", "Efficiency", "Innovation", "Cost Reduction", "Data Intelligence", "Custom AI"];

export default function ContactSection() {
  const [selectedNeeds, setSelectedNeeds] = useState([]);
  const [formData, setFormData] = useState({ name: "", email: "", company: "", message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [focused, setFocused] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const toggleNeed = (need) => {
    setSelectedNeeds((prev) =>
      prev.includes(need) ? prev.filter((n) => n !== need) : [...prev, need]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email) {
      toast.error("Please fill in your name and email.");
      return;
    }
    setIsLoading(true);

    const needsList = selectedNeeds.length > 0
      ? selectedNeeds.map(n => `<span style="display:inline-block;background:#ede9fc;color:#5d3fd3;border-radius:6px;padding:3px 10px;margin:2px 4px 2px 0;font-size:13px;">${n}</span>`).join("")
      : '<span style="color:#999;">None specified</span>';

    const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#5d3fd3 0%,#7c5ce8 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">FLUX<span style="opacity:0.85;">ENTIQ</span></h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:2px;text-transform:uppercase;">New Lead from Website</p>
            </td>
          </tr>
          <!-- Alert Banner -->
          <tr>
            <td style="background:#ede9fc;padding:14px 40px;text-align:center;">
              <p style="margin:0;color:#5d3fd3;font-size:14px;font-weight:600;">⚡ New contact form submission received</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.6;">Hello Team,<br><br>You have a new inquiry from the Fluxentiq website. Here are the details:</p>

              <!-- Info Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:8px;overflow:hidden;">
                <tr style="background:#fafafa;">
                  <td style="padding:14px 20px;width:35%;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #eee;">Name</td>
                  <td style="padding:14px 20px;color:#222;font-size:15px;font-weight:600;border-bottom:1px solid #eee;">${formData.name}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #eee;">Email</td>
                  <td style="padding:14px 20px;border-bottom:1px solid #eee;"><a href="mailto:${formData.email}" style="color:#5d3fd3;font-size:15px;text-decoration:none;font-weight:600;">${formData.email}</a></td>
                </tr>
                <tr style="background:#fafafa;">
                  <td style="padding:14px 20px;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;border-bottom:1px solid #eee;">Company</td>
                  <td style="padding:14px 20px;color:#222;font-size:15px;border-bottom:1px solid #eee;">${formData.company || '—'}</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Needs</td>
                  <td style="padding:14px 20px;">${needsList}</td>
                </tr>
              </table>

              <!-- Message Box -->
              ${formData.message ? `
              <div style="margin-top:24px;background:#f9f9fb;border-left:4px solid #5d3fd3;border-radius:0 8px 8px 0;padding:20px 24px;">
                <p style="margin:0 0 8px;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Message</p>
                <p style="margin:0;color:#333;font-size:15px;line-height:1.7;">${formData.message}</p>
              </div>` : ''}

              <!-- CTA -->
              <div style="margin-top:32px;text-align:center;">
                <a href="mailto:${formData.email}" style="display:inline-block;background:linear-gradient(135deg,#5d3fd3,#7c5ce8);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;letter-spacing:0.5px;">Reply to ${formData.name}</a>
              </div>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f7;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;color:#aaa;font-size:12px;">This message was sent via the contact form on <strong style="color:#5d3fd3;">fluxentiq.com</strong></p>
              <p style="margin:6px 0 0;color:#ccc;font-size:11px;">© 2026 FLUXENTIQ. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const clientEmailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#5d3fd3 0%,#7c5ce8 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">FLUX<span style="opacity:0.85;">ENTIQ</span></h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:13px;letter-spacing:2px;text-transform:uppercase;">We've received your message</p>
            </td>
          </tr>
          <!-- Alert Banner -->
          <tr>
            <td style="background:#ede9fc;padding:14px 40px;text-align:center;">
              <p style="margin:0;color:#5d3fd3;font-size:14px;font-weight:600;">✅ Your inquiry has been submitted successfully</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px;color:#333;font-size:16px;line-height:1.7;">Hi <strong>${formData.name}</strong>,</p>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">Thank you for reaching out to <strong style="color:#5d3fd3;">Fluxentiq</strong>. We've received your inquiry and our team will review it shortly.</p>
              <p style="margin:0 0 24px;color:#555;font-size:15px;line-height:1.7;">You can expect a response from us <strong>within 24 hours</strong>. In the meantime, feel free to explore our services or connect with us on social media.</p>

              <!-- Summary Box -->
              <div style="background:#f9f9fb;border-left:4px solid #5d3fd3;border-radius:0 8px 8px 0;padding:20px 24px;margin-bottom:28px;">
                <p style="margin:0 0 10px;color:#888;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Your Submission Summary</p>
                <p style="margin:4px 0;color:#333;font-size:14px;"><strong>Name:</strong> ${formData.name}</p>
                ${formData.company ? `<p style="margin:4px 0;color:#333;font-size:14px;"><strong>Company:</strong> ${formData.company}</p>` : ''}
                ${selectedNeeds.length > 0 ? `<p style="margin:4px 0;color:#333;font-size:14px;"><strong>Areas of Interest:</strong> ${selectedNeeds.join(', ')}</p>` : ''}
                ${formData.message ? `<p style="margin:8px 0 0;color:#333;font-size:14px;"><strong>Message:</strong> ${formData.message}</p>` : ''}
              </div>

              <p style="margin:0;color:#555;font-size:15px;line-height:1.7;">We look forward to helping you transform your business with intelligent automation.</p>
              <p style="margin:16px 0 0;color:#333;font-size:15px;">Warm regards,<br/><strong style="color:#5d3fd3;">The Fluxentiq Team</strong></p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f4f4f7;padding:20px 40px;text-align:center;border-top:1px solid #eee;">
              <p style="margin:0;color:#aaa;font-size:12px;">You are receiving this email because you submitted a form on <strong style="color:#5d3fd3;">fluxentiq.com</strong></p>
              <p style="margin:6px 0 0;color:#ccc;font-size:11px;">© 2026 FLUXENTIQ. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Always send the internal lead email first
    await base44.integrations.Core.SendEmail({
      to: "afzalmedicalcomplex7@gmail.com",
      subject: `[FLUXENTIQ LEAD] New Inquiry from ${formData.name}${formData.company ? ` — ${formData.company}` : ""}`,
      body: emailBody,
      from_name: "Fluxentiq",
    });

    // Send client auto-reply — best effort, don't block form completion
    try {
      await base44.integrations.Core.SendEmail({
        to: formData.email,
        subject: `Your message to Fluxentiq has been received`,
        body: clientEmailBody,
        from_name: "Fluxentiq",
      });
    } catch (err) {
      console.warn("Client auto-reply failed:", err);
    }

    setSubmitted(true);
    toast.success("We'll be in touch within 24 hours.");
    setIsLoading(false);
  };

  if (submitted) {
    return (
      <section id="contact" className="py-32 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-6"
          >
            <motion.div
              className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto"
              animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <CheckCircle size={32} className="text-primary" />
            </motion.div>
            <h2 className="font-heading font-black text-4xl text-foreground">Message Received</h2>
            <p className="text-muted-foreground font-heading">
              Our team is reviewing your request. Expect a response within 24 hours.
            </p>
          </motion.div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="py-32 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-16 items-start">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-primary">
              The Synapse Terminal
            </span>
            <h2 className="font-heading font-black text-4xl md:text-5xl text-foreground mt-3 tracking-tight">
              <span className="flux-skew">Let's Build Your<br />
              <span className="text-primary">AI Infrastructure</span></span>
            </h2>
            <p className="mt-6 text-muted-foreground font-heading leading-relaxed max-w-md">
              Tell us what your business needs. Select the areas that matter most to you.
            </p>

            <div className="mt-8">
              <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-4">
                My business needs...
              </div>
              <div className="flex flex-wrap gap-2">
                {needTags.map((need) => (
                  <motion.button
                    key={need}
                    onClick={() => toggleNeed(need)}
                    whileHover={{ scale: 1.06 }}
                    whileTap={{ scale: 0.94 }}
                    animate={{
                      backgroundColor: selectedNeeds.includes(need) ? "hsl(var(--primary))" : "transparent",
                      borderColor: selectedNeeds.includes(need) ? "hsl(var(--primary))" : "hsl(var(--border))",
                      color: selectedNeeds.includes(need) ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
                    }}
                    transition={{ duration: 0.2 }}
                    className="px-4 py-2 rounded-xl text-sm font-heading font-medium border"
                  >
                    {need}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right: Form */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <form onSubmit={handleSubmit} className="space-y-5 p-8 rounded-3xl border border-border bg-card">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {["name", "email"].map((field) => (
                  <motion.div
                    key={field}
                    animate={{ y: focused === field ? -2 : 0 }}
                  >
                    <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </label>
                    <Input
                      type={field === "email" ? "email" : "text"}
                      value={formData[field]}
                      onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                      onFocus={() => setFocused(field)}
                      onBlur={() => setFocused(null)}
                      placeholder={field === "name" ? "John Doe" : "john@company.com"}
                      className="rounded-xl h-12 font-heading transition-all"
                    />
                  </motion.div>
                ))}
              </div>
              <motion.div animate={{ y: focused === "company" ? -2 : 0 }}>
                <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                  Company
                </label>
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  onFocus={() => setFocused("company")}
                  onBlur={() => setFocused(null)}
                  placeholder="Acme Inc."
                  className="rounded-xl h-12 font-heading"
                />
              </motion.div>
              <motion.div animate={{ y: focused === "message" ? -2 : 0 }}>
                <label className="text-[10px] font-mono font-bold uppercase tracking-widest text-muted-foreground mb-2 block">
                  Message
                </label>
                <Textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  onFocus={() => setFocused("message")}
                  onBlur={() => setFocused(null)}
                  placeholder="Tell us about your automation goals..."
                  className="rounded-xl min-h-[120px] font-heading resize-none"
                />
              </motion.div>
              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ scale: 1.03, boxShadow: "0 0 32px rgba(93,63,211,0.4)" }}
                whileTap={{ scale: 0.97 }}
                className="w-full relative flex items-center justify-center gap-3 px-7 py-4 bg-primary text-primary-foreground font-heading font-semibold rounded-2xl overflow-hidden disabled:opacity-70"
              >
                <motion.span
                  className="absolute inset-0 bg-white/10"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.5 }}
                />
                <span className="relative z-10">{isLoading ? "Sending..." : "Send Message"}</span>
                <motion.div
                  className="relative z-10"
                  animate={{ x: [0, 3, 0], rotate: [0, 15, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Send size={18} />
                </motion.div>
              </motion.button>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}