import { extractData, paymentApi } from "./api";

export const createStripeIntent = async (payload) => {
	const response = await paymentApi.post("/create-intent", payload);
	return extractData(response);
};

export const verifyStripePayment = async (payload) => {
	const response = await paymentApi.post("/verify", payload);
	return extractData(response);
};

export const sendStripeOtp = async (payload) => {
	const response = await paymentApi.post("/send-otp", payload);
	return extractData(response);
};

export const uploadBankSlip = async (formData) => {
	const response = await paymentApi.post("/upload-slip", formData, {
		headers: {
			"Content-Type": "multipart/form-data"
		}
	});
	return extractData(response);
};

export const verifyBankSlip = async (payload) => {
	const response = await paymentApi.post("/verify-slip", payload);
	return extractData(response);
};

export const getPaymentsByAppointment = async (appointmentId) => {
	const response = await paymentApi.get(`/appointment/${appointmentId}`);
	return extractData(response);
};

export const getPaymentStatus = async (paymentId) => {
	const response = await paymentApi.get(`/status/${paymentId}`);
	return extractData(response);
};

export const getPaymentById = async (paymentId) => {
	const response = await paymentApi.get(`/${paymentId}`);
	return extractData(response);
};

export const getAdminTransactions = async (params = {}) => {
	const response = await paymentApi.get("/admin/transactions", { params });
	return extractData(response);
};
