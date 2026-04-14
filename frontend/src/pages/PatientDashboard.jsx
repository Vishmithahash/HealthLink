import React, { useEffect, useMemo, useState } from "react";
import { Calendar, FileText, Upload, User, Bot, Stethoscope, CircleX, LoaderCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { getUserInfo } from "../utils/auth";
import {
  getPatientProfile,
  getPatientPrescriptions,
  getPatientReports,
  updatePatientProfile,
  uploadMedicalReport
} from "../services/patientService";
import { bookAppointment, cancelAppointment, getDoctors, getPatientAppointments } from "../services/appointmentService";
import { extractErrorMessage } from "../services/api";
import SymptomChecker from "./SymptomChecker";

const tabs = ["appointments", "book", "profile", "reports", "prescriptions", "symptom-checker"];

const PatientDashboard = () => {
  const user = getUserInfo();
  const [activeTab, setActiveTab] = useState("appointments");
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [booking, setBooking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [profile, setProfile] = useState({
    fullName: user?.fullName || "",
    phone: "",
    address: "",
    gender: "prefer_not_to_say",
    bloodGroup: "UNKNOWN"
  });
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [reports, setReports] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [file, setFile] = useState(null);
  const [bookingForm, setBookingForm] = useState({ doctorId: "", specialty: "", scheduledAt: "", reason: "" });

  const doctorOptions = useMemo(() => {
    return doctors.map((doctor) => ({
      id: doctor.userId,
      label: `${doctor.fullName} - ${doctor.specialization}`,
      specialty: doctor.specialization
    }));
  }, [doctors]);

  const loadDashboard = async () => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [profileData, appointmentData, doctorData, reportData, prescriptionData] = await Promise.all([
        getPatientProfile().catch(() => null),
        getPatientAppointments(user.id).catch(() => []),
        getDoctors().catch(() => []),
        getPatientReports().catch(() => []),
        getPatientPrescriptions().catch(() => [])
      ]);

      if (profileData) {
        setProfile((prev) => ({
          ...prev,
          fullName: profileData.fullName || prev.fullName,
          phone: profileData.phone || "",
          address: profileData.address || "",
          gender: profileData.gender || "prefer_not_to_say",
          bloodGroup: profileData.bloodGroup || "UNKNOWN"
        }));
      }

      setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
      setDoctors(Array.isArray(doctorData?.data) ? doctorData.data : Array.isArray(doctorData) ? doctorData : []);
      setReports(Array.isArray(reportData) ? reportData : []);
      setPrescriptions(Array.isArray(prescriptionData) ? prescriptionData : []);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not load dashboard data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleBookAppointment = async (event) => {
    event.preventDefault();
    setBooking(true);
    setError("");
    setSuccess("");

    try {
      await bookAppointment({
        doctorId: bookingForm.doctorId,
        specialty: bookingForm.specialty,
        scheduledAt: new Date(bookingForm.scheduledAt).toISOString(),
        reason: bookingForm.reason
      });

      setSuccess("Appointment request submitted successfully.");
      setBookingForm({ doctorId: "", specialty: "", scheduledAt: "", reason: "" });
      await loadDashboard();
      setActiveTab("appointments");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create appointment"));
    } finally {
      setBooking(false);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    setError("");
    setSuccess("");
    try {
      await cancelAppointment(appointmentId, { cancelledReason: "Cancelled by patient" });
      setSuccess("Appointment cancelled.");
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not cancel appointment"));
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setSuccess("");

    try {
      await updatePatientProfile({
        fullName: profile.fullName,
        phone: profile.phone,
        address: profile.address,
        gender: profile.gender,
        bloodGroup: profile.bloodGroup
      });

      setSuccess("Profile updated successfully.");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update profile"));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("report", file);
    formData.append("title", file.name);
    formData.append("documentType", "medical_report");

    try {
      await uploadMedicalReport(formData);
      setSuccess("Medical report uploaded.");
      setFile(null);
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not upload report"));
    } finally {
      setUploading(false);
    }
  };

  const onDoctorChange = (doctorId) => {
    const selected = doctorOptions.find((doctor) => doctor.id === doctorId);
    setBookingForm((prev) => ({
      ...prev,
      doctorId,
      specialty: selected?.specialty || ""
    }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-gradient-to-r from-teal-700 to-cyan-700 text-white p-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold">Patient Command Center</h1>
        <p className="opacity-90 mt-1">Manage appointments, records, and prescriptions from one place.</p>
      </div>

      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="-mb-px flex gap-5 min-w-max pb-1 text-sm font-medium">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`capitalize py-3 border-b-2 transition ${activeTab === tab ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent hover:text-slate-700"}`}
            >
              {tab.replace("-", " ")}
            </button>
          ))}
        </nav>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-600"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading dashboard...</div>
      ) : null}

      {activeTab === "appointments" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Doctor ID</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {appointments.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={5}>No appointments yet.</td>
                </tr>
              ) : (
                appointments.map((appointment) => (
                  <tr key={appointment._id} className="border-t border-slate-100 text-sm">
                    <td className="px-4 py-3">{appointment.doctorId}</td>
                    <td className="px-4 py-3">{appointment.specialty}</td>
                    <td className="px-4 py-3">{new Date(appointment.scheduledAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs bg-cyan-50 text-cyan-700">{appointment.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <Link to={`/telemedicine/${appointment._id}`} className="text-teal-700 hover:text-teal-800">Join</Link>
                        {(appointment.status === "pending" || appointment.status === "confirmed") ? (
                          <button onClick={() => handleCancelAppointment(appointment._id)} className="text-rose-600 hover:text-rose-700 inline-flex items-center gap-1">
                            <CircleX className="h-4 w-4" /> Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "book" ? (
        <form onSubmit={handleBookAppointment} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-2xl">
          <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><Stethoscope className="h-5 w-5 text-teal-700" /> Book Appointment</h2>
          <div>
            <label className="text-sm text-slate-700">Doctor</label>
            <select
              required
              value={bookingForm.doctorId}
              onChange={(e) => onDoctorChange(e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
            >
              <option value="">Select doctor</option>
              {doctorOptions.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>{doctor.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-700">Date and Time</label>
            <input
              required
              type="datetime-local"
              value={bookingForm.scheduledAt}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
              className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-slate-700">Reason</label>
            <textarea
              rows={3}
              value={bookingForm.reason}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, reason: e.target.value }))}
              className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
              placeholder="Briefly describe symptoms"
            />
          </div>
          <button disabled={booking} type="submit" className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">
            {booking ? "Submitting..." : "Submit Appointment"}
          </button>
        </form>
      ) : null}

      {activeTab === "profile" ? (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-2xl">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><User className="h-5 w-5 text-teal-700" /> Patient Profile</h2>
          <input value={profile.fullName} onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Full name" />
          <input value={profile.phone} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Phone" />
          <input value={profile.address} onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Address" />
          <button disabled={savingProfile} type="submit" className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{savingProfile ? "Saving..." : "Save Profile"}</button>
        </form>
      ) : null}

      {activeTab === "reports" ? (
        <div className="space-y-4">
          <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-2xl">
            <h2 className="text-lg font-semibold inline-flex items-center gap-2"><Upload className="h-5 w-5 text-teal-700" /> Upload Report</h2>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button disabled={uploading || !file} type="submit" className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{uploading ? "Uploading..." : "Upload"}</button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-semibold text-slate-800">Uploaded Reports</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {reports.length === 0 ? <li>No reports yet.</li> : reports.map((report) => (
                <li key={report._id} className="flex justify-between border-b border-slate-100 pb-2">
                  <span>{report.title || report.originalName}</span>
                  <span className="text-slate-500">{new Date(report.createdAt || report.uploadedAt).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {activeTab === "prescriptions" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2"><FileText className="h-5 w-5 text-teal-700" /> Prescriptions</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {prescriptions.length === 0 ? <li>No prescriptions yet.</li> : prescriptions.map((item) => (
              <li key={item._id} className="border-b border-slate-100 pb-2">
                <p className="font-medium">Appointment: {item.appointmentId || "N/A"}</p>
                <p className="text-slate-600">Medicines: {(item.medicines || []).map((m) => `${m.name} (${m.dosage})`).join(", ") || "N/A"}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activeTab === "symptom-checker" ? (
        <div>
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2 mb-3"><Bot className="h-5 w-5 text-teal-700" /> AI Symptom Checker</h2>
          <SymptomChecker />
        </div>
      ) : null}

      <div className="text-xs text-slate-500 inline-flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5" /> Live data is loaded from auth, appointment, doctor, and patient services.
      </div>
    </div>
  );
};

export default PatientDashboard;
