import { patientApi, extractData } from "./api";

export const registerPatient = async (payload) => {
	const response = await patientApi.post("/register", payload);
	return extractData(response);
};

export const getPatientProfile = async () => {
	const response = await patientApi.get("/profile");
	return extractData(response);
};

export const updatePatientProfile = async (payload) => {
	const response = await patientApi.put("/profile", payload);
	return extractData(response);
};

export const uploadMedicalReport = async (formData) => {
	const response = await patientApi.post("/reports", formData, {
		headers: { "Content-Type": "multipart/form-data" }
	});
	return extractData(response);
};

export const getPatientReports = async () => {
	const response = await patientApi.get("/reports");
	return extractData(response);
};

export const getPatientHistory = async () => {
	const response = await patientApi.get("/history");
	return extractData(response);
};

export const getPatientPrescriptions = async () => {
	const response = await patientApi.get("/prescriptions");
	return extractData(response);
};
