import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload, User, Bot, Stethoscope, CircleX, LoaderCircle, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getUserInfo } from "../utils/auth";
import {
  deletePatientReport,
  getPatientProfile,
  getPatientPrescriptions,
  getPatientReports,
  registerPatient,
  updatePatientProfile,
  uploadMedicalReport
} from "../services/patientService";
import { bookAppointment, cancelAppointment, getDoctors, getPatientAppointments } from "../services/appointmentService";
import PaymentForm from "../components/PaymentForm";
import {
  createStripeIntent,
  getPaymentsByAppointment,
  sendStripeOtp,
  uploadBankSlip,
  verifyStripePayment
} from "../services/paymentService";
import { extractErrorMessage } from "../services/api";
import { getOrCreateTelemedicineSession, startTelemedicineSession } from "../services/telemedicineService";
import { notifyCustomBestEffort, pushLocalNotification } from "../services/notificationService";
import SymptomChecker from "./SymptomChecker";

const tabs = ["appointments", "book", "profile", "reports", "prescriptions", "symptom-checker"];

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"];
const genders = ["male", "female", "other", "prefer_not_to_say"];
const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_TO_INDEX = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

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
  const [profileMissing, setProfileMissing] = useState(false);
  const [patientAccountStatus, setPatientAccountStatus] = useState("active");
  const [paymentStatusByAppointment, setPaymentStatusByAppointment] = useState({});
  const [selectedAppointmentForPayment, setSelectedAppointmentForPayment] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentCurrency, setPaymentCurrency] = useState("LKR");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentClientSecret, setPaymentClientSecret] = useState("");
  const [paymentRecordId, setPaymentRecordId] = useState("");
  const [paymentOtpMeta, setPaymentOtpMeta] = useState({ dispatched: null, sentTo: "", reason: "" });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [slipFile, setSlipFile] = useState(null);
  const [toast, setToast] = useState({ type: "", message: "" });

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
  const doctorFilterRequestRef = useRef(0);
  const reportFileInputRef = useRef(null);
  const bookingRestricted = ["inactive", "suspended"].includes(String(patientAccountStatus || "").toLowerCase());

  const doctorOptions = useMemo(() => {
    return doctors.map((doctor) => ({
      id: doctor.userId,
      label: `${doctor.fullName} - ${doctor.specialization}`,
      specialty: doctor.specialization
    }));
  }, [doctors]);

  const selectedDoctor = useMemo(() => {
    return doctors.find((doctor) => String(doctor?.userId || doctor?._id || "") === String(bookingForm.doctorId || "")) || null;
  }, [doctors, bookingForm.doctorId]);

  const parseTimeToMinutes = (value) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
    if (!match) {
      return null;
    }
    return Number(match[1]) * 60 + Number(match[2]);
  };

  const getZonedDateParts = (date, timeZone) => {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const weekdayToken = parts.find((part) => part.type === "weekday")?.value;
    const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);

    return {
      weekday: WEEKDAY_TO_INDEX[weekdayToken] ?? date.getUTCDay(),
      minutes: hour * 60 + minute
    };
  };

  const bookingAvailabilityHint = useMemo(() => {
    if (!selectedDoctor) {
      return "Select a doctor to view availability guidance.";
    }

    const slots = Array.isArray(selectedDoctor.availabilitySlots) ? selectedDoctor.availabilitySlots : [];
    const recurring = slots.filter((slot) => slot?.dayOfWeek != null && slot?.startTime && slot?.endTime);
    const unavailable = Array.isArray(selectedDoctor.unavailablePeriods) ? selectedDoctor.unavailablePeriods : [];
    const workStart = selectedDoctor?.workingHours?.start || "09:00";
    const workEnd = selectedDoctor?.workingHours?.end || "17:00";
    const tz = selectedDoctor?.workingHours?.timezone || "Asia/Colombo";

    const recurringText = recurring.length > 0
      ? recurring
        .map((slot) => `${weekdayLabels[Number(slot.dayOfWeek)] || `Day ${slot.dayOfWeek}`}: ${slot.startTime}-${slot.endTime}`)
        .join(" | ")
      : `Working hours: ${workStart}-${workEnd} (${tz})`;

    const unavailableText = unavailable.length > 0
      ? `Unavailable periods: ${unavailable.map((period) => `${new Date(period.from).toLocaleString()} to ${new Date(period.to).toLocaleString()}`).join(" | ")}`
      : "No unavailable periods set.";

    return `${recurringText}. ${unavailableText}`;
  }, [selectedDoctor]);

  const isBookingTimeInsideDoctorAvailability = () => {
    if (!selectedDoctor || !bookingForm.scheduledAt) {
      return { valid: true, message: "" };
    }

    const scheduledStart = new Date(bookingForm.scheduledAt);
    if (Number.isNaN(scheduledStart.getTime())) {
      return { valid: false, message: "Please choose a valid appointment date and time." };
    }

    const duration = Number(bookingForm.durationMinutes || 30);
    const scheduledEnd = new Date(scheduledStart.getTime() + duration * 60000);
    const doctorTimeZone = String(selectedDoctor?.workingHours?.timezone || "Asia/Colombo");

    const unavailable = Array.isArray(selectedDoctor.unavailablePeriods) ? selectedDoctor.unavailablePeriods : [];
    const overlapsBlockedPeriod = unavailable.some((period) => {
      const from = new Date(period.from);
      const to = new Date(period.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return false;
      }
      return scheduledStart < to && scheduledEnd > from;
    });

    if (overlapsBlockedPeriod) {
      return { valid: false, message: "Selected time overlaps a doctor unavailable period." };
    }

    const startParts = getZonedDateParts(scheduledStart, doctorTimeZone);
    const endParts = getZonedDateParts(scheduledEnd, doctorTimeZone);

    if (startParts.weekday !== endParts.weekday) {
      return { valid: false, message: "Selected time spans across multiple days in doctor's timezone." };
    }

    const startMinutes = startParts.minutes;
    const endMinutes = endParts.minutes;

    const slots = Array.isArray(selectedDoctor.availabilitySlots) ? selectedDoctor.availabilitySlots : [];
    const recurring = slots.filter((slot) => slot?.dayOfWeek != null && slot?.startTime && slot?.endTime);

    if (recurring.length > 0) {
      const day = startParts.weekday;
      const matchesSlot = recurring.some((slot) => {
        const slotStart = parseTimeToMinutes(slot.startTime);
        const slotEnd = parseTimeToMinutes(slot.endTime);
        return Number(slot.dayOfWeek) === day && slotStart != null && slotEnd != null && startMinutes >= slotStart && endMinutes <= slotEnd;
      });

      if (!matchesSlot) {
        return { valid: false, message: "Selected time is outside doctor weekly availability slots." };
      }

      return { valid: true, message: "" };
    }

    const workingStart = parseTimeToMinutes(selectedDoctor?.workingHours?.start || "09:00");
    const workingEnd = parseTimeToMinutes(selectedDoctor?.workingHours?.end || "17:00");

    if (workingStart != null && workingEnd != null && (startMinutes < workingStart || endMinutes > workingEnd)) {
      return { valid: false, message: "Selected time is outside doctor working hours." };
    }

    return { valid: true, message: "" };
  };

  const doctorNameById = useMemo(() => {
    const entries = doctors.flatMap((doctor) => {
      const name = doctor?.fullName || doctor?.name;
      const ids = [doctor?.userId, doctor?._id, doctor?.id].filter(Boolean);
      return ids.map((id) => [String(id), name]);
    });

    return new Map(entries);
  }, [doctors]);

  const appointmentsByLatestBooking = useMemo(() => {
    const toMs = (value) => {
      const time = new Date(value || 0).getTime();
      return Number.isFinite(time) ? time : 0;
    };

    return [...appointments].sort((a, b) => {
      const createdDiff = toMs(b?.createdAt || b?.updatedAt) - toMs(a?.createdAt || a?.updatedAt);
      if (createdDiff !== 0) {
        return createdDiff;
      }

      return toMs(b?.scheduledAt) - toMs(a?.scheduledAt);
    });
  }, [appointments]);

  const reportConsultationOptions = useMemo(() => {
    return (Array.isArray(appointments) ? appointments : [])
      .filter((appointment) => ["confirmed", "completed"].includes(String(appointment?.status || "").toLowerCase()))
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  }, [appointments]);

  const resolveDoctorName = (doctorId) => {
    const key = String(doctorId || "");
    return doctorNameById.get(key) || doctorId || "Unknown doctor";
  };

  const resolveAppointmentFee = (appointment) => {
    const doctor = doctors.find((entry) => String(entry?.userId || entry?._id || "") === String(appointment?.doctorId || ""));
    const candidates = [
      appointment?.consultationFee,
      appointment?.fee,
      appointment?.amount,
      doctor?.consultationFee
    ];

    const resolved = candidates
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0);

    return resolved || 1000;
  };

  const loadPaymentStatuses = async (appointmentList) => {
    const entries = await Promise.all(
      (Array.isArray(appointmentList) ? appointmentList : []).map(async (appointment) => {
        const appointmentId = String(appointment?._id || "");
        if (!appointmentId) {
          return [appointmentId, null];
        }

        try {
          const payments = await getPaymentsByAppointment(appointmentId);
          const latest = Array.isArray(payments) && payments.length > 0 ? payments[0] : null;
          return [appointmentId, latest?.status || null];
        } catch {
          return [appointmentId, null];
        }
      })
    );

    setPaymentStatusByAppointment(Object.fromEntries(entries));
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

  const hasActiveDoctorFilters = useMemo(() => {
    return Boolean(doctorFilters.name.trim() || doctorFilters.specialty || doctorFilters.availability);
  }, [doctorFilters.name, doctorFilters.specialty, doctorFilters.availability]);

  const isDoctorAvailableAt = (doctor, selectedDateTime) => {
    if (!selectedDateTime || Number.isNaN(selectedDateTime.getTime())) {
      return true;
    }

    const duration = 30;
    const endDateTime = new Date(selectedDateTime.getTime() + duration * 60000);
    const timezone = String(doctor?.workingHours?.timezone || "Asia/Colombo");
    const startParts = getZonedDateParts(selectedDateTime, timezone);
    const endParts = getZonedDateParts(endDateTime, timezone);

    if (startParts.weekday !== endParts.weekday) {
      return false;
    }

    const unavailable = Array.isArray(doctor?.unavailablePeriods) ? doctor.unavailablePeriods : [];
    const overlapsBlockedPeriod = unavailable.some((period) => {
      const from = new Date(period.from);
      const to = new Date(period.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        return false;
      }

      return selectedDateTime < to && endDateTime > from;
    });

    if (overlapsBlockedPeriod) {
      return false;
    }

    const recurringSlots = (Array.isArray(doctor?.availabilitySlots) ? doctor.availabilitySlots : [])
      .filter((slot) => slot?.dayOfWeek != null && slot?.startTime && slot?.endTime);

    if (recurringSlots.length > 0) {
      return recurringSlots.some((slot) => {
        const slotStart = parseTimeToMinutes(slot.startTime);
        const slotEnd = parseTimeToMinutes(slot.endTime);

        if (slotStart == null || slotEnd == null) {
          return false;
        }

        return Number(slot.dayOfWeek) === startParts.weekday
          && startParts.minutes >= slotStart
          && endParts.minutes <= slotEnd;
      });
    }

    const workStart = parseTimeToMinutes(doctor?.workingHours?.start || "09:00");
    const workEnd = parseTimeToMinutes(doctor?.workingHours?.end || "17:00");

    if (workStart == null || workEnd == null) {
      return true;
    }

    return startParts.minutes >= workStart && endParts.minutes <= workEnd;
  };

  const applyDoctorFilters = (doctorList, filters) => {
    const input = Array.isArray(doctorList) ? doctorList : [];
    const nameNeedle = String(filters?.name || "").trim().toLowerCase();
    const specializationNeedle = String(filters?.specialty || "").trim().toLowerCase();
    const availabilityDate = filters?.availability ? new Date(filters.availability) : null;
    const hasAvailabilityFilter = availabilityDate && !Number.isNaN(availabilityDate.getTime());

    return input.filter((doctor) => {
      const doctorName = String(doctor?.fullName || "").trim().toLowerCase();
      const doctorSpecialization = String(doctor?.specialization || "").trim().toLowerCase();

      if (nameNeedle && !doctorName.includes(nameNeedle)) {
        return false;
      }

      if (specializationNeedle && doctorSpecialization !== specializationNeedle) {
        return false;
      }

      if (hasAvailabilityFilter && !isDoctorAvailableAt(doctor, availabilityDate)) {
        return false;
      }

      return true;
    });
  };

  const loadDoctors = async (filters = doctorFilters) => {
    const requestId = doctorFilterRequestRef.current + 1;
    doctorFilterRequestRef.current = requestId;
    setLoadingDoctors(true);

    try {
      const params = {
        name: filters.name || undefined,
        specialty: filters.specialty || undefined,
        availability: filters.availability ? new Date(filters.availability).toISOString() : undefined
      };

      const doctorData = await getDoctors(params).catch(() => []);
      const fetchedDoctors = Array.isArray(doctorData?.data) ? doctorData.data : Array.isArray(doctorData) ? doctorData : [];

      if (requestId !== doctorFilterRequestRef.current) {
        return;
      }

      setDoctors(applyDoctorFilters(fetchedDoctors, filters));
    } finally {
      if (requestId === doctorFilterRequestRef.current) {
        setLoadingDoctors(false);
      }
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      let profileData = null;
      try {
        profileData = await getPatientProfile();
        setProfileMissing(false);
      } catch (profileError) {
        if (profileError?.response?.status === 404) {
          setProfileMissing(true);
        } else {
          throw profileError;
        }
      }

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
        profileData ? getPatientReports().catch(() => []) : Promise.resolve([]),
        profileData ? getPatientPrescriptions().catch(() => []) : Promise.resolve([])
      ]);

      if (profileData) {
        setPatientAccountStatus(String(profileData.status || "active").toLowerCase());
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
      } else {
        setPatientAccountStatus("active");
      }

      setAppointments(Array.isArray(appointmentData) ? appointmentData : []);
      await loadPaymentStatuses(appointmentData);
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

  useEffect(() => {
    if (!hasActiveDoctorFilters) {
      return;
    }

    if (doctorOptions.length === 0) {
      if (bookingForm.doctorId) {
        setBookingForm((prev) => ({ ...prev, doctorId: "", specialty: "" }));
      }
      return;
    }

    if (doctorOptions.length === 1) {
      onDoctorChange(String(doctorOptions[0].id));
      return;
    }

    const selectedId = String(bookingForm.doctorId || "");
    const selectedIsVisible = doctorOptions.some((option) => String(option.id) === selectedId);

    if (!selectedIsVisible && bookingForm.doctorId) {
      setBookingForm((prev) => ({
        ...prev,
        doctorId: "",
        specialty: doctorFilters.specialty || ""
      }));
    }
  }, [hasActiveDoctorFilters, doctorOptions, bookingForm.doctorId, doctorFilters.specialty]);

  const handleBookAppointment = async (event) => {
    event.preventDefault();

    if (bookingRestricted) {
      const message = `Booking is disabled while your account is ${patientAccountStatus}. Please contact support.`;
      setError(message);
      setToast({ type: "error", message });
      return;
    }

    setBooking(true);
    setError("");
    setSuccess("");

    try {
      const scheduleCheck = isBookingTimeInsideDoctorAvailability();
      if (!scheduleCheck.valid) {
        throw new Error(scheduleCheck.message);
      }

      await bookAppointment({
        doctorId: bookingForm.doctorId,
        specialty: bookingForm.specialty,
        scheduledAt: new Date(bookingForm.scheduledAt).toISOString(),
        durationMinutes: Number(bookingForm.durationMinutes || 30),
        reason: bookingForm.reason
      });

      setSuccess("Appointment request submitted successfully.");
      setToast({ type: "success", message: "Appointment request submitted successfully." });
      setBookingForm({ doctorId: "", specialty: "", scheduledAt: "", durationMinutes: 30, reason: "" });
      await loadDashboard();
      setActiveTab("appointments");
    } catch (err) {
      setError(extractErrorMessage(err, "Could not create appointment"));
      setToast({ type: "error", message: extractErrorMessage(err, "Could not create appointment") });
    } finally {
      setBooking(false);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    setError("");
    setSuccess("");
    try {
      await cancelAppointment(appointmentId, { cancelledReason: "Cancelled by patient" });

      await notifyCustomBestEffort({
        title: "Appointment Cancelled",
        message: `Your appointment ${appointmentId} was cancelled successfully.`,
        category: "appointment",
        recipients: {
          patientEmail: user?.email || null,
          patientPhone: profile?.phone || user?.phoneNumber || null,
          patientName: profile?.fullName || user?.fullName || "Patient"
        },
        extraPayload: {
          appointmentId,
          status: "cancelled"
        }
      });

      setSuccess("Appointment cancelled.");
      setToast({ type: "success", message: "Appointment cancelled." });
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not cancel appointment"));
      setToast({ type: "error", message: extractErrorMessage(err, "Could not cancel appointment") });
    }
  };

  const formatRemainingTime = (milliseconds) => {
    const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) {
      parts.push(`${days} day${days > 1 ? "s" : ""}`);
    }
    if (hours > 0) {
      parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
    }
    if (minutes > 0 || parts.length === 0) {
      parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
    }

    return parts.join(" ");
  };

  const getConsultationJoinAvailability = (appointment) => {
    const status = String(appointment?.status || "").toLowerCase();
    if (!["confirmed", "completed"].includes(status)) {
      return {
        canJoin: false,
        message: "Consultation can be joined only for confirmed or completed appointments."
      };
    }

    const scheduledAt = new Date(appointment?.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return {
        canJoin: false,
        message: "This appointment has an invalid schedule time. Please contact support."
      };
    }

    const durationMinutes = Math.max(1, Number(appointment?.durationMinutes || 30));
    const windowEnd = new Date(scheduledAt.getTime() + durationMinutes * 60000);
    const now = new Date();

    if (now < scheduledAt) {
      const remaining = formatRemainingTime(scheduledAt.getTime() - now.getTime());
      return {
        canJoin: false,
        message: `Consultation has not started yet. Starts in ${remaining} (${scheduledAt.toLocaleString()}).`
      };
    }

    if (now > windowEnd) {
      return {
        canJoin: false,
        message: `Consultation window ended at ${windowEnd.toLocaleString()}.`
      };
    }

    return {
      canJoin: true,
      message: ""
    };
  };

  const canJoinConsultation = (appointment) => {
    return getConsultationJoinAvailability(appointment).canJoin;
  };

  const handleJoinConsultation = async (appointment) => {
    if (!appointment?._id) {
      return;
    }

    const joinAvailability = getConsultationJoinAvailability(appointment);
    if (!joinAvailability.canJoin) {
      const message = joinAvailability.message || "Consultation cannot be joined at this time.";
      setError(message);
      setToast({ type: "error", message });
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
      const payload = {
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
      };

      if (profileMissing) {
        await registerPatient({
          userId: authUserId,
          fullName: payload.fullName,
          dob: payload.dob,
          phone: payload.phone,
          address: payload.address,
          gender: payload.gender,
          bloodGroup: payload.bloodGroup,
          allergies: payload.allergies,
          medicalHistory: payload.medicalHistory,
          emergencyContact: payload.emergencyContact
        });

        await notifyCustomBestEffort({
          title: "Patient Profile Created",
          message: "Your patient profile was created successfully.",
          category: "profile",
          recipients: {
            patientEmail: user?.email || null,
            patientPhone: payload.phone || user?.phoneNumber || null,
            patientName: payload.fullName || user?.fullName || "Patient"
          }
        });

        setSuccess("Patient profile created successfully.");
        setToast({ type: "success", message: "Patient profile created successfully." });
        setProfileMissing(false);
        await loadDashboard();
      } else {
        await updatePatientProfile(payload);

        await notifyCustomBestEffort({
          title: "Patient Profile Updated",
          message: "Your patient profile was updated successfully.",
          category: "profile",
          recipients: {
            patientEmail: user?.email || null,
            patientPhone: payload.phone || user?.phoneNumber || null,
            patientName: payload.fullName || user?.fullName || "Patient"
          }
        });

        setSuccess("Profile updated successfully.");
        setToast({ type: "success", message: "Profile updated successfully." });
      }
    } catch (err) {
      setError(extractErrorMessage(err, profileMissing ? "Could not create profile" : "Could not update profile"));
      setToast({ type: "error", message: extractErrorMessage(err, profileMissing ? "Could not create profile" : "Could not update profile") });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file) {
      setError("Please select a report file to upload.");
      reportFileInputRef.current?.click();
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

      await notifyCustomBestEffort({
        title: "Medical Report Uploaded",
        message: `Your medical report "${reportMeta.title || file.name}" was uploaded successfully.`,
        category: "report",
        recipients: {
          patientEmail: user?.email || null,
          patientPhone: profile?.phone || user?.phoneNumber || null,
          patientName: profile?.fullName || user?.fullName || "Patient"
        }
      });

      setSuccess("Medical report uploaded.");
      setToast({ type: "success", message: "Medical report uploaded." });
      setFile(null);
      setReportMeta({ documentType: "medical_report", title: "", notes: "", consultationId: "" });
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not upload report"));
      setToast({ type: "error", message: extractErrorMessage(err, "Could not upload report") });
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

      await notifyCustomBestEffort({
        title: "Medical Report Deleted",
        message: `Medical report ${reportId} was deleted from your records.`,
        category: "report",
        recipients: {
          patientEmail: user?.email || null,
          patientPhone: profile?.phone || user?.phoneNumber || null,
          patientName: profile?.fullName || user?.fullName || "Patient"
        },
        extraPayload: {
          reportId
        }
      });

      setSuccess("Report deleted.");
      setToast({ type: "success", message: "Report deleted." });
      await loadDashboard();
    } catch (err) {
      setError(extractErrorMessage(err, "Could not delete report"));
      setToast({ type: "error", message: extractErrorMessage(err, "Could not delete report") });
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

  const closePaymentModal = () => {
    setPaymentModalOpen(false);
    setSelectedAppointmentForPayment(null);
    setPaymentMethod("card");
    setPaymentClientSecret("");
    setPaymentRecordId("");
    setPaymentOtpMeta({ dispatched: null, sentTo: "", reason: "" });
    setPaymentBusy(false);
    setPaymentError("");
    setSlipFile(null);
  };

  const openPaymentModal = (appointment) => {
    const amount = resolveAppointmentFee(appointment);
    setSelectedAppointmentForPayment(appointment);
    setPaymentAmount(amount);
    setPaymentCurrency("LKR");
    setPaymentMethod("card");
    setPaymentClientSecret("");
    setPaymentRecordId("");
    setPaymentOtpMeta({ dispatched: null, sentTo: "", reason: "" });
    setPaymentError("");
    setSlipFile(null);
    setPaymentModalOpen(true);
  };

  const startCardPayment = async () => {
    if (!selectedAppointmentForPayment?._id) {
      return;
    }

    setPaymentBusy(true);
    setPaymentError("");

    try {
      const intent = await createStripeIntent({
        appointmentId: selectedAppointmentForPayment._id,
        amount: Number(paymentAmount),
        currency: paymentCurrency
      });

      setPaymentClientSecret(intent?.clientSecret || "");
      setPaymentRecordId(String(intent?.paymentId || ""));
      setPaymentOtpMeta({
        dispatched: intent?.otpDispatched === true,
        sentTo: intent?.otpSentTo || "",
        reason: intent?.otpDispatchReason || ""
      });
    } catch (err) {
      setPaymentError(extractErrorMessage(err, "Could not initialize card payment"));
    } finally {
      setPaymentBusy(false);
    }
  };

  const sendCardPaymentOtp = async ({ cardType }) => {
    if (!paymentRecordId) {
      throw new Error("Missing payment session. Please initialize payment first.");
    }

    const result = await sendStripeOtp({
      paymentId: paymentRecordId,
      cardType
    });

    setPaymentOtpMeta({
      dispatched: result?.otpDispatched === true,
      sentTo: result?.otpSentTo || "",
      reason: result?.otpDispatchReason || ""
    });

    pushLocalNotification({
      title: result?.otpDispatched ? "Payment OTP Sent" : "Payment OTP Dispatch Failed",
      message: result?.otpDispatched
        ? `OTP sent${result?.otpSentTo ? ` to ${result.otpSentTo}` : ""} for payment verification.`
        : `OTP dispatch failed: ${result?.otpDispatchReason || "Unknown reason"}`,
      category: "payment",
      status: result?.otpDispatched ? "sent" : "failed",
      recipients: {
        patientEmail: user?.email || null,
        patientPhone: profile?.phone || user?.phoneNumber || null
      }
    });

    if (!result?.otpDispatched) {
      throw new Error(result?.otpDispatchReason || "OTP dispatch failed");
    }

    return result;
  };

  const handleCardPaymentSuccess = async (paymentIntent) => {
    setPaymentBusy(true);
    setPaymentError("");

    try {
      await verifyStripePayment({
        paymentId: paymentRecordId || undefined,
        paymentIntentId: paymentIntent?.id,
        otp: paymentIntent?.otp,
        cardType: paymentIntent?.cardType,
        demoSuccess: true
      });

      setSuccess("Payment completed successfully.");
      setToast({ type: "success", message: "Payment completed successfully." });
      pushLocalNotification({
        title: "Payment Completed",
        message: `Your payment of ${paymentCurrency} ${Number(paymentAmount || 0).toFixed(2)} was completed successfully.`,
        category: "payment",
        status: "sent",
        recipients: {
          patientEmail: user?.email || null,
          patientPhone: profile?.phone || user?.phoneNumber || null
        }
      });
      closePaymentModal();
      await loadDashboard();
    } catch (err) {
      const message = extractErrorMessage(err, "Payment verification failed");
      setPaymentError(message);
      setToast({ type: "error", message });
      pushLocalNotification({
        title: "Payment Verification Failed",
        message,
        category: "payment",
        status: "failed",
        recipients: {
          patientEmail: user?.email || null,
          patientPhone: profile?.phone || user?.phoneNumber || null
        }
      });
    } finally {
      setPaymentBusy(false);
    }
  };

  const handleUploadSlipPayment = async () => {
    if (!selectedAppointmentForPayment?._id || !slipFile) {
      setPaymentError("Please choose a slip image before submitting.");
      return;
    }

    setPaymentBusy(true);
    setPaymentError("");

    const formData = new FormData();
    formData.append("appointmentId", selectedAppointmentForPayment._id);
    formData.append("amount", String(Number(paymentAmount)));
    formData.append("currency", paymentCurrency);
    formData.append("slip", slipFile);

    try {
      await uploadBankSlip(formData);
      setSuccess("Slip uploaded. Waiting for admin verification.");
      setToast({ type: "success", message: "Slip uploaded. Waiting for admin verification." });
      closePaymentModal();
      await loadDashboard();
    } catch (err) {
      setPaymentError(extractErrorMessage(err, "Could not upload payment slip"));
      setToast({ type: "error", message: extractErrorMessage(err, "Could not upload payment slip") });
    } finally {
      setPaymentBusy(false);
    }
  };

  useEffect(() => {
    if (!paymentModalOpen) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [paymentModalOpen]);

  useEffect(() => {
    if (!toast.message) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast({ type: "", message: "" });
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [toast]);

  const paymentModal = paymentModalOpen && selectedAppointmentForPayment ? (
    <div className="fixed inset-0 z-70 bg-black/45 backdrop-blur-[1px] overflow-y-auto p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 my-8 mx-auto max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Pay Appointment</h3>
            <p className="text-sm text-slate-600 mt-1">
              {resolveDoctorName(selectedAppointmentForPayment.doctorId)} | {new Date(selectedAppointmentForPayment.scheduledAt).toLocaleString()}
            </p>
          </div>
          <button onClick={closePaymentModal} className="text-slate-500 hover:text-slate-700">Close</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-slate-700">Amount</label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(Number(e.target.value || 0))}
              className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="text-sm text-slate-700">Currency</label>
            <select
              value={paymentCurrency}
              onChange={(e) => setPaymentCurrency(e.target.value)}
              className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
            >
              <option value="LKR">LKR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div className="inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              setPaymentMethod("card");
              setPaymentError("");
            }}
            className={`px-3 py-1.5 text-sm rounded-md ${paymentMethod === "card" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Card (Stripe)
          </button>
          <button
            type="button"
            onClick={() => {
              setPaymentMethod("bank");
              setPaymentError("");
            }}
            className={`px-3 py-1.5 text-sm rounded-md ${paymentMethod === "bank" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
          >
            Bank Slip
          </button>
        </div>

        {paymentError ? <p className="text-sm text-rose-600">{paymentError}</p> : null}

        {paymentMethod === "card" ? (
          <div className="space-y-3">
            {!paymentClientSecret ? (
              <button
                type="button"
                disabled={paymentBusy}
                onClick={startCardPayment}
                className="bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-400 text-white rounded-md px-4 py-2"
              >
                {paymentBusy ? "Initializing..." : "Initialize Card Payment"}
              </button>
            ) : null}

            {paymentClientSecret ? (
              <PaymentForm
                amount={paymentAmount}
                currency={paymentCurrency}
                clientSecret={paymentClientSecret}
                otpMeta={paymentOtpMeta}
                onSendOtp={sendCardPaymentOtp}
                onPaymentSuccess={handleCardPaymentSuccess}
                onCancel={closePaymentModal}
              />
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-slate-700">Upload bank transfer slip (jpg/png)</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={(e) => setSlipFile(e.target.files?.[0] || null)}
                className="block mt-1"
              />
            </div>
            <button
              type="button"
              disabled={paymentBusy || !slipFile}
              onClick={handleUploadSlipPayment}
              className="bg-indigo-700 hover:bg-indigo-800 disabled:bg-slate-400 text-white rounded-md px-4 py-2"
            >
              {paymentBusy ? "Uploading..." : "Submit Slip"}
            </button>
          </div>
        )}
      </div>
    </div>
  ) : null;

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

      {error ? <p className="hidden text-sm text-rose-600">{error}</p> : null}
      {success ? <p className="hidden text-sm text-emerald-700">{success}</p> : null}
      {profileMissing ? (
        <p className="text-sm text-amber-700">Patient profile is missing for this account. Complete the Profile tab once to unlock prescriptions and records.</p>
      ) : null}
      <div className={`rounded-lg border px-4 py-3 text-sm ${bookingRestricted ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
        Account status: <span className="font-semibold capitalize">{patientAccountStatus || "active"}</span>
        {bookingRestricted ? " | Booking is disabled for this account." : " | Booking is enabled."}
      </div>
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
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {appointmentsByLatestBooking.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={7}>No appointments yet.</td>
                </tr>
              ) : (
                appointmentsByLatestBooking.map((appointment) => (
                  <tr key={appointment._id} className="border-t border-slate-100 text-sm">
                    {(() => {
                      const paymentStatus = paymentStatusByAppointment[String(appointment._id)] || appointment.paymentStatus || "pending";
                      const canPay =
                        ["pending", "confirmed"].includes(String(appointment.status || "").toLowerCase()) &&
                        !["succeeded", "pending_verification"].includes(String(paymentStatus || "").toLowerCase());

                      return (
                        <>
                    <td className="px-4 py-3">{resolveDoctorName(appointment.doctorId)}</td>
                    <td className="px-4 py-3">{appointment.specialty}</td>
                    <td className="px-4 py-3">{new Date(appointment.scheduledAt).toLocaleString()}</td>
                    <td className="px-4 py-3">{appointment.durationMinutes || 30} min</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs bg-cyan-50 text-cyan-700">{appointment.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-700">{paymentStatus}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2 items-center">
                        {canPay ? (
                          <button
                            onClick={() => openPaymentModal(appointment)}
                            className="px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                          >
                            Pay
                          </button>
                        ) : null}
                        <button
                          onClick={() => handleJoinConsultation(appointment)}
                          disabled={joiningAppointmentId === appointment._id}
                          className={`px-2.5 py-1 rounded-md border ${canJoinConsultation(appointment) ? "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100" : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"} disabled:opacity-50`}
                        >
                          {joiningAppointmentId === appointment._id ? "Joining..." : "Join"}
                        </button>
                        {(appointment.status === "pending" || appointment.status === "confirmed") ? (
                          <button onClick={() => handleCancelAppointment(appointment._id)} className="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 inline-flex items-center gap-1">
                            <CircleX className="h-4 w-4" /> Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                        </>
                      );
                    })()}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {paymentModal ? createPortal(paymentModal, document.body) : null}

      {activeTab === "book" ? (
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><Stethoscope className="h-5 w-5 text-teal-700" /> Find Doctor</h2>
            <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="text-sm text-slate-700">Filter by doctor name</label>
                <input
                  value={doctorFilters.name}
                  onChange={(e) => setDoctorFilters((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                  placeholder="Type doctor name"
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
              <div>
                <label className="text-sm text-slate-700">Filter by availability</label>
                <input
                  type="datetime-local"
                  value={doctorFilters.availability}
                  onChange={(e) => setDoctorFilters((prev) => ({ ...prev, availability: e.target.value }))}
                  className="w-full mt-1 border border-slate-300 rounded-md px-3 py-2"
                />
              </div>
              <button
                type="button"
                onClick={() => setDoctorFilters({ name: "", specialty: "", availability: "" })}
                className="text-sm text-teal-700 hover:text-teal-800 xl:mb-1"
              >
                Reset filters
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <p className="text-slate-500">
              Showing {doctorOptions.length} doctor{doctorOptions.length === 1 ? "" : "s"}. If filters return one doctor, it is auto-selected in the booking form.
              </p>
              {hasActiveDoctorFilters && doctorOptions.length > 1 ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                  Multiple matches found. Please select one doctor in booking form.
                </span>
              ) : null}
              <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-teal-700">
                Selected: {selectedDoctor ? `${selectedDoctor.fullName} - ${selectedDoctor.specialization}` : "No doctor selected"}
              </span>
            </div>
          </div>

          <form onSubmit={handleBookAppointment} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 max-w-2xl mx-auto">
            <h2 className="text-lg font-semibold text-slate-900 inline-flex items-center gap-2"><Stethoscope className="h-5 w-5 text-teal-700" /> Book Appointment</h2>
            {bookingRestricted ? (
              <p className="text-sm text-rose-700 rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                Booking is disabled while your account is {patientAccountStatus}. Contact support to reactivate your account.
              </p>
            ) : null}
            <fieldset disabled={bookingRestricted} className="space-y-4 disabled:opacity-60">
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
                <p className="mt-1 text-xs text-slate-500">{bookingAvailabilityHint}</p>
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
            </fieldset>
          </form>
        </div>
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
          <button disabled={savingProfile} type="submit" className="bg-teal-700 hover:bg-teal-800 text-white rounded-md px-4 py-2">{savingProfile ? "Saving..." : profileMissing ? "Create Profile" : "Save Profile"}</button>
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
              <select value={reportMeta.consultationId} onChange={(e) => setReportMeta((prev) => ({ ...prev, consultationId: e.target.value }))} className="w-full border border-slate-300 rounded-md px-3 py-2 bg-white">
                <option value="">No consultation selected</option>
                {reportConsultationOptions.map((appointment) => (
                  <option key={appointment._id} value={appointment._id}>
                    {`${new Date(appointment.scheduledAt).toLocaleString()} | ${resolveDoctorName(appointment.doctorId)} | ${appointment._id}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-700">Notes</label>
              <textarea value={reportMeta.notes} onChange={(e) => setReportMeta((prev) => ({ ...prev, notes: e.target.value }))} rows={2} className="w-full border border-slate-300 rounded-md px-3 py-2" />
            </div>
            <div>
              <label className="text-sm text-slate-700">Report file</label>
              <div className="mt-1 flex items-center gap-3">
                <input
                  ref={reportFileInputRef}
                  type="file"
                  required
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                <button
                  type="button"
                  onClick={() => reportFileInputRef.current?.click()}
                  className="px-3 py-2 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  Choose File
                </button>
                <span className="text-sm text-slate-500">{file?.name || "No file chosen"}</span>
              </div>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2"><FileText className="h-5 w-5 text-teal-700" /> Prescriptions</h2>

          {prescriptions.length === 0 ? (
            <p className="mt-3 text-sm text-slate-600">No prescriptions yet.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {prescriptions.map((item) => {
                const medicines = Array.isArray(item.medicines) ? item.medicines : [];

                return (
                  <article key={item._id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{resolveAppointmentSummary(item.appointmentId)}</p>
                        <p className="text-sm text-slate-600 mt-1">Doctor: <span className="font-medium text-slate-700">{resolveDoctorName(item.doctorId)}</span></p>
                      </div>
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>
                          Issued: {item.issuedAt ? new Date(item.issuedAt).toLocaleString() : "N/A"}
                        </p>
                        <p>
                          Follow-up: {item.followUpDate ? new Date(item.followUpDate).toLocaleDateString() : "Not scheduled"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Instructions</p>
                      <p className="text-sm text-slate-700 mt-1">{item.instructions || "No additional instructions"}</p>
                    </div>

                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medicines</p>
                      {medicines.length === 0 ? (
                        <p className="text-sm text-slate-600 mt-1">No medicines listed for this prescription.</p>
                      ) : (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                          <table className="w-full text-left text-sm text-slate-700">
                            <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                              <tr>
                                <th className="px-3 py-2 font-semibold">Medicine</th>
                                <th className="px-3 py-2 font-semibold">Dosage</th>
                                <th className="px-3 py-2 font-semibold">Frequency</th>
                                <th className="px-3 py-2 font-semibold">Duration</th>
                                <th className="px-3 py-2 font-semibold">Notes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {medicines.map((medicine, index) => (
                                <tr key={`${item._id}-${medicine.name || "medicine"}-${index}`} className="border-t border-slate-100 align-top">
                                  <td className="px-3 py-2 font-medium text-slate-800">{medicine.name || "N/A"}</td>
                                  <td className="px-3 py-2">{medicine.dosage || "-"}</td>
                                  <td className="px-3 py-2">{medicine.frequency || "-"}</td>
                                  <td className="px-3 py-2">{medicine.duration || "-"}</td>
                                  <td className="px-3 py-2">{medicine.notes || "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {activeTab === "symptom-checker" ? (
        <div>
          <h2 className="font-semibold text-slate-900 inline-flex items-center gap-2 mb-3"><Bot className="h-5 w-5 text-teal-700" /> AI Symptom Checker</h2>
          <SymptomChecker />
        </div>
      ) : null}

      {toast.message ? (
        <div className="fixed top-20 right-4 z-80">
          <div className={`rounded-lg px-4 py-3 shadow-lg border text-sm ${toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PatientDashboard;
