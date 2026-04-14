import axios from "axios";

const getToken = () => localStorage.getItem("token");

const createClient = (baseURL) => {
    const client = axios.create({
        baseURL,
        headers: {
            "Content-Type": "application/json"
        }
    });

    client.interceptors.request.use((config) => {
        const token = getToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    client.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error?.response?.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("refreshToken");
                localStorage.removeItem("user");
            }

            return Promise.reject(error);
        }
    );

    return client;
};

export const authApi = createClient("/api/auth");
export const appointmentApi = createClient("/api/appointments");
export const doctorApi = createClient("/api/doctors");
export const patientApi = createClient("/api/patients");

export const extractData = (response) => response?.data?.data ?? response?.data ?? null;

export const extractErrorMessage = (error, fallback = "Something went wrong") => {
    return error?.response?.data?.message || error?.message || fallback;
};
