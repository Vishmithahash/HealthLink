import { authApi, extractData, patientApi } from "./api";
import { getDoctors, updateDoctorStatus, verifyDoctor } from "./doctorService";

export const getAdminHealth = async () => {
	const response = await authApi.get("/admin-only");
	return extractData(response);
};

export const getAllDoctorsForAdmin = async (params = {}) => {
	const [doctors, users] = await Promise.all([
		getDoctors(params),
		authApi.get("/users", { params: { role: "Doctor" } }).then(extractData).catch(() => [])
	]);

	const doctorList = Array.isArray(doctors) ? doctors : [];
	const userList = Array.isArray(users) ? users : [];
	const userById = new Map(userList.map((user) => [String(user.id), user]));

	return doctorList.map((doctor) => {
		const linkedUser = userById.get(String(doctor.userId));
		return {
			...doctor,
			email: doctor.email || linkedUser?.email || "",
			username: doctor.username || linkedUser?.username || ""
		};
	});
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

export const getAdminPatientsForStatusOps = async () => {
	const [patients, users] = await Promise.all([
		patientApi.get("/admin-list").then(extractData).catch(() => []),
		authApi.get("/users", { params: { role: "patient" } }).then(extractData).catch(() => [])
	]);

	const patientList = Array.isArray(patients) ? patients : [];
	const userList = Array.isArray(users) ? users : [];
	const patientByUserId = new Map(patientList.map((patient) => [String(patient.userId), patient]));

	return userList.map((user) => {
		const linkedPatient = patientByUserId.get(String(user.id));
		return {
			id: linkedPatient?._id || "",
			userId: user.id,
			fullName: linkedPatient?.fullName || user.fullName || "",
			email: user.email || "",
			phone: linkedPatient?.phone || user.phoneNumber || "",
			status: linkedPatient?.status || "active"
		};
	}).filter((patient) => Boolean(patient.id));
};
