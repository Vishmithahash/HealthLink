import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { AlertCircle, ArrowLeft, LoaderCircle, PhoneOff, Video } from 'lucide-react';
import { extractErrorMessage } from '../services/api';
import { getAppointmentById } from '../services/appointmentService';
import {
    createSession,
    endTelemedicineSession,
    getSessionByAppointment,
    startTelemedicineSession
} from '../services/telemedicineService';
import { getUserInfo } from '../utils/auth';
import { getPatientById } from '../services/patientService';

const formatRemainingTime = (milliseconds) => {
    const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }

    return `${minutes}m`;
};

const getConsultationJoinAvailability = (appointment) => {
    const status = String(appointment?.status || '').toLowerCase();
    if (!status || !['confirmed', 'completed'].includes(status)) {
        return {
            canJoin: false,
            message: `Consultation is not joinable while appointment status is ${status || 'unknown'}.`
        };
    }

    const scheduledAt = appointment?.scheduledAt ? new Date(appointment.scheduledAt) : null;
    if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
        return {
            canJoin: false,
            message: 'Consultation start time is unavailable for this appointment.'
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
        message: ''
    };
};

const VideoConsultation = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const user = getUserInfo();
    const [loading, setLoading] = useState(true);
    const [ending, setEnding] = useState(false);
    const [error, setError] = useState('');
    const [session, setSession] = useState(null);
    const [patientContact, setPatientContact] = useState(null);

    const appointmentId = id;

    const domain = useMemo(() => {
        if (!session?.meetingUrl) {
            return 'meet.jit.si';
        }

        try {
            return new URL(session.meetingUrl).hostname;
        } catch {
            return 'meet.jit.si';
        }
    }, [session?.meetingUrl]);

    const loadSession = async () => {
        if (!appointmentId) {
            setError('Missing appointment ID for consultation.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        try {
            let resolvedSession;
            const appointment = await getAppointmentById(appointmentId).catch(() => null);

            if (!appointment) {
                throw new Error('Appointment details are unavailable for this consultation.');
            }

            const joinAvailability = getConsultationJoinAvailability(appointment);
            if (!joinAvailability.canJoin) {
                throw new Error(joinAvailability.message || 'Consultation cannot be joined at this time.');
            }

            try {
                resolvedSession = await getSessionByAppointment(appointmentId);
            } catch (sessionError) {
                if (sessionError?.response?.status !== 404) {
                    throw sessionError;
                }

                resolvedSession = await createSession({
                    appointmentId,
                    patientId: appointment?.patientId,
                    doctorId: appointment?.doctorId
                });
            }

            if (appointment?.patientId) {
                const patient = await getPatientById(appointment.patientId).catch(() => null);
                setPatientContact(patient || null);
            }

            if (resolvedSession?._id && resolvedSession.status !== 'completed') {
                const startedSession = await startTelemedicineSession(resolvedSession._id).catch(() => resolvedSession);
                setSession(startedSession || resolvedSession);
            } else {
                setSession(resolvedSession);
            }
        } catch (err) {
            setError(extractErrorMessage(err, 'Could not load telemedicine session'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSession();
    }, [appointmentId]);

    const handleLeave = async () => {
        navigate(-1);
    };

    const handleEndAndLeave = async () => {
        if (!session?._id) {
            navigate(-1);
            return;
        }

        setEnding(true);
        setError('');

        try {
            await endTelemedicineSession(session._id, {
                appointmentId,
                patientName: patientContact?.fullName || undefined,
                doctorName: user?.fullName || undefined,
                patientPhone: patientContact?.phone || undefined,
                doctorPhone: user?.phoneNumber || undefined,
                doctorEmail: user?.email || undefined,
                message: 'Your telemedicine consultation has been completed.'
            });
            navigate(-1);
        } catch (err) {
            setError(extractErrorMessage(err, 'Could not end consultation'));
        } finally {
            setEnding(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[65vh] text-slate-600 gap-2">
                <LoaderCircle className="h-5 w-5 animate-spin" /> Loading consultation room...
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-white border border-rose-200 text-rose-700 rounded-xl p-4 inline-flex items-center gap-2">
                <AlertCircle className="h-5 w-5" /> {error}
            </div>
        );
    }

    if (!session?.roomName) {
        return (
            <div className="bg-white border border-slate-200 text-slate-700 rounded-xl p-4">
                Session details are not available for this consultation.
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[85vh] bg-slate-50 relative rounded-2xl overflow-hidden shadow-lg border border-slate-200 animate-fade-in">
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shadow-sm z-10">
                <div className="flex items-center space-x-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                        <Video className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Secure Telemedicine Session</h2>
                        <p className="text-sm font-medium text-slate-500 flex items-center">
                            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse"></span>
                            Live room: {session.roomName}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLeave}
                        className="flex items-center text-sm font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-md transition-shadow shadow-sm hover:shadow"
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Leave
                    </button>
                    {user?.roleKey === 'doctor' ? (
                        <button
                            onClick={handleEndAndLeave}
                            disabled={ending || session.status === 'completed'}
                            className="flex items-center text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-400 px-4 py-2 rounded-md transition-shadow shadow-sm hover:shadow"
                        >
                            <PhoneOff className="h-4 w-4 mr-2" /> {ending ? 'Ending...' : 'End Session'}
                        </button>
                    ) : null}
                </div>
            </div>

            <div className="flex-1 w-full bg-slate-900 relative">
                <JitsiMeeting
                    domain={domain}
                    roomName={session.roomName}
                    configOverwrite={{
                        startWithAudioMuted: false,
                        disableModeratorIndicator: true,
                        startScreenSharing: true,
                        enableEmailInStats: false
                    }}
                    interfaceConfigOverwrite={{
                        DISABLE_JOIN_LEAVE_NOTIFICATIONS: true
                    }}
                    userInfo={{
                        displayName: user?.fullName || 'HealthLink User'
                    }}
                    getIFrameRef={(iframeRef) => {
                        iframeRef.style.height = '100%';
                        iframeRef.style.width = '100%';
                        iframeRef.style.border = 'none';
                    }}
                />
            </div>
        </div>
    );
};

export default VideoConsultation;
