const doctorService = require("../services/doctorService");

const send = (res, statusCode, message, data) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

const wrap = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    return next(error);
  }
};

const registerDoctor = wrap(async (req, res) => {
  const doctor = await doctorService.registerDoctor({
    payload: req.body,
    actor: req.user
  });

  return send(res, 201, "Doctor profile created successfully", doctor);
});

const getDoctorProfile = wrap(async (req, res) => {
  const doctor = await doctorService.getDoctorProfile({ user: req.user });
  return send(res, 200, "Doctor profile fetched successfully", doctor);
});

const updateDoctorProfile = wrap(async (req, res) => {
  const doctor = await doctorService.updateDoctorProfile({
    user: req.user,
    payload: req.body
  });

  return send(res, 200, "Doctor profile updated successfully", doctor);
});

const getAllDoctors = wrap(async (req, res) => {
  const doctors = await doctorService.getAllDoctors({
    query: req.query,
    user: req.user
  });

  return send(res, 200, "Doctors fetched successfully", doctors);
});

const getDoctorById = wrap(async (req, res) => {
  const doctor = await doctorService.getDoctorById({
    id: req.params.id,
    user: req.user
  });

  return send(res, 200, "Doctor fetched successfully", doctor);
});

const updateAvailability = wrap(async (req, res) => {
  const doctor = await doctorService.updateAvailability({
    user: req.user,
    payload: req.body
  });

  return send(res, 200, "Doctor availability updated successfully", doctor);
});

const getDoctorAppointments = wrap(async (req, res) => {
  const appointments = await doctorService.getDoctorAppointments({
    user: req.user,
    authHeader: req.headers.authorization
  });

  return send(res, 200, "Doctor appointments fetched successfully", appointments);
});

const acceptAppointment = wrap(async (req, res) => {
  const appointment = await doctorService.updateAppointmentDecision({
    appointmentId: req.params.id,
    action: "accept",
    user: req.user,
    authHeader: req.headers.authorization
  });

  return send(res, 200, "Appointment accepted successfully", appointment);
});

const rejectAppointment = wrap(async (req, res) => {
  const appointment = await doctorService.updateAppointmentDecision({
    appointmentId: req.params.id,
    action: "reject",
    reason: req.body?.reason,
    user: req.user,
    authHeader: req.headers.authorization
  });

  return send(res, 200, "Appointment rejected successfully", appointment);
});

const getPatientReports = wrap(async (req, res) => {
  const reports = await doctorService.getPatientReports({
    patientId: req.params.patientId,
    user: req.user,
    authHeader: req.headers.authorization
  });

  return send(res, 200, "Patient reports fetched successfully", reports);
});

const getTelemedicineSession = wrap(async (req, res) => {
  const sessionInfo = await doctorService.getTelemedicineSession({
    appointmentId: req.params.id,
    user: req.user,
    authHeader: req.headers.authorization
  });

  return send(res, 200, "Telemedicine session details fetched successfully", sessionInfo);
});

const createPrescription = wrap(async (req, res) => {
  const prescription = await doctorService.createPrescription({
    payload: req.body,
    user: req.user,
    authHeader: req.headers.authorization
  });

  return send(res, 201, "Prescription created successfully", prescription);
});

const getPrescriptionByAppointment = wrap(async (req, res) => {
  const prescription = await doctorService.getPrescriptionByAppointment({
    appointmentId: req.params.appointmentId,
    user: req.user
  });

  return send(res, 200, "Prescription fetched successfully", prescription);
});

const updatePrescription = wrap(async (req, res) => {
  const prescription = await doctorService.updatePrescription({
    prescriptionId: req.params.id,
    payload: req.body,
    user: req.user
  });

  return send(res, 200, "Prescription updated successfully", prescription);
});

const updateDoctorStatus = wrap(async (req, res) => {
  const doctor = await doctorService.updateDoctorStatus({
    doctorId: req.params.id,
    status: req.body.status,
    user: req.user
  });

  return send(res, 200, "Doctor status updated successfully", doctor);
});

const verifyDoctor = wrap(async (req, res) => {
  const doctor = await doctorService.verifyDoctor({
    doctorId: req.params.id,
    verified: req.body.verified,
    user: req.user
  });

  return send(res, 200, "Doctor verification updated successfully", doctor);
});

module.exports = {
  registerDoctor,
  getDoctorProfile,
  updateDoctorProfile,
  getAllDoctors,
  getDoctorById,
  updateAvailability,
  getDoctorAppointments,
  acceptAppointment,
  rejectAppointment,
  getPatientReports,
  getTelemedicineSession,
  createPrescription,
  getPrescriptionByAppointment,
  updatePrescription,
  updateDoctorStatus,
  verifyDoctor
};
