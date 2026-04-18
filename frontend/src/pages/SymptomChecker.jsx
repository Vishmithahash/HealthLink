import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertTriangle, Bot, LoaderCircle, ShieldAlert, Stethoscope, X } from "lucide-react";
import { analyzeSymptoms, getSymptomHistory, getSymptomRecordById } from "../services/aiService";
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

const prettyValue = (value, fallback = "Not provided") => {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }
    return String(value);
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
    const [selectedHistoryRecord, setSelectedHistoryRecord] = useState(null);
    const [historyModalOpen, setHistoryModalOpen] = useState(false);
    const [loadingHistoryDetail, setLoadingHistoryDetail] = useState(false);
    const [historyDetailError, setHistoryDetailError] = useState("");
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

    useEffect(() => {
        if (!historyModalOpen) {
            return;
        }

        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previous;
        };
    }, [historyModalOpen]);

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

    const closeHistoryModal = () => {
        setHistoryModalOpen(false);
        setHistoryDetailError("");
        setSelectedHistoryRecord(null);
    };

    const openHistoryModal = async (item) => {
        if (!item?._id) {
            return;
        }

        setHistoryModalOpen(true);
        setHistoryDetailError("");
        setSelectedHistoryRecord(item);
        setLoadingHistoryDetail(true);

        try {
            const record = await getSymptomRecordById(item._id);
            setSelectedHistoryRecord(record || item);
        } catch (err) {
            setSelectedHistoryRecord(item);
            setHistoryDetailError(extractErrorMessage(err, "Could not load full details for this symptom analysis."));
        } finally {
            setLoadingHistoryDetail(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-center text-center">
                    <h3 className="text-lg font-semibold inline-flex items-center gap-2"><Bot className="h-5 w-5 text-cyan-300" /> AI Symptom Checker</h3>
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
                    <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-teal-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <p className="text-xs uppercase tracking-wide text-cyan-700 font-semibold">AI Response</p>
                                <p className="text-sm text-slate-700 mt-1">Suggested specialty: <span className="font-semibold text-slate-900">{analysis.recommendedSpecialty || "General Physician (General Practitioner)"}</span></p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-full h-fit ${urgencyClassName(analysis.urgency)}`}>
                                Urgency: {analysis.urgency || "medium"}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Possible Concerns</p>
                                {(analysis.possibleConcerns || []).length > 0 ? (
                                    <ul className="mt-2 list-disc pl-5 space-y-1">
                                        {(analysis.possibleConcerns || []).map((concern, index) => (
                                            <li key={`${concern}-${index}`} className="text-sm text-slate-700 leading-6">{concern}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-sm text-slate-600 mt-2">No specific concerns returned.</p>
                                )}
                            </div>

                            <div className="rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-xs text-slate-500 uppercase tracking-wide">Advice</p>
                                <p className="text-sm text-slate-700 mt-2 leading-relaxed">{analysis.advice || "No advice returned"}</p>
                            </div>
                        </div>

                        <p className="text-xs text-slate-500 inline-flex items-start gap-1 mt-3"><ShieldAlert className="h-3.5 w-3.5 mt-0.5" /> {analysis.disclaimer || "This is not a medical diagnosis. Seek professional medical advice."}</p>
                    </div>
                </div>
            ) : null}

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="text-base font-semibold text-slate-900">Recent Symptom Analysis History</h4>
                        <p className="text-xs text-slate-500 mt-1">Click any entry to open complete patient inputs and AI details.</p>
                    </div>
                    <span className="text-xs font-medium rounded-full px-2.5 py-1 bg-slate-100 text-slate-700">
                        {historyItems.length} recent records
                    </span>
                </div>
                {loadingHistory ? (
                    <p className="text-sm text-slate-600 mt-2 inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading history...</p>
                ) : (
                    <ul className="mt-4 space-y-3 text-sm text-slate-700">
                        {historyItems.length === 0 ? (
                            <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-slate-500 text-center">No past analyses yet.</li>
                        ) : (
                            historyItems.map((item, index) => (
                                <li key={item._id}>
                                    <button
                                        type="button"
                                        onClick={() => openHistoryModal(item)}
                                        className="w-full text-left rounded-xl border border-slate-200 p-4 bg-gradient-to-r from-slate-50 to-white hover:from-cyan-50 hover:to-white hover:border-cyan-300 transition shadow-sm hover:shadow"
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-800 text-xs font-semibold">
                                                    {index + 1}
                                                </span>
                                                <span className={`text-xs px-2 py-1 rounded-full ${urgencyClassName(item.urgency)}`}>
                                                    Urgency: {item.urgency || "medium"}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
                                        </div>

                                        <p className="font-medium text-slate-900 mt-2 line-clamp-2">{item.symptoms}</p>

                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                            <span className="text-xs rounded-full px-2 py-1 bg-slate-100 text-slate-700">
                                                Specialty: {item.recommendedSpecialty || "N/A"}
                                            </span>
                                            <span className="text-xs rounded-full px-2 py-1 bg-cyan-50 text-cyan-700 border border-cyan-100">
                                                View details
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            ))
                        )}
                    </ul>
                )}
            </div>

            {historyModalOpen ? createPortal(
                <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] overflow-y-auto p-4"
                    onClick={closeHistoryModal}
                >
                    <div
                        className="w-full max-w-2xl max-h-[88vh] my-8 mx-auto rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50">
                            <div>
                                <h4 className="text-base font-semibold text-slate-900">Symptom Analysis Details</h4>
                                <p className="text-xs text-slate-600 mt-1">Complete patient input and AI recommendation details.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeHistoryModal}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                            >
                                <X className="h-4 w-4" />
                                Close
                            </button>
                        </div>

                        <div className="p-5 space-y-4 overflow-y-auto max-h-[calc(88vh-74px)]">
                            {loadingHistoryDetail ? (
                                <p className="text-sm text-slate-600 inline-flex items-center gap-2"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading full record...</p>
                            ) : null}

                            {historyDetailError ? (
                                <p className="text-sm text-amber-700 inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> {historyDetailError}</p>
                            ) : null}

                            {selectedHistoryRecord ? (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">Patient Input</p>
                                            <p className="text-sm text-slate-700 mt-2"><span className="font-medium">Symptoms:</span> {prettyValue(selectedHistoryRecord.symptoms)}</p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Age:</span> {prettyValue(selectedHistoryRecord.age)}</p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Gender:</span> {prettyValue(selectedHistoryRecord.gender)}</p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Duration:</span> {prettyValue(selectedHistoryRecord.duration)}</p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Severity:</span> {prettyValue(selectedHistoryRecord.severity)}</p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Notes:</span> {prettyValue(selectedHistoryRecord.notes)}</p>
                                        </div>

                                        <div className="rounded-lg border border-slate-200 p-3 bg-cyan-50/50">
                                            <p className="text-xs uppercase tracking-wide text-slate-500">AI Recommendation</p>
                                            <p className="text-sm text-slate-700 mt-2"><span className="font-medium">Recommended Specialty:</span> {prettyValue(selectedHistoryRecord.recommendedSpecialty, "N/A")}</p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Urgency:</span> <span className={`text-xs px-2 py-1 rounded-full ${urgencyClassName(selectedHistoryRecord.urgency)}`}>{prettyValue(selectedHistoryRecord.urgency, "medium")}</span></p>
                                            <p className="text-sm text-slate-700 mt-1"><span className="font-medium">Advice:</span> {prettyValue(selectedHistoryRecord.advice, "No advice available")}</p>
                                            <div className="mt-2">
                                                <p className="text-sm font-medium text-slate-700">Possible Concerns:</p>
                                                {(selectedHistoryRecord.possibleConcerns || []).length > 0 ? (
                                                    <ul className="mt-1 list-disc pl-5 space-y-1">
                                                        {(selectedHistoryRecord.possibleConcerns || []).map((concern, index) => (
                                                            <li key={`${concern}-${index}`} className="text-sm text-slate-700 leading-6">{concern}</li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-sm text-slate-600 mt-1">No concerns listed.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-500 inline-flex items-start gap-1"><ShieldAlert className="h-3.5 w-3.5 mt-0.5" /> {selectedHistoryRecord.disclaimer || "This is not a medical diagnosis. Seek professional medical advice."}</p>
                                    <p className="text-xs text-slate-500">Created at: {selectedHistoryRecord.createdAt ? new Date(selectedHistoryRecord.createdAt).toLocaleString() : "N/A"}</p>
                                </>
                            ) : loadingHistoryDetail ? null : (
                                <p className="text-sm text-slate-600">No symptom detail found for this record.</p>
                            )}

                            <div className="pt-1">
                                <button
                                    type="button"
                                    onClick={closeHistoryModal}
                                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-3 py-2 text-sm text-white hover:bg-slate-900"
                                >
                                    <X className="h-4 w-4" />
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                , document.body
            ) : null}
        </div>
    );
};

export default SymptomChecker;
