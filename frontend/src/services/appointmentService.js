import { appointmentApi, extractData } from "./api";

export const getDoctors = async (params = {}) => {
	const response = await appointmentApi.get("/doctors", { params });
	return extractData(response);
};

export const bookAppointment = async (payload) => {
	const response = await appointmentApi.post("/", payload);
	return extractData(response);
};

export const getAppointmentById = async (appointmentId) => {
	const response = await appointmentApi.get(`/${appointmentId}`);
	return extractData(response);
};

export const getPatientAppointments = async (patientId) => {
	const response = await appointmentApi.get(`/patient/${patientId}`);
	return extractData(response);
};

export const getDoctorAppointments = async (doctorId) => {
	const response = await appointmentApi.get(`/doctor/${doctorId}`);
	return extractData(response);
};

export const rescheduleAppointment = async (id, payload) => {
	const response = await appointmentApi.patch(`/${id}`, payload);
	return extractData(response);
};

export const cancelAppointment = async (id, payload = {}) => {
	const response = await appointmentApi.delete(`/${id}`, { data: payload });
	return extractData(response);
};

export const updateAppointmentStatus = async (id, status) => {
	const response = await appointmentApi.patch(`/${id}/status`, { status });
	return extractData(response);
};
