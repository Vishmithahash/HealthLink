const appointmentService = require("../services/appointmentService");

const send = (res, statusCode, message, data) => {
  return res.status(statusCode).json({ success: true, message, data });
};

const mapError = (next, error) => {
  return next({
    statusCode: error.statusCode || 500,
    message: error.message || "Internal server error",
    details: error.details || null
  });
};

const getDoctors = async (req, res, next) => {
  try {
    const specialization = req.query.specialization || req.query.specialty;

    const doctors = await appointmentService.searchDoctors({
      specialty: specialization,
      name: req.query.name,
      availability: req.query.availability,
      headers: appointmentService.authHeaderFromReq(req)
    });

    return send(res, 200, "Doctors fetched successfully", doctors);
  } catch (error) {
    return mapError(next, error);
  }
};

const setDoctorAvailability = async (req, res, next) => {
  try {
    const availability = await appointmentService.setDoctorAvailability({
      doctorId: req.params.doctorId,
      body: req.body,
      user: req.user
    });

    return send(res, 201, "Doctor availability saved successfully", availability);
  } catch (error) {
    return mapError(next, error);
  }
};

const listDoctorAvailability = async (req, res, next) => {
  try {
    const availability = await appointmentService.listDoctorAvailability({
      doctorId: req.params.doctorId,
      from: req.query.from,
      to: req.query.to
    });

    return send(res, 200, "Doctor availability fetched successfully", availability);
  } catch (error) {
    return mapError(next, error);
  }
};

const createAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.createAppointment({
      body: req.body,
      user: req.user,
      headers: appointmentService.authHeaderFromReq(req)
    });

    return send(res, 201, "Appointment created successfully", appointment);
  } catch (error) {
    return mapError(next, error);
  }
};

const getAppointmentById = async (req, res, next) => {
  try {
    const appointment = await appointmentService.getAppointmentById({
      id: req.params.id,
      user: req.user
    });

    return send(res, 200, "Appointment fetched successfully", appointment);
  } catch (error) {
    return mapError(next, error);
  }
};

const rescheduleAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.rescheduleAppointment({
      id: req.params.id,
      body: req.body,
      user: req.user,
      headers: appointmentService.authHeaderFromReq(req)
    });

    return send(res, 200, "Appointment rescheduled successfully", appointment);
  } catch (error) {
    return mapError(next, error);
  }
};

const cancelAppointment = async (req, res, next) => {
  try {
    const appointment = await appointmentService.cancelAppointment({
      id: req.params.id,
      body: req.body,
      user: req.user
    });

    return send(res, 200, "Appointment cancelled successfully", appointment);
  } catch (error) {
    return mapError(next, error);
  }
};

const listPatientAppointments = async (req, res, next) => {
  try {
    const appointments = await appointmentService.listPatientAppointments({
      patientId: req.params.patientId,
      user: req.user
    });

    return send(res, 200, "Patient appointments fetched successfully", appointments);
  } catch (error) {
    return mapError(next, error);
  }
};

const listDoctorAppointments = async (req, res, next) => {
  try {
    const appointments = await appointmentService.listDoctorAppointments({
      doctorId: req.params.doctorId,
      user: req.user
    });

    return send(res, 200, "Doctor appointments fetched successfully", appointments);
  } catch (error) {
    return mapError(next, error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const appointment = await appointmentService.updateAppointmentStatus({
      id: req.params.id,
      body: req.body,
      user: req.user,
      headers: appointmentService.authHeaderFromReq(req)
    });

    return send(res, 200, "Appointment status updated successfully", appointment);
  } catch (error) {
    return mapError(next, error);
  }
};

module.exports = {
  getDoctors,
  setDoctorAvailability,
  listDoctorAvailability,
  createAppointment,
  getAppointmentById,
  rescheduleAppointment,
  cancelAppointment,
  listPatientAppointments,
  listDoctorAppointments,
  updateStatus
};
