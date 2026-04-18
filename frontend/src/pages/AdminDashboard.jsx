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
  getAdminPatientsForStatusOps,
  getAdminHealth,
  getAllDoctorsForAdmin,
  setDoctorStatus,
  setDoctorVerification,
  suspendDoctor,
  updatePatientStatusById
} from "../services/adminService";
import { getAdminTransactions, verifyBankSlip } from "../services/paymentService";
import { extractErrorMessage } from "../services/api";
import { notifyCustomBestEffort } from "../services/notificationService";

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
  const [patientSearch, setPatientSearch] = useState("");
  const [patientOptions, setPatientOptions] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [patientStatus, setPatientStatus] = useState("active");
  const [verifySlipPaymentId, setVerifySlipPaymentId] = useState("");
  const [verifySlipAction, setVerifySlipAction] = useState("approve");
  const [transactionStatusFilter, setTransactionStatusFilter] = useState("all");
  const [financeData, setFinanceData] = useState({ transactions: [], summary: null });
  const [financeLoading, setFinanceLoading] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      await getAdminHealth();
      setAdminAccessOk(true);

      const result = await getAllDoctorsForAdmin();
      setDoctors(Array.isArray(result) ? result : []);
      const patients = await getAdminPatientsForStatusOps();
      setPatientOptions(Array.isArray(patients) ? patients : []);
      await loadTransactions("all");
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

  const loadTransactions = async (status = transactionStatusFilter) => {
    setFinanceLoading(true);

    try {
      const data = await getAdminTransactions({
        status: status === "all" ? undefined : status,
        limit: 100
      });

      setFinanceData({
        transactions: Array.isArray(data?.transactions) ? data.transactions : [],
        summary: data?.summary || null
      });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load financial transactions"));
    } finally {
      setFinanceLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // loadDashboard should run once on mount for this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runDoctorAction = async (key, action, okMessage, notificationPayload = null) => {
    setActionBusy(key);
    setError("");
    setSuccess("");

    try {
      await action();

      if (notificationPayload) {
        await notifyCustomBestEffort(notificationPayload);
      }

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

    if (!selectedPatientId) {
      setError("Select a patient first");
      return;
    }

    setActionBusy("patient-status");

    try {
      await updatePatientStatusById(selectedPatientId, patientStatus);

      await notifyCustomBestEffort({
        title: "Patient Account Status Updated",
        message: `Your account status is now ${patientStatus}.`,
        category: "admin",
        recipients: {
          patientEmail: selectedPatient?.email || null,
          patientPhone: selectedPatient?.phone || null,
          patientName: selectedPatient?.fullName || "Patient"
        },
        extraPayload: {
          status: patientStatus,
          patientId: selectedPatientId
        }
      });

      setSuccess(`Patient status updated to ${patientStatus}.`);
      setSelectedPatientId("");
      setPatientSearch("");

      const patients = await getAdminPatientsForStatusOps();
      setPatientOptions(Array.isArray(patients) ? patients : []);
    } catch (err) {
      setError(extractErrorMessage(err, "Patient status update failed"));
    } finally {
      setActionBusy("");
    }
  };

  const handleVerifySlip = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const trimmedPaymentId = verifySlipPaymentId.trim();
    if (!trimmedPaymentId) {
      setError("Payment ID is required for slip verification");
      return;
    }

    setActionBusy("verify-slip");

    try {
      const result = await verifyBankSlip({
        paymentId: trimmedPaymentId,
        action: verifySlipAction
      });

      setSuccess(`Slip ${verifySlipAction}d successfully. Payment status: ${result?.status || "updated"}.`);
      setVerifySlipPaymentId("");
      await loadTransactions();
    } catch (err) {
      setError(extractErrorMessage(err, "Slip verification failed"));
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

  const filteredPatients = useMemo(() => {
    const keyword = patientSearch.trim().toLowerCase();
    if (!keyword) {
      return patientOptions.slice(0, 25);
    }

    return patientOptions
      .filter((patient) => {
        const haystack = [patient.fullName, patient.email, patient.phone, patient.userId]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(0, 25);
  }, [patientOptions, patientSearch]);

  const selectedPatient = useMemo(
    () => patientOptions.find((patient) => String(patient.id) === String(selectedPatientId)) || null,
    [patientOptions, selectedPatientId]
  );

  const slipPaymentOptions = useMemo(() => {
    return (financeData.transactions || []).filter((tx) =>
      tx.status === "pending_verification" || tx.paymentMethod === "bank_transfer"
    );
  }, [financeData.transactions]);

  const metrics = useMemo(() => {
    const total = doctors.length;
    const active = doctors.filter((d) => d.status === "active").length;
    const suspended = doctors.filter((d) => d.status === "suspended").length;
    const verified = doctors.filter((d) => Boolean(d.verified)).length;

    return { total, active, suspended, verified };
  }, [doctors]);

  const isBusy = (key) => actionBusy === key;
  const summary = financeData.summary || {
    totalCount: 0,
    totalAmount: 0,
    succeededCount: 0,
    succeededAmount: 0,
    pendingVerificationCount: 0
  };

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
        <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full">
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
                      onClick={() => runDoctorAction(
                        `approve-${doctor._id}`,
                        () => approveDoctor(doctor._id),
                        "Doctor approved and activated.",
                        {
                          title: "Doctor Account Approved",
                          message: "Your doctor account has been approved and activated.",
                          category: "admin",
                          recipients: {
                            doctorEmail: doctor.email || null,
                            doctorName: doctor.fullName || "Doctor"
                          }
                        }
                      )}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`approve-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Approve
                    </button>
                    <button
                      onClick={() => runDoctorAction(
                        `suspend-${doctor._id}`,
                        () => suspendDoctor(doctor._id),
                        "Doctor suspended.",
                        {
                          title: "Doctor Account Suspended",
                          message: "Your doctor account has been suspended by administration.",
                          category: "admin",
                          recipients: {
                            doctorEmail: doctor.email || null,
                            doctorName: doctor.fullName || "Doctor"
                          }
                        }
                      )}
                      className="bg-rose-600 hover:bg-rose-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`suspend-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />} Suspend
                    </button>
                    <button
                      onClick={() => runDoctorAction(
                        `inactive-${doctor._id}`,
                        () => setDoctorStatus(doctor._id, "inactive"),
                        "Doctor marked as inactive.",
                        {
                          title: "Doctor Account Marked Inactive",
                          message: "Your doctor account has been marked as inactive by administration.",
                          category: "admin",
                          recipients: {
                            doctorEmail: doctor.email || null,
                            doctorName: doctor.fullName || "Doctor"
                          }
                        }
                      )}
                      className="bg-slate-600 hover:bg-slate-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1 disabled:opacity-60"
                      disabled={Boolean(actionBusy)}
                    >
                      {isBusy(`inactive-${doctor._id}`) ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />} Inactive
                    </button>
                    <button
                      onClick={() => runDoctorAction(
                        `toggle-verify-${doctor._id}`,
                        () => setDoctorVerification(doctor._id, !doctor.verified),
                        doctor.verified ? "Doctor verification removed." : "Doctor verified.",
                        {
                          title: doctor.verified ? "Doctor Verification Removed" : "Doctor Verified",
                          message: doctor.verified
                            ? "Your doctor verification badge has been removed by administration."
                            : "Your doctor account has been verified by administration.",
                          category: "admin",
                          recipients: {
                            doctorEmail: doctor.email || null,
                            doctorName: doctor.fullName || "Doctor"
                          }
                        }
                      )}
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
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><UserCog className="h-5 w-5" /> Patient Status Operations</h3>
          <p className="text-sm text-slate-600 mt-1">Search patient by name, email, phone number, or user id and update account status.</p>

          <form className="mt-4 space-y-3" onSubmit={handleUpdatePatientStatus}>
            <div>
              <label htmlFor="patient-search" className="block text-sm font-medium text-slate-700 mb-1">Search patient</label>
              <input
                id="patient-search"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                placeholder="Name, email, phone, user id"
                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>

            <div>
              <label htmlFor="patient-select" className="block text-sm font-medium text-slate-700 mb-1">Patient</label>
              <select
                id="patient-select"
                value={selectedPatientId}
                onChange={(event) => setSelectedPatientId(event.target.value)}
                className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value="">Select patient</option>
                {filteredPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName || "Unknown"} | {patient.email || "no-email"} | {patient.phone || "no-phone"}
                  </option>
                ))}
              </select>
              {selectedPatient ? (
                <p className="text-xs text-slate-500 mt-1">
                  Selected: {selectedPatient.fullName || "Unknown"} | {selectedPatient.email || "no-email"} | current status {selectedPatient.status || "active"}
                </p>
              ) : null}
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
          <p className="text-sm text-indigo-900 mt-1">Review payment activity and verify manual bank slips.</p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-xs text-slate-500 uppercase">Transactions</p>
              <p className="text-xl font-semibold text-slate-900">{summary.totalCount}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-white p-3">
              <p className="text-xs text-slate-500 uppercase">Succeeded Amount</p>
              <p className="text-xl font-semibold text-emerald-800">{Number(summary.succeededAmount || 0).toFixed(2)}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-white p-3">
              <p className="text-xs text-slate-500 uppercase">Pending Verification</p>
              <p className="text-xl font-semibold text-amber-800">{summary.pendingVerificationCount}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <select
              value={transactionStatusFilter}
              onChange={(event) => {
                const next = event.target.value;
                setTransactionStatusFilter(next);
                loadTransactions(next);
              }}
              className="rounded-md border border-slate-300 py-2 px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="pending">Pending</option>
              <option value="pending_verification">Pending Verification</option>
              <option value="failed">Failed</option>
              <option value="rejected">Rejected</option>
            </select>
            <button
              type="button"
              onClick={() => loadTransactions()}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-slate-300 text-slate-700 hover:bg-white text-sm"
            >
              <RefreshCw className={`h-4 w-4 ${financeLoading ? "animate-spin" : ""}`} /> Refresh transactions
            </button>
          </div>

          <div className="mt-4 rounded-lg border border-indigo-200 bg-white overflow-x-auto">
            <table className="min-w-max w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">Appointment</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Amount</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Created</th>
                </tr>
              </thead>
              <tbody>
                {financeLoading ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-slate-500">Loading transactions...</td></tr>
                ) : (financeData.transactions || []).length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No transactions found.</td></tr>
                ) : (financeData.transactions || []).map((tx) => (
                  <tr key={tx._id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-xs">{tx.appointmentId}</td>
                    <td className="px-3 py-2">{tx.paymentMethod}</td>
                    <td className="px-3 py-2">{tx.currency} {Number(tx.amount || 0).toFixed(2)}</td>
                    <td className="px-3 py-2"><span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">{tx.status}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap">{tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleVerifySlip}>
            <div className="rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-sm font-medium text-slate-800 inline-flex items-center gap-2"><WalletCards className="h-4 w-4" /> Manual Slip Verification</p>
              <p className="text-xs text-slate-600 mt-1">Select a deposit/payment id from pending records and approve or reject the uploaded slip.</p>

              <div className="mt-3 space-y-2">
                <div>
                  <label htmlFor="verify-slip-payment-id" className="block text-sm font-medium text-slate-700 mb-1">Deposit ID (Payment ID)</label>
                  <select
                    id="verify-slip-payment-id"
                    value={verifySlipPaymentId}
                    onChange={(event) => setVerifySlipPaymentId(event.target.value)}
                    className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="">Select deposit ID</option>
                    {slipPaymentOptions.map((tx) => (
                      <option key={tx._id} value={tx._id}>
                        {tx._id} | {tx.paymentMethod} | {tx.currency} {Number(tx.amount || 0).toFixed(2)} | {tx.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="verify-slip-action" className="block text-sm font-medium text-slate-700 mb-1">Action</label>
                  <select
                    id="verify-slip-action"
                    value={verifySlipAction}
                    onChange={(event) => setVerifySlipAction(event.target.value)}
                    className="w-full rounded-md border border-slate-300 py-2 px-3 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={Boolean(actionBusy)}
              className="inline-flex items-center gap-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-md px-4 py-2 disabled:opacity-60"
            >
              {isBusy("verify-slip") ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CircleDollarSign className="h-4 w-4" />}
              Verify Slip
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
