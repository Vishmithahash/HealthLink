import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  CalendarCheck2,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Video,
  BellRing,
  FlaskConical,
  ArrowRight,
  Clock3,
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { getPlatformHealth, getHomeDoctors } from "../services/homeService";
import { extractErrorMessage } from "../services/api";

const services = [
  {
    title: "Doctor Channeling",
    description: "Book specialist appointments with real-time availability guidance.",
    icon: CalendarCheck2
  },
  {
    title: "Telemedicine",
    description: "Join secure online consultations from home.",
    icon: Video
  },
  {
    title: "Lab Reports",
    description: "Upload and track medical reports in one place.",
    icon: FlaskConical
  },
  {
    title: "Reminders",
    description: "Get appointment and payment notifications instantly.",
    icon: BellRing
  },
  {
    title: "AI Symptom Check",
    description: "Use AI-assisted symptom screening for faster triage.",
    icon: Sparkles
  },
  {
    title: "Protected Records",
    description: "Role-based access keeps sensitive health data secure.",
    icon: ShieldCheck
  }
];

const statusClasses = {
  online: "bg-emerald-50 text-emerald-700 border-emerald-200",
  offline: "bg-amber-50 text-amber-700 border-amber-200"
};

const Home = () => {
  const [doctors, setDoctors] = useState([]);
  const [health, setHealth] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHomeData = async () => {
    setLoading(true);
    setError("");

    try {
      const [doctorData, healthData] = await Promise.all([
        getHomeDoctors(),
        getPlatformHealth()
      ]);

      setDoctors(Array.isArray(doctorData) ? doctorData : []);
      setHealth(Array.isArray(healthData) ? healthData : []);
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load homepage data"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeData();
  }, []);

  const stats = useMemo(() => {
    const doctorCount = doctors.length;
    const specialties = new Set(
      doctors
        .map((doctor) => String(doctor?.specialization || "").trim())
        .filter(Boolean)
    );
    const averageFee =
      doctorCount > 0
        ? Math.round(
            doctors.reduce((sum, doctor) => {
              const fee = Number(doctor?.consultationFee || 0);
              return sum + (Number.isFinite(fee) ? fee : 0);
            }, 0) / doctorCount
          )
        : 0;
    const onlineServices = health.filter((service) => service.status === "online").length;

    return {
      doctorCount,
      specialtyCount: specialties.size,
      averageFee,
      onlineServices
    };
  }, [doctors, health]);

  const topDoctors = useMemo(() => {
    return [...doctors]
      .sort((a, b) => Number(b?.rating || 0) - Number(a?.rating || 0))
      .slice(0, 6);
  }, [doctors]);

  const formatLkr = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value)) {
      return "LKR 0";
    }

    return `LKR ${new Intl.NumberFormat("en-LK", { maximumFractionDigits: 0 }).format(value)}`;
  };

  return (
    <div className="home-shell min-h-screen text-slate-100">
      <header className="home-hero relative overflow-hidden border-b border-teal-900/40">
        <div className="absolute inset-0 home-hero-glow pointer-events-none" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="flex items-center justify-between gap-4">
            <Link to="/" className="inline-flex items-center gap-2 text-white">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm">
                <HeartPulse className="h-5 w-5" />
              </span>
              <span className="text-xl font-extrabold tracking-tight">HealthLink</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                to="/register"
                className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-200 hover:text-white"
              >
                Create Account
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800"
              >
                Sign In
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="mt-10 grid lg:grid-cols-[1.05fr_0.95fr] gap-8 items-start">
            <div className="animate-rise-in">
              <p className="inline-flex items-center gap-2 rounded-full border border-teal-300/40 bg-teal-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-200">
                <Activity className="h-3.5 w-3.5" />
                Connected Care Platform
              </p>
              <h1 className="mt-4 text-4xl md:text-5xl leading-tight font-black tracking-tight text-white">
                Start Your Care Journey
                <span className="block text-teal-300">Before You Log In</span>
              </h1>
              <p className="mt-4 max-w-2xl text-slate-200 text-base md:text-lg">
                HealthLink gives patients and doctors one connected system for appointments,
                telemedicine, reports, payments, and smart symptom support.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
                >
                  Join as New User
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-teal-200/45 bg-slate-950/35 px-5 py-3 text-sm font-semibold text-slate-100 hover:border-teal-200/75"
                >
                  Use Existing Account
                </Link>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 animate-rise-in animation-delay-120">
              <div className="home-stat-card">
                <p className="home-stat-label">Active Specialists</p>
                <p className="home-stat-value">{loading ? "..." : stats.doctorCount}</p>
                <p className="home-stat-sub">Public doctor directory</p>
              </div>
              <div className="home-stat-card">
                <p className="home-stat-label">Specialties</p>
                <p className="home-stat-value">{loading ? "..." : stats.specialtyCount}</p>
                <p className="home-stat-sub">Care categories available</p>
              </div>
              <div className="home-stat-card">
                <p className="home-stat-label">Avg. Consultation Fee</p>
                <p className="home-stat-value">
                  {loading ? "..." : formatLkr(stats.averageFee)}
                </p>
                <p className="home-stat-sub">Derived from doctor profiles</p>
              </div>
              <div className="home-stat-card">
                <p className="home-stat-label">Services Online</p>
                <p className="home-stat-value">{loading ? "..." : `${stats.onlineServices}/8`}</p>
                <p className="home-stat-sub">Live health endpoint checks</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
        {error ? (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </span>
            <button
              type="button"
              onClick={loadHomeData}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        <section className="animate-fade-in">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Quick Services</h2>
              <p className="text-sm text-slate-300 mt-1">A familiar, customer-friendly entry point for all care workflows.</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((service, index) => {
              const Icon = service.icon;
              return (
                <article
                  key={service.title}
                  className="home-service-card animate-rise-in"
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 font-semibold text-slate-900">{service.title}</h3>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">{service.description}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-12 animate-fade-in">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Featured Doctors</h2>
            </div>
            <Link
              to="/register"
              className="hidden sm:inline-flex rounded-xl border border-teal-200/50 bg-slate-950/35 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-teal-200/75"
            >
              Register to Book
            </Link>
          </div>

          {loading ? (
            <div className="home-muted-panel text-sm text-slate-600">Loading doctors...</div>
          ) : topDoctors.length === 0 ? (
            <div className="home-muted-panel text-sm text-slate-600">
              No public doctor profiles available yet. Add active, verified doctors to display them here.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {topDoctors.map((doctor) => (
                <article key={doctor._id || doctor.userId} className="home-doctor-card">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{doctor.fullName || "Doctor"}</p>
                      <p className="text-sm text-slate-600 mt-0.5 inline-flex items-center gap-1">
                        <Stethoscope className="h-4 w-4" />
                        {doctor.specialization || "General"}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      ⭐ {Number(doctor.rating || 0).toFixed(1)}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-700 line-clamp-3 min-h-[60px]">
                    {doctor.bio || "Experienced clinician available for high-quality consultations."}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Clock3 className="h-4 w-4" />
                      {doctor?.workingHours?.start || "09:00"} - {doctor?.workingHours?.end || "17:00"}
                    </span>
                    <span className="inline-flex items-center font-semibold text-teal-700">
                      {formatLkr(doctor.consultationFee || 0)}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 animate-fade-in">
          <div className="flex items-end justify-between gap-4 mb-5">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Platform Status</h2>
            </div>
          </div>

          {loading ? (
            <div className="home-muted-panel text-sm text-slate-600">Checking service status...</div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {health.map((service) => (
                <article key={service.key} className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">{service.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{service.description}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[service.status] || statusClasses.offline}`}>
                      {service.status === "online" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                      )}
                      {service.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">{service.message}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-12 mb-6 animate-fade-in">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm">
            <div className="md:flex md:items-center md:justify-between gap-6">
              <div>
                <h3 className="text-2xl font-bold tracking-tight text-slate-950">Ready to continue?</h3>
                <p className="mt-2 text-slate-600">Create an account or sign in to start booking, consultations, and report tracking.</p>
              </div>
              <div className="mt-4 md:mt-0 flex flex-wrap gap-3">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800"
                >
                  Register
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:border-slate-400"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Home;
