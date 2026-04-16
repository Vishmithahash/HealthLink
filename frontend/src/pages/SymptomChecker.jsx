import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, LoaderCircle, ShieldAlert, Stethoscope } from "lucide-react";
import { analyzeSymptoms, getSymptomHistory } from "../services/aiService";
import { extractErrorMessage } from "../services/api";

const genders = ["male", "female", "other", "prefer_not_to_say"];
const severities = ["mild", "moderate", "severe"];

const urgencyClassName = (urgency) => {
    const value = String(urgency || "").toLowerCase();
    if (value === "high") {
        return "bg-rose-100 text-rose-800 border border-rose-200";
    }
    if (value === "medium") {
        return "bg-amber-100 text-amber-800 border border-amber-200";
    }
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
};

const SymptomChecker = () => {
    const [form, setForm] = useState({
        symptoms: "",
        age: "",
        gender: "prefer_not_to_say",
        duration: "",
        severity: "mild",
        notes: ""
    });
    const [analysis, setAnalysis] = useState(null);
    const [historyItems, setHistoryItems] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const symptomsLength = form.symptoms.trim().length;

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const response = await getSymptomHistory({ page: 1, limit: 5 });
            const items = Array.isArray(response?.items)
                ? response.items
                : Array.isArray(response?.data?.items)
                    ? response.data.items
                    : [];
            setHistoryItems(items);
        } catch {
            setHistoryItems([]);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const onChangeField = (key, value) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const validate = useMemo(() => {
        if (symptomsLength < 10) {
            return "Symptoms must be at least 10 characters.";
        }
        if (symptomsLength > 500) {
            return "Symptoms cannot exceed 500 characters.";
        }
        if (form.age !== "") {
            const ageNumber = Number(form.age);
            if (!Number.isInteger(ageNumber) || ageNumber < 0 || ageNumber > 120) {
                return "Age must be an integer between 0 and 120.";
            }
        }
        if (form.duration.length > 100) {
            return "Duration cannot exceed 100 characters.";
        }
        if (form.notes.length > 1000) {
            return "Notes cannot exceed 1000 characters.";
        }
        return "";
    }, [form.age, form.duration.length, form.notes.length, symptomsLength]);

    const handleAnalyze = async (event) => {
        event.preventDefault();
        setError("");
        setAnalysis(null);

        if (validate) {
            setError(validate);
            return;
        }

        setSubmitting(true);

        try {
            const payload = {
                symptoms: form.symptoms.trim(),
                age: form.age === "" ? null : Number(form.age),
                gender: form.gender,
                duration: form.duration.trim() || null,
                severity: form.severity,
                notes: form.notes.trim() || null
            };

            const result = await analyzeSymptoms(payload);
            const normalized = result?.result || result || null;
            setAnalysis(normalized);
            await loadHistory();
        } catch (err) {
            setError(extractErrorMessage(err, "Could not analyze symptoms right now."));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-4 text-white">
                    <h3 className="text-lg font-semibold inline-flex items-center gap-2"><Bot className="h-5 w-5 text-cyan-300" /> AI Symptom Checker</h3>
                    <p className="text-xs text-slate-300 mt-1">Connected to ai-service at /api/ai with backend validation and role-based access.</p>
                </div>

                <form onSubmit={handleAnalyze} className="p-5 space-y-4 bg-slate-50">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Symptoms</label>
                        <textarea
                            rows={4}
                            value={form.symptoms}
                            onChange={(event) => onChangeField("symptoms", event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            placeholder="Describe your symptoms in detail..."
                            required
                        />
                        <p className="text-xs text-slate-500 mt-1">{symptomsLength}/500 characters (min 10)</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
                            <input
                                type="number"
                                min="0"
                                max="120"
                                value={form.age}
                                onChange={(event) => onChangeField("age", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2"
                                placeholder="e.g. 28"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                            <select
                                value={form.gender}
                                onChange={(event) => onChangeField("gender", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2"
                            >
                                {genders.map((gender) => (
                                    <option key={gender} value={gender}>{gender.replaceAll("_", " ")}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
                            <input
                                value={form.duration}
                                onChange={(event) => onChangeField("duration", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2"
                                placeholder="e.g. 1 day"
                                maxLength={100}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Severity</label>
                            <select
                                value={form.severity}
                                onChange={(event) => onChangeField("severity", event.target.value)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2"
                            >
                                {severities.map((severity) => (
                                    <option key={severity} value={severity}>{severity}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Additional notes</label>
                        <textarea
                            rows={2}
                            value={form.notes}
                            onChange={(event) => onChangeField("notes", event.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2"
                            placeholder="Optional context, medication, or underlying conditions"
                            maxLength={1000}
                        />
                        <p className="text-xs text-slate-500 mt-1">{form.notes.length}/1000 characters</p>
                    </div>

                    {error ? (
                        <p className="text-sm text-rose-700 inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {error}</p>
                    ) : null}

                    <button
                        type="submit"
                        disabled={submitting}
                        className="inline-flex items-center gap-2 rounded-md bg-cyan-700 hover:bg-cyan-800 text-white px-4 py-2 disabled:opacity-60"
                    >
                        {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                        Analyze Symptoms
                    </button>
                </form>
            </div>

            {analysis ? (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-3">
                    <h4 className="text-base font-semibold text-slate-900 inline-flex items-center gap-2"><Stethoscope className="h-4 w-4 text-cyan-700" /> Latest Analysis</h4>
                    <div>
                        <span className={`text-xs px-2 py-1 rounded-full ${urgencyClassName(analysis.urgency)}`}>
                            Urgency: {analysis.urgency || "medium"}
                        </span>
                    </div>
                    <p className="text-sm text-slate-700"><span className="font-medium">Possible concerns:</span> {(analysis.possibleConcerns || []).join(", ") || "No specific concerns returned"}</p>
                    <p className="text-sm text-slate-700"><span className="font-medium">Recommended specialty:</span> {analysis.recommendedSpecialty || "General Physician (General Practitioner)"}</p>
                    <p className="text-sm text-slate-700"><span className="font-medium">Advice:</span> {analysis.advice || "No advice returned"}</p>
                    <p className="text-xs text-slate-500 inline-flex items-start gap-1"><ShieldAlert className="h-3.5 w-3.5 mt-0.5" /> {analysis.disclaimer || "This is not a medical diagnosis. Seek professional medical advice."}</p>
                </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <h4 className="text-base font-semibold text-slate-900">Recent Symptom Analysis History</h4>
                {loadingHistory ? (
                    <p className="text-sm text-slate-600 mt-2 inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading history...</p>
                ) : (
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                        {historyItems.length === 0 ? (
                            <li className="text-slate-500">No past analyses yet.</li>
                        ) : (
                            historyItems.map((item) => (
                                <li key={item._id} className="border border-slate-200 rounded-md p-3 bg-slate-50">
                                    <p className="font-medium">{item.symptoms}</p>
                                    <p className="text-xs text-slate-600 mt-1">Urgency: {item.urgency || "medium"} | Specialty: {item.recommendedSpecialty || "N/A"}</p>
                                    <p className="text-xs text-slate-500 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                                </li>
                            ))
                        )}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default SymptomChecker;
