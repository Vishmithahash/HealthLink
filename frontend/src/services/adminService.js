import { authApi, extractData, patientApi } from "./api";
import { getDoctors, updateDoctorStatus, verifyDoctor } from "./doctorService";

export const getAdminHealth = async () => {
	const response = await authApi.get("/admin-only");
	return extractData(response);
};

export const getAllDoctorsForAdmin = async (params = {}) => {
	const doctors = await getDoctors(params);
	return Array.isArray(doctors) ? doctors : [];
};

export const setDoctorVerification = async (doctorId, verified) => {
	return verifyDoctor(doctorId, verified);
};

export const setDoctorStatus = async (doctorId, status) => {
	return updateDoctorStatus(doctorId, status);
};

export const approveDoctor = async (doctorId) => {
	await setDoctorVerification(doctorId, true);
	return setDoctorStatus(doctorId, "active");
};

export const suspendDoctor = async (doctorId) => {
	return setDoctorStatus(doctorId, "suspended");
};

export const updatePatientStatusById = async (patientId, status) => {
	const response = await patientApi.patch(`/${patientId}/status`, { status });
	return extractData(response);
};
