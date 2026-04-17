import { authApi, extractData } from "./api";

export const login = async (payload) => {
  const response = await authApi.post("/login", payload);
  return extractData(response);
};

export const register = async (payload) => {
  const response = await authApi.post("/register", payload);
  return extractData(response);
};

export const getMe = async () => {
  const response = await authApi.get("/me");
  return extractData(response);
};

export const logout = async () => {
  await authApi.post("/logout");
};
