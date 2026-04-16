const allowedTemplateTypes = [
  "appointment-confirmation",
  "payment-success",
  "consultation-completed",
  "payment-verification",
  "custom"
];

const defaultSubjects = {
  "appointment-confirmation": "Appointment Confirmation",
  "payment-success": "Payment Successful",
  "consultation-completed": "Consultation Completed",
  "payment-verification": "Payment Verification In Progress",
  custom: "Notification"
};

const escapeHtml = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const baseLayout = (title, bodyContent) => {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
      <h2 style="margin-bottom: 12px;">${escapeHtml(title)}</h2>
      <div>${bodyContent}</div>
      <hr style="margin: 20px 0; border: 0; border-top: 1px solid #e5e7eb;" />
      <p style="font-size: 12px; color: #6b7280;">HealthLink Notification Service</p>
    </div>
  `;
};

const formatColomboDateTime = (value) => {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(date);
};

const appointmentTemplate = (data, recipient) => {
  const name = recipient.name || data.patientName || "there";
  const joinUrl = data.joinUrl || data.telemedicineLink || "";
  const consultationDate = formatColomboDateTime(data.consultationDate);
  return baseLayout(
    "Appointment Confirmation",
    `
      <p>Hello ${escapeHtml(name)},</p>
      <p>Your appointment has been confirmed.</p>
      <p><strong>Doctor:</strong> ${escapeHtml(data.doctorName || "N/A")}</p>
      <p><strong>Patient:</strong> ${escapeHtml(data.patientName || "N/A")}</p>
      <p><strong>Appointment ID:</strong> ${escapeHtml(data.appointmentId || "N/A")}</p>
      <p><strong>Date:</strong> ${escapeHtml(consultationDate)} (Asia/Colombo)</p>
      ${joinUrl ? `<p><strong>Telemedicine Link:</strong> <a href="${escapeHtml(joinUrl)}">${escapeHtml(joinUrl)}</a></p>` : ""}
      ${data.message ? `<p>${escapeHtml(data.message)}</p>` : ""}
    `
  );
};

const paymentSuccessTemplate = (data, recipient) => {
  const name = recipient.name || data.patientName || "there";
  return baseLayout(
    "Payment Successful",
    `
      <p>Hello ${escapeHtml(name)},</p>
      <p>Your payment has been received successfully.</p>
      <p><strong>Amount:</strong> ${escapeHtml(data.amount || "N/A")}</p>
      <p><strong>Payment ID:</strong> ${escapeHtml(data.paymentId || "N/A")}</p>
      ${data.message ? `<p>${escapeHtml(data.message)}</p>` : ""}
    `
  );
};

const consultationCompletedTemplate = (data, recipient) => {
  const name = recipient.name || data.patientName || "there";
  const consultationDate = formatColomboDateTime(data.consultationDate);
  return baseLayout(
    "Consultation Completed",
    `
      <p>Hello ${escapeHtml(name)},</p>
      <p>Your consultation has been marked as completed.</p>
      <p><strong>Doctor:</strong> ${escapeHtml(data.doctorName || "N/A")}</p>
      <p><strong>Date:</strong> ${escapeHtml(consultationDate)} (Asia/Colombo)</p>
      <p>Please review follow-up instructions in your patient portal.</p>
      ${data.message ? `<p>${escapeHtml(data.message)}</p>` : ""}
    `
  );
};

const paymentVerificationTemplate = (data, recipient) => {
  const name = recipient.name || data.patientName || "there";
  return baseLayout(
    "Payment Verification In Progress",
    `
      <p>Hello ${escapeHtml(name)},</p>
      <p>Your bank transfer payment is under review.</p>
      <p><strong>Payment ID:</strong> ${escapeHtml(data.paymentId || "N/A")}</p>
      <p>You will be notified once verification is completed.</p>
      ${data.message ? `<p>${escapeHtml(data.message)}</p>` : ""}
    `
  );
};

const customTemplate = (data) => {
  return baseLayout(
    data.subject || "Notification",
    `
      <p>${escapeHtml(data.message || "You have a new notification from HealthLink.")}</p>
      ${data.html || ""}
    `
  );
};

const renderTemplate = (templateType, data, recipient = {}) => {
  switch (templateType) {
    case "appointment-confirmation":
      return appointmentTemplate(data, recipient);
    case "payment-success":
      return paymentSuccessTemplate(data, recipient);
    case "consultation-completed":
      return consultationCompletedTemplate(data, recipient);
    case "payment-verification":
      return paymentVerificationTemplate(data, recipient);
    case "custom":
      return customTemplate(data);
    default:
      throw new Error(`Unsupported template type: ${templateType}`);
  }
};

const getDefaultSubject = (templateType) => {
  return defaultSubjects[templateType] || "Notification";
};

const renderSmsTemplate = (templateType, data, recipient = {}) => {
  const name = recipient.name || data.patientName || data.doctorName || "there";
  const consultationDate = formatColomboDateTime(data.consultationDate);

  switch (templateType) {
    case "appointment-confirmation":
      return [
        `Hello ${name}, your appointment is confirmed. ` +
        `Doctor: ${data.doctorName || "N/A"}. ` +
        `Date: ${consultationDate}. ` +
        `Appointment ID: ${data.appointmentId || "N/A"}.`,
        data.joinUrl || data.telemedicineLink
          ? `Telemedicine link: ${data.joinUrl || data.telemedicineLink}.`
          : "",
        data.message ? `${data.message}` : ""
      ]
        .filter(Boolean)
        .join(" ");
    case "payment-success":
      return (
        `Hello ${name}, your payment is successful. ` +
        `Amount: ${data.amount || "N/A"}. ` +
        `Payment ID: ${data.paymentId || "N/A"}.`
      );
    case "consultation-completed":
      return (
        `Hello ${name}, your consultation is completed. ` +
        `Doctor: ${data.doctorName || "N/A"}. ` +
        `Date: ${consultationDate}.`
      );
    case "payment-verification":
      return (
        `Hello ${name}, your payment is under verification. ` +
        `Payment ID: ${data.paymentId || "N/A"}.`
      );
    case "custom":
      return data.message || "You have a new notification from HealthLink.";
    default:
      return data.message || "You have a new notification from HealthLink.";
  }
};

module.exports = {
  allowedTemplateTypes,
  renderTemplate,
  getDefaultSubject,
  renderSmsTemplate
};
