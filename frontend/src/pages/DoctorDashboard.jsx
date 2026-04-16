import React, { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, FilePlus2, LoaderCircle, Settings2, UserRound, Video, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  getPatientById
} from "../services/patientService";
import {
  acceptAppointment,
  createPrescription,
  getDoctorAppointments,
  getDoctorProfile,
  registerDoctor,
  rejectAppointment,
  updateDoctorProfile,
  updateAvailability
} from "../services/doctorService";
import { getPaymentsByAppointment } from "../services/paymentService";
import { extractErrorMessage } from "../services/api";
import { getUserInfo } from "../utils/auth";
import { getOrCreateTelemedicineSession, startTelemedicineSession } from "../services/telemedicineService";

const defaultSlot = {
  dayOfWeek: 1,
  startTime: "09:00",
  endTime: "17:00",
  mode: "both"
};

const defaultUnavailablePeriod = {
  from: "",
  to: "",
  reason: ""
};

const defaultProfileForm = {
  fullName: "",
  specialization: "",
  licenseNumber: "",
  qualification: "",
  experienceYears: 0,
  consultationFee: 0,
  bio: "",
  workingHoursStart: "09:00",
  workingHoursEnd: "17:00",
  workingHoursTimezone: "UTC"
};

const defaultPrescription = {
  appointmentId: "",
  patientId: "",
  patientName: "",
  medicines: [{ name: "", dosage: "", frequency: "", duration: "", notes: "" }],
  instructions: "",
  followUpDate: ""
};

const toDateTimeLocal = (value) => {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const tzOffset = parsed.getTimezoneOffset();
  const local = new Date(parsed.getTime() - tzOffset * 60000);
  return local.toISOString().slice(0, 16);
};

const fromDateTimeLocal = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
};

const consultationsWithPayment = (appointments, paymentByAppointment) => {
  return (Array.isArray(appointments) ? appointments : []).map((appointment) => ({
    appointment,
    payment: paymentByAppointment[String(appointment?._id || "")] || null
  }));
};

const DoctorDashboard = () => {
  const user = getUserInfo();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("requests");
  const [appointments, setAppointments] = useState([]);
  const [profile, setProfile] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [profileForm, setProfileForm] = useState(defaultProfileForm);
  const [availabilitySlots, setAvailabilitySlots] = useState([defaultSlot]);
  const [unavailablePeriods, setUnavailablePeriods] = useState([defaultUnavailablePeriod]);
  const [prescription, setPrescription] = useState(defaultPrescription);
  const [loading, setLoading] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [joiningAppointmentId, setJoiningAppointmentId] = useState("");
  const [patientNameById, setPatientNameById] = useState({});
  const [paymentByAppointment, setPaymentByAppointment] = useState({});
  const [paymentLoading, setPaymentLoading] = useState(false);

  const appointmentById = useMemo(
    () => Object.fromEntries(appointments.map((item) => [String(item._id), item])),
    [appointments]
  );

  const resolvePatientName = (patientId) => {
    const key = String(patientId || "");
    return patientNameById[key] || patientId || "Unknown patient";
  };

  const loadPatientNames = async (appointmentList) => {
    const ids = [...new Set((Array.isArray(appointmentList) ? appointmentList : [])
      .map((item) => item?.patientId)
      .filter(Boolean)
      .map((id) => String(id)))];

    if (ids.length === 0) {
      setPatientNameById({});
      return;
    }

    const entries = await Promise.all(ids.map(async (id) => {
      try {
        const patient = await getPatientById(id);
        const name = patient?.fullName || patient?.name || id;
        return [id, name];
      } catch {
        return [id, id];
      }
    }));

    setPatientNameById(Object.fromEntries(entries));
  };

  const loadPaymentsForAppointments = async (appointmentList) => {
    setPaymentLoading(true);

    try {
      const entries = await Promise.all((Array.isArray(appointmentList) ? appointmentList : []).map(async (appointment) => {
        const appointmentId = String(appointment?._id || "");
        if (!appointmentId) {
          return [appointmentId, null];
        }

        try {
          const payments = await getPaymentsByAppointment(appointmentId);
          const latest = Array.isArray(payments) && payments.length > 0 ? payments[0] : null;
          return [appointmentId, latest];
        } catch {
          return [appointmentId, null];
        }
      }));

      setPaymentByAppointment(Object.fromEntries(entries));
    } finally {
      setPaymentLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    setError("");

    try {
      let profileData = null;

      try {
        profileData = await getDoctorProfile();
        setProfileMissing(false);
      } catch (profileError) {
        if (profileError?.response?.status === 404) {
          setProfileMissing(true);
          setProfile(null);
          setAppointments([]);
          setPatientNameById({});
          setProfileForm((prev) => ({
            ...prev,
            fullName: user?.fullName || prev.fullName || "",
            specialization: user?.specialty || prev.specialization || ""
          }));
          setAvailabilitySlots([defaultSlot]);
          setUnavailablePeriods([defaultUnavailablePeriod]);
          return;
        }

        throw profileError;
      }

      let appointmentData = [];
      try {
        appointmentData = await getDoctorAppointments();
      } catch (appointmentError) {
        if (appointmentError?.response?.status === 404) {
          appointmentData = [];
        } else {
          throw appointmentError;
        }
      }

      const normalizedAppointments = Array.isArray(appointmentData) ? appointmentData : [];

      setProfile(profileData);
      setAppointments(normalizedAppointments);
      await loadPatientNames(normalizedAppointments);
      await loadPaymentsForAppointments(normalizedAppointments);

      setProfileForm({
        fullName: profileData?.fullName || "",
        specialization: profileData?.specialization || "",
        licenseNumber: profileData?.licenseNumber || "",
        qualification: profileData?.qualification || "",
        experienceYears: Number(profileData?.experienceYears || 0),
        consultationFee: Number(profileData?.consultationFee || 0),
        bio: profileData?.bio || "",
        workingHoursStart: profileData?.workingHours?.start || "09:00",
        workingHoursEnd: profileData?.workingHours?.end || "17:00",
        workingHoursTimezone: profileData?.workingHours?.timezone || "UTC"
      });

      const nextSlots = profileData?.availabilitySlots?.length
        ? profileData.availabilitySlots
        : [defaultSlot];
      setAvailabilitySlots(nextSlots);

      const nextUnavailable = profileData?.unavailablePeriods?.length
        ? profileData.unavailablePeriods.map((period) => ({
          from: toDateTimeLocal(period.from),
          to: toDateTimeLocal(period.to),
          reason: period.reason || ""
        }))
        : [defaultUnavailablePeriod];

      setUnavailablePeriods(nextUnavailable);
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
  const consultationAppointments = appointments.filter((item) => ["confirmed", "completed"].includes(String(item.status || "").toLowerCase()));
  const doctorPayments = useMemo(() => {
    return consultationsWithPayment(consultationAppointments, paymentByAppointment);
  }, [consultationAppointments, paymentByAppointment]);

  const totalReceived = useMemo(() => {
    return doctorPayments
      .filter((item) => String(item.payment?.status || "").toLowerCase() === "succeeded")
      .reduce((sum, item) => sum + Number(item.payment?.amount || 0), 0);
  }, [doctorPayments]);

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setSuccess("");

    try {
      if (profileMissing) {
        await registerDoctor({
          userId: user?.id,
          fullName: profileForm.fullName,
          specialization: profileForm.specialization,
          licenseNumber: profileForm.licenseNumber,
          qualification: profileForm.qualification,
          experienceYears: Number(profileForm.experienceYears || 0),
          consultationFee: Number(profileForm.consultationFee || 0),
          bio: profileForm.bio,
          workingHours: {
            start: profileForm.workingHoursStart,
            end: profileForm.workingHoursEnd,
            timezone: profileForm.workingHoursTimezone
          }
        });

        setSuccess("Doctor profile created.");
        setProfileMissing(false);
        await loadData();
        return;
      }

      await updateDoctorProfile({
        fullName: profileForm.fullName,
        specialization: profileForm.specialization,
        qualification: profileForm.qualification,
        experienceYears: Number(profileForm.experienceYears || 0),
        consultationFee: Number(profileForm.consultationFee || 0),
        bio: profileForm.bio,
        workingHours: {
          start: profileForm.workingHoursStart,
          end: profileForm.workingHoursEnd,
          timezone: profileForm.workingHoursTimezone
        }
      });

      setSuccess("Profile updated.");
      await loadData();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not update profile"));
    } finally {
      setSavingProfile(false);
    }
  };

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
      const validSlots = availabilitySlots.filter((slot) => slot.startTime && slot.endTime);
      const validUnavailablePeriods = unavailablePeriods
        .filter((period) => period.from && period.to)
        .map((period) => ({
          from: fromDateTimeLocal(period.from),
          to: fromDateTimeLocal(period.to),
          reason: period.reason || ""
        }))
        .filter((period) => period.from && period.to);

      await updateAvailability({
        availabilitySlots: validSlots,
        unavailablePeriods: validUnavailablePeriods
      });

      setSuccess("Availability updated.");
      await loadData();
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
      const resolvedPatientId = prescription.patientId || appointmentById[String(prescription.appointmentId)]?.patientId || "";

      await createPrescription({
        appointmentId: prescription.appointmentId,
        patientId: resolvedPatientId,
        medicines: prescription.medicines
          .filter((medicine) => medicine.name && medicine.dosage)
          .map((medicine) => ({
            name: medicine.name,
            dosage: medicine.dosage,
            frequency: medicine.frequency || "",
            duration: medicine.duration || "",
            notes: medicine.notes || ""
          })),
        instructions: prescription.instructions,
        followUpDate: fromDateTimeLocal(prescription.followUpDate)
      });
      setSuccess("Prescription issued successfully.");
      setPrescription(defaultPrescription);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not issue prescription"));
    } finally {
      setIssuing(false);
    }
  };

  const handleJoinConsultation = async (appointment) => {
    if (!appointment?._id) {
      return;
    }

    setJoiningAppointmentId(appointment._id);
    setError("");
    setSuccess("");

    try {
      const session = await getOrCreateTelemedicineSession({
        appointmentId: appointment._id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId || profile?.userId || user?.id
      });

      if (session?._id && session.status !== "completed") {
        await startTelemedicineSession(session._id).catch(() => null);
      }

      navigate(`/telemedicine/${appointment._id}`);
    } catch (err) {
      setError(extractErrorMessage(err, "Could not open consultation room"));
    } finally {
      setJoiningAppointmentId("");
    }
  };

  const updateSlot = (index, field, value) => {
    setAvailabilitySlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addSlot = () => {
    setAvailabilitySlots((prev) => [...prev, { ...defaultSlot }]);
  };

  const removeSlot = (index) => {
    setAvailabilitySlots((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateUnavailablePeriod = (index, field, value) => {
    setUnavailablePeriods((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addUnavailablePeriod = () => {
    setUnavailablePeriods((prev) => [...prev, { ...defaultUnavailablePeriod }]);
  };

  const removeUnavailablePeriod = (index) => {
    setUnavailablePeriods((prev) => {
      if (prev.length === 1) {
        return prev;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleAppointmentSelect = (appointmentId) => {
    const appointment = appointmentById[String(appointmentId)];
    setPrescription((prev) => ({
      ...prev,
      appointmentId,
      patientId: appointment?.patientId || "",
      patientName: appointment ? resolvePatientName(appointment.patientId) : ""
    }));
  };

  const updateMedicine = (index, field, value) => {
    setPrescription((prev) => {
      const nextMedicines = [...prev.medicines];
      nextMedicines[index] = { ...nextMedicines[index], [field]: value };
      return { ...prev, medicines: nextMedicines };
    });
  };

  const addMedicine = () => {
    setPrescription((prev) => ({
      ...prev,
      medicines: [...prev.medicines, { name: "", dosage: "", frequency: "", duration: "", notes: "" }]
    }));
  };

  const removeMedicine = (index) => {
    setPrescription((prev) => {
      if (prev.medicines.length === 1) {
        return prev;
      }

      return {
        ...prev,
        medicines: prev.medicines.filter((_, i) => i !== index)
      };
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-2xl bg-linear-to-r from-cyan-700 to-teal-700 text-white p-6 shadow-lg">
        <h1 className="text-2xl md:text-3xl font-bold">Doctor Workspace</h1>
        <p className="opacity-90 mt-1">Handle appointment requests, availability, and prescriptions.</p>
        {profile ? <p className="mt-2 text-sm opacity-95">Signed in as {profile.fullName} ({profile.specialization})</p> : null}
      </div>

      {profileMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm">
          Doctor profile is missing for this account. Open the Profile tab and create it to enable appointments and consultations.
        </div>
      ) : null}

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-5 text-sm font-medium">
          <button onClick={() => setActiveTab("requests")} className={`py-3 border-b-2 ${activeTab === "requests" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Requests</button>
          <button onClick={() => setActiveTab("consultations")} className={`py-3 border-b-2 ${activeTab === "consultations" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Consultations</button>
          <button onClick={() => setActiveTab("profile")} className={`py-3 border-b-2 ${activeTab === "profile" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Profile</button>
          <button onClick={() => setActiveTab("prescription")} className={`py-3 border-b-2 ${activeTab === "prescription" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Prescriptions</button>
          <button onClick={() => setActiveTab("payments")} className={`py-3 border-b-2 ${activeTab === "payments" ? "text-teal-700 border-teal-700" : "text-slate-500 border-transparent"}`}>Payments</button>
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
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingAppointments.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No pending requests.</td></tr>
              ) : pendingAppointments.map((item) => (
                <tr key={item._id} className="border-t border-slate-100 text-sm">
                  <td className="px-4 py-3">{resolvePatientName(item.patientId)}</td>
                  <td className="px-4 py-3">{item.specialty}</td>
                  <td className="px-4 py-3">{new Date(item.scheduledAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.durationMinutes || 30} min</td>
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

      {activeTab === "consultations" ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3">Patient</th>
                <th className="px-4 py-3">Specialty</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {consultationAppointments.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No consultations available yet.</td></tr>
              ) : consultationAppointments.map((item) => (
                <tr key={item._id} className="border-t border-slate-100 text-sm">
                  <td className="px-4 py-3">{resolvePatientName(item.patientId)}</td>
                  <td className="px-4 py-3">{item.specialty}</td>
                  <td className="px-4 py-3">{new Date(item.scheduledAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.durationMinutes || 30} min</td>
                  <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-cyan-50 text-cyan-700">{item.status}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleJoinConsultation(item)}
                      disabled={joiningAppointmentId === item._id}
                      className="bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white rounded-md px-3 py-1 inline-flex items-center gap-1"
                    >
                      <Video className="h-4 w-4" /> {joiningAppointmentId === item._id ? "Joining..." : "Join Call"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {activeTab === "profile" ? (
        <form onSubmit={handleSaveProfile} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-3xl">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><UserRound className="h-5 w-5 text-teal-700" /> Doctor Profile</h2>
          <div>
            <label className="text-sm text-slate-700">Full name</label>
            <input required value={profileForm.fullName} onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Specialization</label>
            <input required value={profileForm.specialization} onChange={(e) => setProfileForm((prev) => ({ ...prev, specialization: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">License number</label>
            <input required value={profileForm.licenseNumber} onChange={(e) => setProfileForm((prev) => ({ ...prev, licenseNumber: e.target.value }))} disabled={!profileMissing} className="w-full border border-slate-300 rounded-md px-3 py-2 disabled:bg-slate-100 disabled:text-slate-500" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Qualification</label>
            <input value={profileForm.qualification} onChange={(e) => setProfileForm((prev) => ({ ...prev, qualification: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-700">Experience (years)</label>
              <input type="number" min="0" value={profileForm.experienceYears} onChange={(e) => setProfileForm((prev) => ({ ...prev, experienceYears: Number(e.target.value || 0) }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Consultation fee</label>
              <input type="number" min="0" value={profileForm.consultationFee} onChange={(e) => setProfileForm((prev) => ({ ...prev, consultationFee: Number(e.target.value || 0) }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-slate-700">Working hours start</label>
              <input type="time" value={profileForm.workingHoursStart} onChange={(e) => setProfileForm((prev) => ({ ...prev, workingHoursStart: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Working hours end</label>
              <input type="time" value={profileForm.workingHoursEnd} onChange={(e) => setProfileForm((prev) => ({ ...prev, workingHoursEnd: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Timezone</label>
              <input value={profileForm.workingHoursTimezone} onChange={(e) => setProfileForm((prev) => ({ ...prev, workingHoursTimezone: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-700">Professional bio</label>
            <textarea value={profileForm.bio} onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))} rows={4} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <button disabled={savingProfile} className="bg-teal-700 hover:bg-teal-800 disabled:bg-slate-400 text-white rounded-md px-4 py-2">{savingProfile ? "Saving..." : profileMissing ? "Create Profile" : "Save Profile"}</button>
        </form>
      ) : null}

      {activeTab === "prescription" ? (
        <form onSubmit={handleIssuePrescription} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-3 max-w-2xl">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><FilePlus2 className="h-5 w-5 text-teal-700" /> Issue Prescription</h2>
          <div>
            <label className="text-sm text-slate-700">Appointment</label>
            <select required value={prescription.appointmentId} onChange={(e) => handleAppointmentSelect(e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2">
              <option value="">Select appointment</option>
              {consultationAppointments.map((item) => (
                <option key={item._id} value={item._id}>
                  {resolvePatientName(item.patientId)} | {new Date(item.scheduledAt).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-700">Patient</label>
            <input value={prescription.patientName || ""} readOnly className="w-full border border-slate-300 rounded-md px-3 py-2 bg-slate-50" />
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Medicines</p>
            {prescription.medicines.map((medicine, index) => (
              <div key={`medicine-${index}`} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-slate-700">Medicine {index + 1}</p>
                <div>
                  <label className="text-sm text-slate-700">Medicine name</label>
                  <input required value={medicine.name} onChange={(e) => updateMedicine(index, "name", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                </div>
                <div>
                  <label className="text-sm text-slate-700">Dosage</label>
                  <input required value={medicine.dosage} onChange={(e) => updateMedicine(index, "dosage", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-slate-700">Frequency</label>
                    <input value={medicine.frequency} onChange={(e) => updateMedicine(index, "frequency", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-sm text-slate-700">Duration</label>
                    <input value={medicine.duration} onChange={(e) => updateMedicine(index, "duration", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-slate-700">Medicine notes</label>
                  <input value={medicine.notes} onChange={(e) => updateMedicine(index, "notes", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => removeMedicine(index)} className="text-sm text-rose-600 hover:text-rose-700">Remove medicine</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addMedicine} className="text-sm text-teal-700 hover:text-teal-800">+ Add medicine</button>
          </div>
          <div>
            <label className="text-sm text-slate-700">Instructions</label>
            <textarea value={prescription.instructions} onChange={(e) => setPrescription((prev) => ({ ...prev, instructions: e.target.value }))} rows={3} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <div>
            <label className="text-sm text-slate-700">Follow-up date</label>
            <input type="datetime-local" value={prescription.followUpDate} onChange={(e) => setPrescription((prev) => ({ ...prev, followUpDate: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
          </div>
          <button disabled={issuing} className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{issuing ? "Issuing..." : "Issue"}</button>
        </form>
      ) : null}

      {activeTab === "payments" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <p className="text-xs uppercase tracking-wide">Total Received</p>
            <p className="text-2xl font-semibold">LKR {Number(totalReceived || 0).toFixed(2)}</p>
            <p className="text-xs mt-1">Based on succeeded payments linked to your appointments.</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="min-w-full">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 text-left">
                <tr>
                  <th className="px-4 py-3">Patient</th>
                  <th className="px-4 py-3">Appointment</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Paid At</th>
                </tr>
              </thead>
              <tbody>
                {paymentLoading ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-slate-500">Loading payments...</td></tr>
                ) : doctorPayments.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-6 text-slate-500">No payment records found for your appointments.</td></tr>
                ) : doctorPayments.map((item) => (
                  <tr key={item.appointment._id} className="border-t border-slate-100 text-sm">
                    <td className="px-4 py-3">{resolvePatientName(item.appointment.patientId)}</td>
                    <td className="px-4 py-3">{new Date(item.appointment.scheduledAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{item.payment?.paymentMethod || "-"}</td>
                    <td className="px-4 py-3">{item.payment ? `${item.payment.currency} ${Number(item.payment.amount || 0).toFixed(2)}` : "-"}</td>
                    <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{item.payment?.status || "not-paid"}</span></td>
                    <td className="px-4 py-3">{item.payment?.paidAt ? new Date(item.payment.paidAt).toLocaleString() : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {activeTab === "availability" ? (
        <form onSubmit={handleSaveAvailability} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-3xl">
          <h2 className="text-lg font-semibold inline-flex items-center gap-2"><Settings2 className="h-5 w-5 text-teal-700" /> Availability</h2>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Weekly Availability Slots</p>
            {availabilitySlots.map((slot, index) => (
              <div key={`slot-${index}`} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-slate-700">Slot {index + 1}</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div>
                    <label className="text-xs text-slate-600">Day of week (0-6)</label>
                    <input type="number" min="0" max="6" value={slot.dayOfWeek ?? 1} onChange={(e) => updateSlot(index, "dayOfWeek", Number(e.target.value))} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Start time</label>
                    <input type="time" value={slot.startTime || "09:00"} onChange={(e) => updateSlot(index, "startTime", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">End time</label>
                    <input type="time" value={slot.endTime || "17:00"} onChange={(e) => updateSlot(index, "endTime", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">Mode</label>
                    <select value={slot.mode || "both"} onChange={(e) => updateSlot(index, "mode", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2">
                      <option value="both">Both</option>
                      <option value="online">Online</option>
                      <option value="in_person">In Person</option>
                    </select>
                  </div>
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => removeSlot(index)} className="text-sm text-rose-600 hover:text-rose-700">Remove slot</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addSlot} className="text-sm text-teal-700 hover:text-teal-800">+ Add slot</button>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Unavailable Periods</p>
            {unavailablePeriods.map((period, index) => (
              <div key={`period-${index}`} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium text-slate-700">Unavailable period {index + 1}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-600">From</label>
                    <input type="datetime-local" value={period.from} onChange={(e) => updateUnavailablePeriod(index, "from", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-600">To</label>
                    <input type="datetime-local" value={period.to} onChange={(e) => updateUnavailablePeriod(index, "to", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-600">Reason</label>
                  <input value={period.reason} onChange={(e) => updateUnavailablePeriod(index, "reason", e.target.value)} className="w-full border border-slate-300 rounded-md px-3 py-2" />
                </div>
                <div className="text-right">
                  <button type="button" onClick={() => removeUnavailablePeriod(index)} className="text-sm text-rose-600 hover:text-rose-700">Remove period</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addUnavailablePeriod} className="text-sm text-teal-700 hover:text-teal-800">+ Add unavailable period</button>
          </div>

          <button disabled={savingAvailability} className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2 inline-flex items-center gap-1"><CalendarClock className="h-4 w-4" /> {savingAvailability ? "Saving..." : "Save Availability"}</button>
        </form>
      ) : null}
    </div>
  );
};

export default DoctorDashboard;
