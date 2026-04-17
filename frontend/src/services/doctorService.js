import { doctorApi, extractData } from "./api";

export const registerDoctor = async (payload) => {
	const response = await doctorApi.post("/register", payload);
	return extractData(response);
};

export const getDoctors = async (params = {}) => {
	const response = await doctorApi.get("/", { params });
	return extractData(response);
};

export const getDoctorById = async (id) => {
	const response = await doctorApi.get(`/${id}`);
	return extractData(response);
};

export const getDoctorProfile = async () => {
	const response = await doctorApi.get("/profile");
	return extractData(response);
};

export const updateDoctorProfile = async (payload) => {
	const response = await doctorApi.put("/profile", payload);
	return extractData(response);
};

export const updateAvailability = async (payload) => {
	const response = await doctorApi.put("/availability", payload);
	return extractData(response);
};

export const getDoctorAppointments = async () => {
	const response = await doctorApi.get("/appointments");
	return extractData(response);
};

export const acceptAppointment = async (appointmentId) => {
	const response = await doctorApi.patch(`/appointments/${appointmentId}/accept`);
	return extractData(response);
};

export const rejectAppointment = async (appointmentId, reason = "") => {
	const response = await doctorApi.patch(`/appointments/${appointmentId}/reject`, { reason });
	return extractData(response);
};

export const createPrescription = async (payload) => {
	const response = await doctorApi.post("/prescriptions", payload);
	return extractData(response);
};

export const getPatientReports = async (patientId) => {
	const response = await doctorApi.get(`/patient-reports/${patientId}`);
	return extractData(response);
};

export const verifyDoctor = async (doctorId, verified = true) => {
	const response = await doctorApi.patch(`/${doctorId}/verify`, { verified });
	return extractData(response);
};

export const updateDoctorStatus = async (doctorId, status) => {
	const response = await doctorApi.patch(`/${doctorId}/status`, { status });
	return extractData(response);
};
