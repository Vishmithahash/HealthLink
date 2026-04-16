import { aiApi, extractData } from "./api";

export const analyzeSymptoms = async (payload) => {
  const response = await aiApi.post("/symptoms/analyze", payload);
  return extractData(response);
};

export const getSymptomHistory = async (params = {}) => {
  const response = await aiApi.get("/symptoms/history", { params });
  return extractData(response);
};

export const getSymptomRecordById = async (id) => {
  const response = await aiApi.get(`/symptoms/${id}`);
  return extractData(response);
};
