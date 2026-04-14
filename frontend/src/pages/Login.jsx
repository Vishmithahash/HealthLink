import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Activity, ShieldCheck } from "lucide-react";
import { login } from "../services/authService";
import { extractErrorMessage } from "../services/api";
import { getDashboardByRole, setSession } from "../utils/auth";

const Login = () => {
    const [form, setForm] = useState({ username: "", password: "" });
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const result = await login(form);
            setSession({
                user: result.user,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken
            });

            navigate(getDashboardByRole(result.user?.role), { replace: true });
        } catch (err) {
            setError(extractErrorMessage(err, "Login failed"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0f766e_0%,#0f172a_42%,#020617_100%)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center">
                    <Activity className="h-12 w-12 text-teal-300" />
                </div>
                <h2 className="mt-6 text-center text-3xl font-extrabold text-white tracking-tight">
                    HealthLink Portal
                </h2>
                <p className="mt-2 text-center text-sm text-slate-200">
                    Sign in using your system credentials
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white/95 backdrop-blur py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-teal-100">
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                                Username / Email / NIC
                            </label>
                            <div className="mt-1">
                                <input
                                    id="username"
                                    type="text"
                                    required
                                    value={form.username}
                                    onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    type="password"
                                    required
                                    value={form.password}
                                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors disabled:opacity-70"
                            >
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                {loading ? "Signing in..." : "Sign in"}
                            </button>
                        </div>

                        <p className="text-sm text-slate-600 text-center">
                            New to HealthLink? <Link to="/register" className="text-teal-700 hover:text-teal-800 font-medium">Create account</Link>
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;
