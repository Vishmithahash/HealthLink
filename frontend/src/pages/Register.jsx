import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Activity, ShieldPlus } from "lucide-react";
import { register } from "../services/authService";
import { extractErrorMessage } from "../services/api";

const specialties = [
  "General Physician",
  "Cardiologist",
  "Dermatologist",
  "Neurologist",
  "Orthopedic",
  "Pediatrician",
  "Gynecologist",
  "Psychiatrist",
  "ENT Specialist",
  "Ophthalmologist"
];

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    fullName: "",
    nic: "",
    phoneNumber: "",
    username: "",
    email: "",
    password: "",
    role: "patient",
    specialty: "General Physician",
    licenseNumber: "",
    qualification: ""
  });

  const isDoctor = useMemo(() => form.role === "Doctor", [form.role]);

  const onChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const authPayload = {
        fullName: form.fullName,
        nic: form.nic,
        phoneNumber: form.phoneNumber,
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role
      };

      if (isDoctor) {
        authPayload.specialty = form.specialty;
        authPayload.licenseNumber = form.licenseNumber;
        authPayload.qualification = form.qualification;
      }

      await register(authPayload);
      navigate("/login", {
        replace: true,
        state: {
          registrationSuccessMessage: "Registration successful. Please log in to continue."
        }
      });
    } catch (err) {
      setError(extractErrorMessage(err, "Registration failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#0f766e_0%,#0f172a_42%,#020617_100%)] py-10 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <Activity className="h-12 w-12 text-teal-300 mx-auto" />
          <h1 className="mt-4 text-3xl font-bold text-white">Create HealthLink Account</h1>
          <p className="mt-2 text-slate-200">Register as Patient, Doctor, or Admin</p>
        </div>

        <div className="bg-white/95 backdrop-blur border border-teal-100 rounded-2xl p-6 sm:p-8 shadow-xl">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Full Name</label>
                <input required value={form.fullName} onChange={(e) => onChange("fullName", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Role</label>
                <select value={form.role} onChange={(e) => onChange("role", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 bg-white">
                  <option value="patient">Patient</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">NIC</label>
                <input required value={form.nic} onChange={(e) => onChange("nic", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Phone Number</label>
                <input required value={form.phoneNumber} onChange={(e) => onChange("phoneNumber", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Username</label>
                <input required value={form.username} onChange={(e) => onChange("username", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <input required type="email" value={form.email} onChange={(e) => onChange("email", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input required type="password" minLength={8} value={form.password} onChange={(e) => onChange("password", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>

            {isDoctor ? (
              <div className="rounded-lg border border-cyan-100 bg-cyan-50/60 p-4 space-y-4">
                <p className="text-sm font-semibold text-cyan-900">Doctor Profile Details</p>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Specialty</label>
                  <select value={form.specialty} onChange={(e) => onChange("specialty", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 bg-white">
                    {specialties.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">License Number</label>
                    <input required value={form.licenseNumber} onChange={(e) => onChange("licenseNumber", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Qualification (Optional)</label>
                    <input value={form.qualification} onChange={(e) => onChange("qualification", e.target.value)} className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            <button disabled={loading} type="submit" className="w-full py-2.5 px-4 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-semibold inline-flex justify-center items-center gap-2 disabled:opacity-70">
              <ShieldPlus className="h-4 w-4" />
              {loading ? "Creating account..." : "Create Account"}
            </button>
          </form>

          <p className="text-sm text-slate-600 mt-4 text-center">
            Already have an account? <Link to="/login" className="text-teal-700 hover:text-teal-800 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
