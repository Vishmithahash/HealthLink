import React, { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  Filter,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserX,
  WalletCards
} from "lucide-react";
import {
  approveDoctor,
  getAdminHealth,
  getAllDoctorsForAdmin,
  setDoctorStatus,
  setDoctorVerification,
  suspendDoctor,
  updatePatientStatusById
} from "../services/adminService";
import { extractErrorMessage } from "../services/api";

const AdminDashboard = () => {
  const [doctors, setDoctors] = useState([]);
  const [adminAccessOk, setAdminAccessOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [verifyFilter, setVerifyFilter] = useState("all");
  const [patientId, setPatientId] = useState("");
  const [patientStatus, setPatientStatus] = useState("active");

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      await getAdminHealth();
      setAdminAccessOk(true);

      const result = await getAllDoctorsForAdmin();
      setDoctors(Array.isArray(result) ? result : []);
    } catch (err) {
      setAdminAccessOk(false);
      setError(extractErrorMessage(err, "Could not load admin operations"));
    } finally {
      setLoading(false);
    }
  };

  const loadDoctors = async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getAllDoctorsForAdmin();
      setDoctors(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load doctor records"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const runDoctorAction = async (key, action, okMessage) => {
    setActionBusy(key);
    setError("");
    setSuccess("");

    try {
      await action();
      setSuccess(okMessage);
      await loadDoctors();
    } catch (err) {
      setError(extractErrorMessage(err, "Admin action failed"));
    } finally {
      setActionBusy("");
    }
  };

  const handleUpdatePatientStatus = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmedPatientId = patientId.trim();
    if (!trimmedPatientId) {
      setError("Patient ID is required");
      return;
    }

    setActionBusy("patient-status");

    try {
      await updatePatientStatusById(trimmedPatientId, patientStatus);
      setSuccess(`Patient status updated to ${patientStatus}.`);
      setPatientId("");
    } catch (err) {
      setError(extractErrorMessage(err, "Patient status update failed"));
    } finally {
      setActionBusy("");
    }
  };

  const filteredDoctors = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return doctors.filter((doctor) => {
      const statusOk = statusFilter === "all" || doctor.status === statusFilter;
      const verifyOk =
        verifyFilter === "all" ||
        (verifyFilter === "verified" && doctor.verified) ||
        (verifyFilter === "unverified" && !doctor.verified);

      const text = [doctor.fullName, doctor.email, doctor.specialization]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const queryOk = !keyword || text.includes(keyword);

      return statusOk && verifyOk && queryOk;
    });
  }, [doctors, query, statusFilter, verifyFilter]);

  const metrics = useMemo(() => {
    const total = doctors.length;
    const active = doctors.filter((d) => d.status === "active").length;
    const suspended = doctors.filter((d) => d.status === "suspended").length;
    const verified = doctors.filter((d) => Boolean(d.verified)).length;

    return { total, active, suspended, verified };
  }, [doctors]);

  const isBusy = (key) => actionBusy === key;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-linear-to-r from-slate-800 to-slate-700 text-white p-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold inline-flex items-center gap-2"><ShieldCheck className="h-7 w-7" /> Admin Operations Center</h1>
        <p className="mt-1 text-slate-200">Manage doctor verification, account status controls, and platform operations from one place.</p>
        <p className="mt-2 text-xs text-slate-300">Auth state: {adminAccessOk ? "Admin access confirmed" : "Admin access not confirmed"}</p>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      {loading ? <div className="inline-flex items-center gap-2 text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading admin dashboard...</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Doctors</p>
          <p className="text-2xl font-semibold text-slate-900 mt-1">{metrics.total}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-xs text-emerald-700 uppercase tracking-wide">Active</p>
          <p className="text-2xl font-semibold text-emerald-900 mt-1">{metrics.active}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <p className="text-xs text-amber-700 uppercase tracking-wide">Verified</p>
          <p className="text-2xl font-semibold text-amber-900 mt-1">{metrics.verified}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <p className="text-xs text-rose-700 uppercase tracking-wide">Suspended</p>
          <p className="text-2xl font-semibold text-rose-900 mt-1">{metrics.suspended}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><Filter className="h-5 w-5" /> Doctor Moderation Filters</h2>
          <button
            onClick={loadDoctors}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="doctor-search" className="block text-sm font-medium text-slate-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="doctor-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, email, specialization"
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-slate-700 mb-1">Status</label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          <div>
            <label htmlFor="verify-filter" className="block text-sm font-medium text-slate-700 mb-1">Verification</label>
            <select
              id="verify-filter"
              value={verifyFilter}
              onChange={(event) => setVerifyFilter(event.target.value)}
              className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="all">All</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3">Doctor</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Specialization</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Verified</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredDoctors.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={6}>No doctor records found for selected filters.</td>
              </tr>
            ) : filteredDoctors.map((doctor) => (
              <tr key={doctor._id} className="border-t border-slate-100 text-sm">
                <td className="px-4 py-3 font-medium text-slate-800">{doctor.fullName || "Unknown"}</td>
                <td className="px-4 py-3 text-slate-600">{doctor.email || "-"}</td>
                <td className="px-4 py-3">{doctor.specialization || "General"}</td>
                <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{doctor.status || "unknown"}</span></td>
                <td className="px-4 py-3">
                  {doctor.verified ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700"><BadgeCheck className="h-4 w-4" /> Verified</span>
                  ) : (
                    <span className="text-amber-700">Pending</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2 flex-wrap justify-end">
                    <button
                      onClick={() => runDoctorAction(`approve-${doctor._id}`, () => approveDoctor(doctor._id), "Doctor approved and activated.")}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`approve-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Approve
                    </button>
                    <button
                      onClick={() => runDoctorAction(`suspend-${doctor._id}`, () => suspendDoctor(doctor._id), "Doctor suspended.")}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`suspend-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} Suspend
                    </button>
                    <button
                      onClick={() => runDoctorAction(`inactive-${doctor._id}`, () => setDoctorStatus(doctor._id, "inactive"), "Doctor marked as inactive.")}
                      className="bg-slate-600 hover:bg-slate-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`inactive-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />} Inactive
                    </button>
                    <button
                      onClick={() => runDoctorAction(`toggle-verify-${doctor._id}`, () => setDoctorVerification(doctor._id, !doctor.verified), doctor.verified ? "Doctor verification removed." : "Doctor verified.")}
                      className="bg-amber-600 hover:bg-amber-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`toggle-verify-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} {doctor.verified ? "Unverify" : "Verify"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><UserCog className="h-5 w-5" /> Patient Status Operations</h3>
          <p className="text-sm text-slate-600 mt-1">Use an existing Patient ID to update account state.</p>

          <form className="mt-4 space-y-3" onSubmit={handleUpdatePatientStatus}>
            <div>
              <label htmlFor="patient-id" className="block text-sm font-medium text-slate-700 mb-1">Patient ID</label>
              <input
                id="patient-id"
                value={patientId}
                onChange={(event) => setPatientId(event.target.value)}
                placeholder="Enter patient ID"
                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div>
              <label htmlFor="patient-status" className="block text-sm font-medium text-slate-700 mb-1">New status</label>
              <select
                id="patient-status"
                value={patientStatus}
                onChange={(event) => setPatientStatus(event.target.value)}
                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={Boolean(actionBusy)}
              className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-950 text-white rounded-md px-4 py-2 disabled:opacity-60"
            >
              {isBusy("patient-status") ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              Update Patient Status
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-indigo-950 inline-flex items-center gap-2"><CircleDollarSign className="h-5 w-5" /> Financial Transactions</h3>
          <p className="text-sm text-indigo-900 mt-1">Payment controls are intentionally left as placeholder for the upcoming backend integration.</p>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-800 inline-flex items-center gap-2"><WalletCards className="h-4 w-4" /> Settlement Dashboard</p>
              <p className="text-xs text-slate-600 mt-1">Coming soon: payout queue, failed transaction retries, and ledger export.</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-800">Refund and Dispute Center</p>
              <p className="text-xs text-slate-600 mt-1">Coming soon: refund approval workflow, dispute tracking, and audit history.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
