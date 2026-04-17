const patientService = require("../services/patientService");

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

const registerPatient = wrap(async (req, res) => {
  const patient = await patientService.registerPatient({
    payload: req.body,
    actor: req.user
  });

  return send(res, 201, "Patient profile created successfully", patient);
});

const getMyProfile = wrap(async (req, res) => {
  const patient = await patientService.getMyProfile({ user: req.user });
  return send(res, 200, "Patient profile fetched successfully", patient);
});

const updateMyProfile = wrap(async (req, res) => {
  const patient = await patientService.updateMyProfile({
    user: req.user,
    payload: req.body
  });

  return send(res, 200, "Patient profile updated successfully", patient);
});

const getPatientById = wrap(async (req, res) => {
  const patient = await patientService.getPatientById({
    id: req.params.id,
    user: req.user
  });

  return send(res, 200, "Patient fetched successfully", patient);
});

const uploadReport = wrap(async (req, res) => {
  const report = await patientService.uploadReport({
    user: req.user,
    file: req.file,
    payload: req.body
  });

  return send(res, 201, "Medical report uploaded successfully", report);
});

const listMyReports = wrap(async (req, res) => {
  const reports = await patientService.listMyReports({ user: req.user });
  return send(res, 200, "Patient reports fetched successfully", reports);
});

const listPatientReportsById = wrap(async (req, res) => {
  const reports = await patientService.listPatientReportsById({
    patientId: req.params.id,
    user: req.user
  });

  return send(res, 200, "Patient reports fetched successfully", reports);
});

const getMyHistory = wrap(async (req, res) => {
  const history = await patientService.getMyHistory({ user: req.user });
  return send(res, 200, "Patient history fetched successfully", history);
});

const getMyPrescriptions = wrap(async (req, res) => {
  const prescriptions = await patientService.getMyPrescriptions({ user: req.user });
  return send(res, 200, "Patient prescriptions fetched successfully", prescriptions);
});

const getPatientPrescriptionsById = wrap(async (req, res) => {
  const prescriptions = await patientService.getPatientPrescriptionsById({
    id: req.params.id,
    user: req.user
  });

  return send(res, 200, "Patient prescriptions fetched successfully", prescriptions);
});

const addPrescriptionForPatient = wrap(async (req, res) => {
  const prescription = await patientService.addPrescriptionForPatient({
    id: req.params.id,
    payload: req.body,
    user: req.user
  });

  return send(res, 201, "Prescription added to patient record", prescription);
});

const updatePatientStatus = wrap(async (req, res) => {
  const patient = await patientService.updatePatientStatus({
    id: req.params.id,
    status: req.body.status,
    user: req.user
  });

  return send(res, 200, "Patient status updated successfully", patient);
});

const listPatientsForAdmin = wrap(async (req, res) => {
  const patients = await patientService.listPatientsForAdmin({ user: req.user });
  return send(res, 200, "Patients fetched successfully", patients);
});

const deleteReport = wrap(async (req, res) => {
  const result = await patientService.removeReport({
    reportId: req.params.reportId,
    user: req.user
  });

  return send(res, 200, "Report deleted successfully", result);
});

module.exports = {
  registerPatient,
  getMyProfile,
  updateMyProfile,
  getPatientById,
  uploadReport,
  listMyReports,
  listPatientReportsById,
  getMyHistory,
  getMyPrescriptions,
  getPatientPrescriptionsById,
  addPrescriptionForPatient,
  updatePatientStatus,
  listPatientsForAdmin,
  deleteReport
};
