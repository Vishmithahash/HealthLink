import { getDoctors, updateDoctorStatus, verifyDoctor } from "./doctorService";

export const getAllUsers = async () => {
	const doctors = await getDoctors();
	return doctors;
};

export const approveDoctor = async (doctorId) => {
	await verifyDoctor(doctorId, true);
	return updateDoctorStatus(doctorId, "active");
};

export const rejectDoctor = async (doctorId) => {
	return updateDoctorStatus(doctorId, "suspended");
};
