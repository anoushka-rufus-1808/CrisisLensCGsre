import emailjs from "@emailjs/browser";
import { EMAILJS_CONFIG } from "@/config/emailjs";
import type { Facility } from "@/context/DataContext";

export type AlertStatus = "idle" | "sending" | "success" | "error";

export interface AlertEmailResult {
  status:  AlertStatus;
  message: string;
  email:   string;
}

// ─── Build vulnerability list ─────────────────────────────────────────────────

function buildVulnerabilities(f: Facility): string {
  const lines: string[] = [];

  if (f.primaryWaterSource === "tanker")
    lines.push("• Water supply depends on tanker delivery");
  if (f.waterShortageDaysPerMonth > 10)
    lines.push(`• Water shortage for ${f.waterShortageDaysPerMonth} days/month`);
  if (!f.alternateWaterSource)
    lines.push("• No alternate water source available");
  if (f.dailyPowerCutHours > 4)
    lines.push(`• Power cut averages ${f.dailyPowerCutHours} hours/day`);

  if (f.facilityType === "school") {
    const s = f as import("@/context/DataContext").School;
    if (s.buildingCondition === "Poor")
      lines.push("• Building condition: POOR — extreme heat retention risk");
    if (s.roofType === "Tin" || s.roofType === "Asbestos")
      lines.push(`• Roof type: ${s.roofType} — amplifies indoor heat`);
    if (!s.tankAvailable)
      lines.push("• No water storage tank");
    if (s.heatIllnessCasesCount > 0)
      lines.push(`• ${s.heatIllnessCasesCount} heat illness cases recorded`);
    if (s.heatwaveClosureDays3Years > 0)
      lines.push(`• ${s.heatwaveClosureDays3Years} closure days due to heatwave (last 3 years)`);
    if (s.fansWorkingCount === 0)
      lines.push("• No working fans available");
  } else {
    const h = f as import("@/context/DataContext").Hospital;
    if (!h.generatorAvailable)
      lines.push("• No backup generator — risk to critical equipment");
    if (h.backupDurationHours < 4)
      lines.push(`• Backup power only ${h.backupDurationHours} hour(s)`);
    if (!h.ambulanceAvailable)
      lines.push("• No ambulance available");
    if (h.sanitationCondition === "Poor")
      lines.push("• Sanitation condition: POOR");
    if (h.heatstrokeCasesCount > 0)
      lines.push(`• ${h.heatstrokeCasesCount} heatstroke cases recorded`);
    if (h.waterScarcityDisruptionDays > 0)
      lines.push(`• ${h.waterScarcityDisruptionDays} disruption days/year due to water scarcity`);
  }

  return lines.length > 0 ? lines.join("\n") : "• No critical vulnerabilities flagged";
}

// ─── Build recommended actions ────────────────────────────────────────────────

function buildRecommendations(f: Facility): string {
  const lines: string[] = [];

  if (f.riskOverall >= 68) {
    lines.push("1. IMMEDIATE: Deploy mobile water tanker within 24 hours");
    lines.push("2. IMMEDIATE: Issue heatwave advisory to all staff");
    lines.push("3. Conduct emergency infrastructure inspection within 48 hours");
  } else {
    lines.push("1. Schedule infrastructure assessment within 7 days");
    lines.push("2. Ensure water reserves are adequate for the coming season");
  }

  if (f.facilityType === "school") {
    const s = f as import("@/context/DataContext").School;
    if (s.buildingCondition === "Poor")
      lines.push("3. Arrange temporary cooling (fans/coolers) before summer peak");
    if (s.roofType === "Tin" || s.roofType === "Asbestos")
      lines.push("4. Install heat insulation on roof before May");
    if ((s.heatwaveClosureDays3Years ?? 0) > 5)
      lines.push("5. Consider early summer vacation schedule");
  } else {
    const h = f as import("@/context/DataContext").Hospital;
    if (!h.generatorAvailable)
      lines.push("3. URGENT: Arrange portable generator for critical wards");
    if ((h.avgDailyFootfall ?? 0) > 100)
      lines.push("4. Set up shaded outdoor waiting area with ORS/water");
  }

  return lines.join("\n");
}

// ─── Main hook ────────────────────────────────────────────────────────────────

export function useAlertEmail() {
  /**
   * sendAlert — sends email alert for a facility.
   *
   * Admin mode:  sends ONLY to facility's own contactEmail.
   * Fallback:    if facility has no contactEmail, sends to EMAILJS_CONFIG.recipients.
   *
   * @param facility     The facility being alerted
   * @param senderName   Name of the logged-in user sending the alert
   * @param customNote   Optional extra message from the admin
   */
  const sendAlert = async (
    facility:    Facility,
    senderName:  string,
    customNote?: string,
  ): Promise<AlertEmailResult[]> => {

    const templateParams = {
      facility_name:   facility.name,
      facility_type:   facility.facilityType === "school" ? "School" : "Hospital",
      district:        facility.district,
      address:         facility.address,
      risk_overall:    facility.riskOverall.toString(),
      risk_level:      facility.riskLevel,
      risk_heatwave:   facility.riskHeatwave.toString(),
      risk_water:      facility.riskWaterScarcity.toString(),
      risk_infra:      facility.riskInfrastructure.toString(),
      vulnerabilities: buildVulnerabilities(facility),
      recommendations: buildRecommendations(facility),
      alert_time:      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
      sent_by:         senderName,
      custom_note:     customNote?.trim() ?? "",
    };

    // ── Decide who to send to ─────────────────────────────────────────────────
    // If the facility has its own contactEmail → send ONLY to that facility.
    // Otherwise → fall back to the admin recipient list in emailjs.ts config.
    const facilityEmail = (facility as Facility & { contactEmail?: string }).contactEmail;

    const recipients = facilityEmail
      ? [{ name: facility.name, email: facilityEmail }]
      : EMAILJS_CONFIG.recipients;

    // ── Send one email per recipient ──────────────────────────────────────────
    const results: AlertEmailResult[] = [];

    for (const recipient of recipients) {
      try {
        await emailjs.send(
          EMAILJS_CONFIG.serviceId,
          EMAILJS_CONFIG.templateId,
          {
            ...templateParams,
            recipient_name: recipient.name,
            to_email:       recipient.email,
          },
          EMAILJS_CONFIG.publicKey,
        );
        results.push({
          status:  "success",
          message: `Sent to ${recipient.name}`,
          email:   recipient.email,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          status:  "error",
          message: `Failed: ${msg}`,
          email:   recipient.email,
        });
      }
    }

    return results;
  };

  return { sendAlert };
}