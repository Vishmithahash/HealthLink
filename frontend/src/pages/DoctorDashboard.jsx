import React, { useEffect, useState } from "react";
import { CalendarClock, Check, FilePlus2, LoaderCircle, Settings2, X } from "lucide-react";
import {
  acceptAppointment,
  createPrescription,
  getDoctorAppointments,
  getDoctorProfile,
  rejectAppointment,
  updateAvailability
} from "../services/doctorService";
import { extractErrorMessage } from "../services/api";

const DoctorDashboard = () => {
  const [activeTab, setActiveTab] = useState("requests");
  const [appointments, setAppointments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [availabilitySlots, setAvailabilitySlots] = useState([
    { dayOfWeek: 1, startTime: "09:00", endTime: "17:00", mode: "both" }
  ]);
  const [prescription, setPrescription] = useState({ appointmentId: "", patientId: "", medicineName: "", dosage: "", instructions: "" });
  const [loading, setLoading] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      const [profileData, appointmentData] = await Promise.all([
        getDoctorProfile().catch(() => null),
        getDoctorAppointments().catch(() => [])
      ]);

      setProfile(profileData);
      setAppointments(Array.isArray(appointmentData) ? appointmentData : []);

      if (profileData?.availabilitySlots?.length) {
        setAvailabilitySlots(profileData.availabilitySlots);
      }
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load doctor dashboard"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const pendingAppointments = appointments.filter((item) => item.status === "pending");

  const handleAccept = async (appointmentId) => {
    setError("");
    setSuccess("");

    try {
      await acceptAppointment(appointmentId);
      setSuccess("Appointment accepted.");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not accept appointment"));
    }
  };

  const handleReject = async (appointmentId) => {
    setError("");
    setSuccess("");

    try {
      await rejectAppointment(appointmentId, "Doctor not available");
      setSuccess("Appointment rejected.");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not reject appointment"));
    }
  };

  const handleSaveAvailability = async (event) => {
    event.preventDefault();
    setSavingAvailability(true);
    setError("");
    setSuccess("");

    try {
      await updateAvailability({ availabilitySlots });
      setSuccess("Availability updated.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update availability"));
    } finally {
      setSavingAvailability(false);
    }
  };

  const handleIssuePrescription = async (event) => {
    event.preventDefault();
    setIssuing(true);
    setError("");
    setSuccess("");

    try {
      await createPrescription({
        appointmentId: prescription.appointmentId,
        patientId: prescription.patientId,
        medicines: [{ name: prescription.medicineName, dosage: prescription.dosage }],
        instructions: prescription.instructions
      });
      setSuccess("Prescription issued successfully.");
      setPrescription({ appointmentId: "", patientId: "", medicineName: "", dosage: "", instructions: "" });
    } catch (err) {
      setError(extractErrorMessage(err, "Could not issue prescription"));
    } finally {
      setIssuing(false);
    }
  };

  const updateSlot = (field, value) => {
    setAvailabilitySlots((prev) => {
      const next = [...prev];
      next[0] = { ...next[0], [field]: value };
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-gradient-to-r from-cyan-700 to-teal-700 text-white p-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold">Doctor Workspace</h1>
        <p className="opacity-90 mt-1">Handle appointment requests, availability, and prescriptions.</p>
        {profile ? <p className="mt-2 text-sm opacity-95">Signed in as {profile.fullName} ({profile.specialization})</p> : null}
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-5 text-sm font-medium">
          <button onClick={() => setActiveTab("requests")} className={`py-3 border-b-2 ${activeTab === "requests" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Requests</button>
          <button onClick={() => setActiveTab("prescription")} className={`py-3 border-b-2 ${activeTab === "prescription" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Prescriptions</button>
          <button onClick={() => setActiveTab("availability")} className={`py-3 border-b-2 ${activeTab === "availability" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Availability</button>
        </nav>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      {loading ? <div className="text-slate-600 inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading...</div> : null}

      {activeTab === "requests" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingAppointments.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-slate-500">No pending requests.</td></tr>
              ) : pendingAppointments.map((item) => (
                <tr key={item._id} className="border-t border-slate-100 text-sm">
                  <td className="px-4 py-3">{item.patientId}</td>
                  <td className="px-4 py-3">{item.specialty}</td>
                  <td className="px-4 py-3">{new Date(item.scheduledAt).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-amber-50 text-amber-700">{item.status}</span></td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => handleAccept(item._id)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1"><Check className="h-4 w-4" /> Accept</button>
                      <button onClick={() => handleReject(item._id)} className="bg-rose-600 hover:bg-rose-700 text-white rounded-md px-3 py-1 inline-flex items-center gap-1"><X className="h-4 w-4" /> Reject</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "prescription" ? (
        <form onSubmit={handleIssuePrescription} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-2xl">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><FilePlus2 className="h-5 w-5 text-teal-700" /> Issue Prescription</h2>
          <input required value={prescription.appointmentId} onChange={(e) => setPrescription((prev) => ({ ...prev, appointmentId: e.target.value }))} placeholder="Appointment ID" className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <input required value={prescription.patientId} onChange={(e) => setPrescription((prev) => ({ ...prev, patientId: e.target.value }))} placeholder="Patient ID" className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <input required value={prescription.medicineName} onChange={(e) => setPrescription((prev) => ({ ...prev, medicineName: e.target.value }))} placeholder="Medicine name" className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <input required value={prescription.dosage} onChange={(e) => setPrescription((prev) => ({ ...prev, dosage: e.target.value }))} placeholder="Dosage" className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <textarea value={prescription.instructions} onChange={(e) => setPrescription((prev) => ({ ...prev, instructions: e.target.value }))} placeholder="Instructions" rows={3} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <button disabled={issuing} className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{issuing ? "Issuing..." : "Issue"}</button>
        </form>
      ) : null}

      {activeTab === "availability" ? (
        <form onSubmit={handleSaveAvailability} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-2xl">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><Settings2 className="h-5 w-5 text-teal-700" /> Availability Slot</h2>
          <label className="text-sm text-slate-700">Day of week (0 Sunday - 6 Saturday)</label>
          <input type="number" min="0" max="6" value={availabilitySlots[0]?.dayOfWeek ?? 1} onChange={(e) => updateSlot("dayOfWeek", Number(e.target.value))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <label className="text-sm text-slate-700">Start time</label>
          <input type="time" value={availabilitySlots[0]?.startTime || "09:00"} onChange={(e) => updateSlot("startTime", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <label className="text-sm text-slate-700">End time</label>
          <input type="time" value={availabilitySlots[0]?.endTime || "17:00"} onChange={(e) => updateSlot("endTime", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          <button disabled={savingAvailability} className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2 inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" /> {savingAvailability ? "Saving..." : "Save Availability"}</button>
        </form>
      ) : null}
    </div>
  );
};

export default DoctorDashboard;
