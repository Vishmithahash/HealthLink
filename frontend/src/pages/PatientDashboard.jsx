import React, { useEffect, useMemo, useState } from "react";
import { Calendar, FileText, Upload, User, Bot, Stethoscope, CircleX, LoaderCircle, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUserInfo } from "../utils/auth";
import {
  deletePatientReport,
  getPatientProfile,
  getPatientPrescriptions,
  getPatientReports,
  updatePatientProfile,
  uploadMedicalReport
} from "../services/patientService";
import { bookAppointment, cancelAppointment, getDoctors, getPatientAppointments } from "../services/appointmentService";
import { extractErrorMessage } from "../services/api";
import { getOrCreateTelemedicineSession, startTelemedicineSession } from "../services/telemedicineService";
import SymptomChecker from "./SymptomChecker";

const tabs = ["appointments", "book", "profile", "reports", "prescriptions", "symptom-checker"];

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"];
const genders = ["male", "female", "other", "prefer_not_to_say"];

const stringifyList = (value) => (Array.isArray(value) ? value.join(", ") : "");

const parseCsv = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const PatientDashboard = () => {
  const user = getUserInfo();
  const authUserId = String(user?.id || user?.userId || "");
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("appointments");
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [booking, setBooking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingReportId, setDeletingReportId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [joiningAppointmentId, setJoiningAppointmentId] = useState("");
  const [patientIdentifier, setPatientIdentifier] = useState("");

  const [profile, setProfile] = useState({
    fullName: user?.fullName || "",
    dob: "",
    phone: "",
    address: "",
    gender: "prefer_not_to_say",
    bloodGroup: "UNKNOWN",
    allergiesText: "",
    medicalHistoryText: "",
    emergencyContactName: "",
    emergencyContactRelationship: "",
    emergencyContactPhone: ""
  });
  const [appointments, setAppointments] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [reports, setReports] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [file, setFile] = useState(null);
  const [loadingDoctors, setLoadingDoctors] = useState(false);
  const [bookingForm, setBookingForm] = useState({ doctorId: "", specialty: "", scheduledAt: "", durationMinutes: 30, reason: "" });
  const [doctorFilters, setDoctorFilters] = useState({
    name: "",
    specialty: "",
    availability: ""
  });
  const [reportMeta, setReportMeta] = useState({
    documentType: "medical_report",
    title: "",
    notes: "",
    consultationId: ""
  });

  const doctorOptions = useMemo(() => {
    return doctors.map((doctor) => ({
      id: doctor.userId,
      label: `${doctor.fullName} - ${doctor.specialization}`,
      specialty: doctor.specialization
    }));
  }, [doctors]);

  const doctorNameById = useMemo(() => {
    const entries = doctors.flatMap((doctor) => {
      const name = doctor?.fullName || doctor?.name;
      const ids = [doctor?.userId, doctor?._id, doctor?.id].filter(Boolean);
      return ids.map((id) => [String(id), name]);
    });

    return new Map(entries);
  }, [doctors]);

  const resolveDoctorName = (doctorId) => {
    const key = String(doctorId || "");
    return doctorNameById.get(key) || doctorId || "Unknown doctor";
  };

  const appointmentById = useMemo(() => {
    return Object.fromEntries(appointments.map((appointment) => [String(appointment._id), appointment]));
  }, [appointments]);

  const resolveAppointmentSummary = (appointmentId) => {
    if (!appointmentId) {
      return "N/A";
    }

    const matched = appointmentById[String(appointmentId)];
    if (!matched) {
      return `Ref: ${appointmentId}`;
    }

    return `${new Date(matched.scheduledAt).toLocaleString()} (${matched.specialty || "General"})`;
  };

  const specialties = useMemo(() => {
    return [...new Set(doctors.map((doctor) => String(doctor.specialization || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [doctors]);

  const loadDoctors = async (filters = doctorFilters) => {
    setLoadingDoctors(true);

    try {
      const params = {
        name: filters.name || undefined,
        specialty: filters.specialty || undefined,
        availability: filters.availability ? new Date(filters.availability).toISOString() : undefined
      };

      const doctorData = await getDoctors(params).catch(() => []);
      setDoctors(Array.isArray(doctorData?.data) ? doctorData.data : Array.isArray(doctorData) ? doctorData : []);
    } finally {
      setLoadingDoctors(false);
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      const profileData = await getPatientProfile().catch(() => null);

      const patientIdCandidates = [
        authUserId,
        profileData?.userId ? String(profileData.userId) : "",
        profileData?._id ? String(profileData._id) : ""
      ].filter(Boolean);

      const uniqueCandidates = [...new Set(patientIdCandidates)];
      let resolvedPatientId = "";

      let appointmentData = [];
      for (const candidateId of uniqueCandidates) {
        try {
          const result = await getPatientAppointments(candidateId);
          appointmentData = Array.isArray(result) ? result : [];
          resolvedPatientId = candidateId;
          break;
        } catch {
          // Keep trying fallback IDs because services may store patient references differently.
        }
      }

      if (!resolvedPatientId && uniqueCandidates.length > 0) {
        resolvedPatientId = uniqueCandidates[0];
      }

      setPatientIdentifier(resolvedPatientId);

      const [doctorData, reportData, prescriptionData] = await Promise.all([
        getDoctors({}).catch(() => []),
        getPatientReports().catch(() => []),
        getPatientPrescriptions().catch(() => [])
      ]);

      if (profileData) {
        setProfile((prev) => ({
          ...prev,
          fullName: profileData.fullName || prev.fullName,
          dob: profileData.dob ? String(profileData.dob).slice(0, 10) : "",
          phone: profileData.phone || "",
          address: profileData.address || "",
          gender: profileData.gender || "prefer_not_to_say",
          bloodGroup: profileData.bloodGroup || "UNKNOWN",
          allergiesText: stringifyList(profileData.allergies),
          medicalHistoryText: Array.isArray(profileData.medicalHistory)
            ? profileData.medicalHistory
              .map((entry) => entry?.condition)
              .filter(Boolean)
              .join(", ")
            : "",
          emergencyContactName: profileData?.emergencyContact?.name || "",
          emergencyContactRelationship: profileData?.emergencyContact?.relationship || "",
          emergencyContactPhone: profileData?.emergencyContact?.phone || ""
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

  useEffect(() => {
    loadDoctors(doctorFilters);
  }, [doctorFilters.name, doctorFilters.specialty, doctorFilters.availability]);

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
        durationMinutes: Number(bookingForm.durationMinutes || 30),
        reason: bookingForm.reason
      });

      setSuccess("Appointment request submitted successfully.");
      setBookingForm({ doctorId: "", specialty: "", scheduledAt: "", durationMinutes: 30, reason: "" });
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

  const canJoinConsultation = (appointment) => {
    return ["confirmed", "completed"].includes(String(appointment?.status || "").toLowerCase());
  };

  const handleJoinConsultation = async (appointment) => {
    if (!appointment?._id) {
      return;
    }

    if (!canJoinConsultation(appointment)) {
      setError("Consultation can be joined only for confirmed or completed appointments.");
      return;
    }

    setJoiningAppointmentId(appointment._id);
    setError("");
    setSuccess("");

    try {
      const session = await getOrCreateTelemedicineSession({
        appointmentId: appointment._id,
        patientId: appointment.patientId || patientIdentifier || authUserId,
        doctorId: appointment.doctorId
      });

      if (session?._id && session.status !== "completed") {
        await startTelemedicineSession(session._id).catch(() => null);
      }

      navigate(`/telemedicine/${appointment._id}`);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not open telemedicine session"));
    } finally {
      setJoiningAppointmentId("");
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
        dob: profile.dob || null,
        phone: profile.phone,
        address: profile.address,
        gender: profile.gender,
        bloodGroup: profile.bloodGroup,
        allergies: parseCsv(profile.allergiesText),
        medicalHistory: parseCsv(profile.medicalHistoryText).map((condition) => ({ condition })),
        emergencyContact: {
          name: profile.emergencyContactName,
          relationship: profile.emergencyContactRelationship,
          phone: profile.emergencyContactPhone
        }
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
      setError("Please select a report file to upload.");
      return;
    }

    setUploading(true);
    setError("");
    setSuccess("");

    const formData = new FormData();
    formData.append("report", file);
    formData.append("title", reportMeta.title || file.name);
    formData.append("documentType", reportMeta.documentType || "medical_report");
    formData.append("notes", reportMeta.notes || "");
    if (reportMeta.consultationId) {
      formData.append("consultationId", reportMeta.consultationId);
    }

    try {
      await uploadMedicalReport(formData);
      setSuccess("Medical report uploaded.");
      setFile(null);
      setReportMeta({ documentType: "medical_report", title: "", notes: "", consultationId: "" });
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not upload report"));
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteReport = async (reportId) => {
    setDeletingReportId(reportId);
    setError("");
    setSuccess("");

    try {
      await deletePatientReport(reportId);
      setSuccess("Report deleted.");
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete report"));
    } finally {
      setDeletingReportId("");
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
      <div className="rounded-2xl bg-linear-to-r from-teal-700 to-cyan-700 text-white p-6 shadow-lg">
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
                <th className="px-4 py-3">Doctor</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">Schedule</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {appointments.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>No appointments yet.</td>
                </tr>
              ) : (
                appointments.map((appointment) => (
                  <tr key={appointment._id} className="border-t border-slate-100 text-sm">
                    <td className="px-4 py-3">{resolveDoctorName(appointment.doctorId)}</td>
                    <td className="px-4 py-3">{appointment.specialty}</td>
                    <td className="px-4 py-3">{new Date(appointment.scheduledAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{appointment.durationMinutes || 30} min</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs bg-cyan-50 text-cyan-700">{appointment.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => handleJoinConsultation(appointment)}
                          disabled={!canJoinConsultation(appointment) || joiningAppointmentId === appointment._id}
                          className="text-teal-700 hover:text-teal-800 disabled:text-slate-400"
                        >
                          {joiningAppointmentId === appointment._id ? "Joining..." : "Join"}
                        </button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-700">Search doctor by name</label>
              <input
                value={doctorFilters.name}
                onChange={(e) => setDoctorFilters((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="text-sm text-slate-700">Filter by specialization</label>
              <select
                value={doctorFilters.specialty}
                onChange={(e) => setDoctorFilters((prev) => ({ ...prev, specialty: e.target.value }))}
                className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
              >
                <option value="">All specializations</option>
                {specialties.map((specialty) => (
                  <option key={specialty} value={specialty}>{specialty}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="text-sm text-slate-700">Filter by availability</label>
              <input
                type="datetime-local"
                value={doctorFilters.availability}
                onChange={(e) => setDoctorFilters((prev) => ({ ...prev, availability: e.target.value }))}
                className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
              />
            </div>
            <div>
              <button
                type="button"
                onClick={() => setDoctorFilters({ name: "", specialty: "", availability: "" })}
                className="text-sm text-teal-700 hover:text-teal-800"
              >
                Reset filters
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-700">Doctor</label>
            <select
              required
              value={bookingForm.doctorId}
              onChange={(e) => onDoctorChange(e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
            >
              <option value="">{loadingDoctors ? "Loading doctors..." : "Select doctor"}</option>
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
            <label className="text-sm text-slate-700">Duration (minutes)</label>
            <input
              type="number"
              min="10"
              max="180"
              value={bookingForm.durationMinutes}
              onChange={(e) => setBookingForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value || 30) }))}
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
          <div>
            <label className="text-sm text-slate-700">Full name</label>
            <input value={profile.fullName} onChange={(e) => setProfile((prev) => ({ ...prev, fullName: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Date of birth</label>
            <input type="date" value={profile.dob} onChange={(e) => setProfile((prev) => ({ ...prev, dob: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Gender</label>
            <select value={profile.gender} onChange={(e) => setProfile((prev) => ({ ...prev, gender: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2">
              {genders.map((gender) => (
                <option key={gender} value={gender}>{gender.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-700">Blood group</label>
            <select value={profile.bloodGroup} onChange={(e) => setProfile((prev) => ({ ...prev, bloodGroup: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2">
              {bloodGroups.map((group) => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-700">Phone</label>
            <input value={profile.phone} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Address</label>
            <input value={profile.address} onChange={(e) => setProfile((prev) => ({ ...prev, address: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Allergies (comma separated)</label>
            <input value={profile.allergiesText} onChange={(e) => setProfile((prev) => ({ ...prev, allergiesText: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Medical history conditions (comma separated)</label>
            <input value={profile.medicalHistoryText} onChange={(e) => setProfile((prev) => ({ ...prev, medicalHistoryText: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-slate-700">Emergency contact name</label>
              <input value={profile.emergencyContactName} onChange={(e) => setProfile((prev) => ({ ...prev, emergencyContactName: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Emergency contact relationship</label>
              <input value={profile.emergencyContactRelationship} onChange={(e) => setProfile((prev) => ({ ...prev, emergencyContactRelationship: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Emergency contact phone</label>
              <input value={profile.emergencyContactPhone} onChange={(e) => setProfile((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
          </div>
          <button disabled={savingProfile} type="submit" className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{savingProfile ? "Saving..." : "Save Profile"}</button>
        </form>
      ) : null}

      {activeTab === "reports" ? (
        <div className="space-y-4">
          <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-2xl">
            <h2 className="text-lg font-semibold inline-flex items-center gap-2"><Upload className="h-5 w-5 text-teal-700" /> Upload Report</h2>
            <div>
              <label className="text-sm text-slate-700">Report title</label>
              <input value={reportMeta.title} onChange={(e) => setReportMeta((prev) => ({ ...prev, title: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Document type</label>
              <input value={reportMeta.documentType} onChange={(e) => setReportMeta((prev) => ({ ...prev, documentType: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Consultation ID (optional)</label>
              <input value={reportMeta.consultationId} onChange={(e) => setReportMeta((prev) => ({ ...prev, consultationId: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Notes</label>
              <textarea value={reportMeta.notes} onChange={(e) => setReportMeta((prev) => ({ ...prev, notes: e.target.value }))} rows={2} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Report file</label>
              <input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <button disabled={uploading || !file} type="submit" className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{uploading ? "Uploading..." : "Upload"}</button>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h3 className="font-semibold text-slate-800">Uploaded Reports</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {reports.length === 0 ? <li>No reports yet.</li> : reports.map((report) => (
                <li key={report._id} className="border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">{report.title || report.originalName}</p>
                      <p className="text-xs text-slate-500">{report.documentType || "general"} | {report.mimeType || "file"}</p>
                      {report.notes ? <p className="text-xs text-slate-500">Notes: {report.notes}</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="text-slate-500">{new Date(report.createdAt || report.uploadedAt).toLocaleDateString()}</p>
                      <button type="button" onClick={() => handleDeleteReport(report._id)} disabled={deletingReportId === report._id} className="text-rose-600 hover:text-rose-700 inline-flex items-center gap-1">
                        <Trash2 className="h-3.5 w-3.5" /> {deletingReportId === report._id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
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
                <p className="font-medium">Appointment: {resolveAppointmentSummary(item.appointmentId)}</p>
                <p className="text-slate-600">Doctor: {resolveDoctorName(item.doctorId)}</p>
                <p className="text-slate-600">Issued: {item.issuedAt ? new Date(item.issuedAt).toLocaleString() : "N/A"}</p>
                <p className="text-slate-600">Medicines: {(item.medicines || []).map((m) => `${m.name} (${m.dosage})`).join(", ") || "N/A"}</p>
                {(item.medicines || []).length > 0 ? (
                  <p className="text-slate-600">Details: {(item.medicines || []).map((m) => `${m.frequency || "-"} | ${m.duration || "-"} | ${m.notes || "-"}`).join(" ; ")}</p>
                ) : null}
                <p className="text-slate-600">Instructions: {item.instructions || "N/A"}</p>
                <p className="text-slate-600">Follow-up: {item.followUpDate ? new Date(item.followUpDate).toLocaleDateString() : "N/A"}</p>
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
