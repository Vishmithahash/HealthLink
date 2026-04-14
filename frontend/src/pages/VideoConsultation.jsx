import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { JitsiMeeting } from '@jitsi/react-sdk';
import { ArrowLeft, Video } from 'lucide-react';

const VideoConsultation = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    // Ensure a unique but consistent room name based on the appointment ID
    const roomName = `HealthConnect_Consultation_Room_${id || Math.floor(Math.random() * 1000)}`;

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
                            Live • Secure P2P Connection
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center text-sm font-bold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-md transition-shadow shadow-sm hover:shadow"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" /> Leave Session
                </button>
            </div>

            <div className="flex-1 w-full bg-slate-900 relative">
                <JitsiMeeting
                    domain="meet.jit.si"
                    roomName={roomName}
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
                        displayName: 'HealthConnect User'
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
