import React, { useEffect, useState } from "react";
import { ShieldCheck, UserCheck, UserX, LoaderCircle } from "lucide-react";
import { approveDoctor, getAllUsers, rejectDoctor } from "../services/adminService";
import { extractErrorMessage } from "../services/api";

const AdminDashboard = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadDoctors = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getAllUsers();
      setDoctors(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load doctor records"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const handleApprove = async (id) => {
    setError("");
    setSuccess("");

    try {
      await approveDoctor(id);
      setSuccess("Doctor approved successfully.");
      await loadDoctors();
    } catch (err) {
      setError(extractErrorMessage(err, "Approval failed"));
    }
  };

  const handleReject = async (id) => {
    setError("");
    setSuccess("");

    try {
      await rejectDoctor(id);
      setSuccess("Doctor status updated to suspended.");
      await loadDoctors();
    } catch (err) {
      setError(extractErrorMessage(err, "Reject action failed"));
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 text-white p-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold inline-flex items-center gap-2"><ShieldCheck className="h-7 w-7" /> Admin Operations</h1>
        <p className="mt-1 text-slate-200">Verify doctor registrations and oversee account readiness.</p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      {loading ? <div className="inline-flex items-center gap-2 text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading doctors...</div> : null}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Specialization</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {doctors.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={5}>No doctor records found.</td>
              </tr>
            ) : doctors.map((doctor) => (
              <tr key={doctor._id} className="border-t border-slate-100 text-sm">
                <td className="px-4 py-3">{doctor.fullName}</td>
                <td className="px-4 py-3">{doctor.specialization}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{doctor.status}</span></td>
                <td className="px-4 py-3">{doctor.verified ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => handleApprove(doctor._id)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1"><UserCheck className="h-4 w-4" /> Approve</button>
                    <button onClick={() => handleReject(doctor._id)} className="bg-rose-600 hover:bg-rose-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1"><UserX className="h-4 w-4" /> Suspend</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminDashboard;
