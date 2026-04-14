import { extractData } from "./api";
import axios from "axios";

const paymentApi = axios.create({
	baseURL: "/api/payments",
	headers: {
		"Content-Type": "application/json"
	}
});

export const processPayment = async (payload) => {
	const response = await paymentApi.post("/", payload);
	return extractData(response);
};

export const getPaymentHistory = async () => {
	const response = await paymentApi.get("/my");
	return extractData(response);
};
