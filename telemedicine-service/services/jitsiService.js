const sanitizeSegment = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_");

const generateRoomName = (appointmentId) => {
  const safeAppointmentId = sanitizeSegment(appointmentId);
  return `appointment_${safeAppointmentId}_${Date.now()}`;
};

const generateMeetingUrl = (roomName) => {
  const domain = process.env.JITSI_DOMAIN || "meet.jit.si";
  return `https://${domain}/${roomName}`;
};

module.exports = {
  generateRoomName,
  generateMeetingUrl
};
