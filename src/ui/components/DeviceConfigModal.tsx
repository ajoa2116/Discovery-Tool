import React, { useState, useEffect } from 'react';
import { Device, OnvifCustomConfig } from '../../types/index.ts';
import {
  X,
  Sliders,
  Video,
  Sun,
  Navigation,
  Clock,
  Shield,
  Cpu,
  Check,
  RefreshCw,
  Eye,
  Zap,
} from 'lucide-react';

interface DeviceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  device: Device | null;
  onSave: (mac: string, config: { onvifConfig: OnvifCustomConfig; manufacturerParams: Record<string, any> }) => Promise<void>;
}

export const DeviceConfigModal: React.FC<DeviceConfigModalProps> = ({
  isOpen,
  onClose,
  device,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'STREAM' | 'IMAGING' | 'PTZ' | 'TIME_SEC' | 'VENDOR'>('STREAM');
  const [onvifConfig, setOnvifConfig] = useState<OnvifCustomConfig | null>(null);
  const [manufacturerParams, setManufacturerParams] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [ptzMessage, setPtzMessage] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      if (device.onvifConfig) {
        setOnvifConfig(JSON.parse(JSON.stringify(device.onvifConfig)));
      }
      if (device.manufacturerParams) {
        setManufacturerParams(JSON.parse(JSON.stringify(device.manufacturerParams)));
      }
    }
  }, [device]);

  if (!isOpen || !device || !onvifConfig) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(device.anchor.macAddress, {
        onvifConfig,
        manufacturerParams,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePtzMove = async (pan: number, tilt: number, zoom: number) => {
    try {
      const res = await fetch(`http://localhost:3001/api/device/${device.anchor.macAddress}/ptz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pan, tilt, zoom }),
      });
      const data = await res.json();
      setPtzMessage(`PTZ Vector dispatched: Pan ${pan}, Tilt ${tilt}, Zoom ${zoom}`);
      setTimeout(() => setPtzMessage(null), 3000);
    } catch (err) {
      console.error(err);
    }
  };

  const mainStream = onvifConfig.videoProfiles[0] || {
    name: 'MainStream',
    token: 'Profile_01',
    codec: 'H.265',
    resolution: '3840x2160 (4K)',
    framerate: 30,
    bitrateKbps: 8192,
    bitrateMode: 'VBR',
    rtspUri: `rtsp://${device.network.ipAddress}:554/stream1`,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-sm">ONVIF Studio & Protocol Driver Configuration</h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-sky-400">
                  {device.network.protocol}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Anchor: <span className="font-mono text-slate-200">{device.anchor.macAddress}</span> | {device.anchor.vendor} ({device.anchor.model})
              </p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 px-4 gap-2 text-xs">
          <button
            onClick={() => setActiveTab('STREAM')}
            className={`py-3 px-3.5 font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'STREAM'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Video className="w-4 h-4" />
            Video Stream (Profile S/T)
          </button>

          <button
            onClick={() => setActiveTab('IMAGING')}
            className={`py-3 px-3.5 font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'IMAGING'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sun className="w-4 h-4" />
            Imaging & Sensors
          </button>

          <button
            onClick={() => setActiveTab('PTZ')}
            className={`py-3 px-3.5 font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'PTZ'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Navigation className="w-4 h-4" />
            PTZ Controls
          </button>

          <button
            onClick={() => setActiveTab('TIME_SEC')}
            className={`py-3 px-3.5 font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'TIME_SEC'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Time & Security
          </button>

          <button
            onClick={() => setActiveTab('VENDOR')}
            className={`py-3 px-3.5 font-semibold border-b-2 flex items-center gap-1.5 transition ${
              activeTab === 'VENDOR'
                ? 'border-sky-400 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Manufacturer Native API
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* TAB 1: VIDEO STREAM */}
          {activeTab === 'STREAM' && (
            <div className="space-y-4">
              <div className="p-3 bg-sky-950/20 border border-sky-500/30 rounded-lg text-sky-300">
                Configure Profile S / Profile T RTSP streams, dynamic video compression, and resolution presets.
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Compression Codec</label>
                  <select
                    value={mainStream.codec}
                    onChange={(e) => {
                      const updated = { ...mainStream, codec: e.target.value as any };
                      setOnvifConfig({ ...onvifConfig, videoProfiles: [updated, ...onvifConfig.videoProfiles.slice(1)] });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200"
                  >
                    <option value="H.265">H.265 (HEVC High Efficiency)</option>
                    <option value="H.264">H.264 (AVC Standard Compatibility)</option>
                    <option value="MJPEG">MJPEG (Motion JPEG)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Resolution Preset</label>
                  <select
                    value={mainStream.resolution}
                    onChange={(e) => {
                      const updated = { ...mainStream, resolution: e.target.value as any };
                      setOnvifConfig({ ...onvifConfig, videoProfiles: [updated, ...onvifConfig.videoProfiles.slice(1)] });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200"
                  >
                    <option value="3840x2160 (4K)">3840x2160 (4K Ultra HD)</option>
                    <option value="2560x1440 (2K)">2560x1440 (2K Quad HD)</option>
                    <option value="1920x1080 (1080p)">1920x1080 (1080p Full HD)</option>
                    <option value="1280x720 (720p)">1280x720 (720p HD)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Framerate (FPS)</label>
                  <input
                    type="number"
                    value={mainStream.framerate}
                    onChange={(e) => {
                      const updated = { ...mainStream, framerate: Number(e.target.value) };
                      setOnvifConfig({ ...onvifConfig, videoProfiles: [updated, ...onvifConfig.videoProfiles.slice(1)] });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 font-mono text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Bitrate Limit (Kbps)</label>
                  <input
                    type="number"
                    value={mainStream.bitrateKbps}
                    onChange={(e) => {
                      const updated = { ...mainStream, bitrateKbps: Number(e.target.value) };
                      setOnvifConfig({ ...onvifConfig, videoProfiles: [updated, ...onvifConfig.videoProfiles.slice(1)] });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 font-mono text-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Bitrate Mode</label>
                  <select
                    value={mainStream.bitrateMode}
                    onChange={(e) => {
                      const updated = { ...mainStream, bitrateMode: e.target.value as any };
                      setOnvifConfig({ ...onvifConfig, videoProfiles: [updated, ...onvifConfig.videoProfiles.slice(1)] });
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200"
                  >
                    <option value="VBR">VBR (Variable Bitrate)</option>
                    <option value="CBR">CBR (Constant Bitrate)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">RTSP Stream URI</label>
                <input
                  type="text"
                  readOnly
                  value={mainStream.rtspUri}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 font-mono text-slate-300 text-[11px]"
                />
              </div>
            </div>
          )}

          {/* TAB 2: IMAGING & SENSORS */}
          {activeTab === 'IMAGING' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white">Wide Dynamic Range (WDR / Forensic Capture)</h4>
                    <p className="text-slate-400 text-[11px]">Compensates for severe backlighting and high contrast scenes.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={onvifConfig.imaging.wdrEnabled}
                    onChange={(e) =>
                      setOnvifConfig({
                        ...onvifConfig,
                        imaging: { ...onvifConfig.imaging, wdrEnabled: e.target.checked },
                      })
                    }
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                </div>

                {onvifConfig.imaging.wdrEnabled && (
                  <div className="pt-2">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>WDR Level</span>
                      <span className="font-mono text-sky-400 font-bold">{onvifConfig.imaging.wdrLevel}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={onvifConfig.imaging.wdrLevel}
                      onChange={(e) =>
                        setOnvifConfig({
                          ...onvifConfig,
                          imaging: { ...onvifConfig.imaging, wdrLevel: Number(e.target.value) },
                        })
                      }
                      className="w-full accent-sky-500"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="font-bold text-white">Day / Night IR Cut Mode</h4>
                  <select
                    value={onvifConfig.imaging.dayNightMode}
                    onChange={(e) =>
                      setOnvifConfig({
                        ...onvifConfig,
                        imaging: { ...onvifConfig.imaging, dayNightMode: e.target.value as any },
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                  >
                    <option value="AUTO">AUTO (Photocell Trigger)</option>
                    <option value="DAY">DAY (Color Forced)</option>
                    <option value="NIGHT">NIGHT (B&W Infrared Forced)</option>
                  </select>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                  <h4 className="font-bold text-white">Backlight Compensation (BLC)</h4>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-slate-400">Enable BLC Mask</span>
                    <input
                      type="checkbox"
                      checked={onvifConfig.imaging.backlightCompensation}
                      onChange={(e) =>
                        setOnvifConfig({
                          ...onvifConfig,
                          imaging: { ...onvifConfig.imaging, backlightCompensation: e.target.checked },
                        })
                      }
                      className="w-4 h-4 accent-sky-500 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PTZ CONTROLS */}
          {activeTab === 'PTZ' && (
            <div className="space-y-4">
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center space-y-4">
                <h4 className="font-bold text-white">Continuous Pan / Tilt / Zoom Studio</h4>
                
                {/* D-Pad */}
                <div className="grid grid-cols-3 gap-2 w-48">
                  <div />
                  <button
                    onClick={() => handlePtzMove(0, 1, 0)}
                    className="p-3 bg-slate-800 hover:bg-sky-600 rounded-lg text-white font-bold text-center transition"
                  >
                    ▲
                  </button>
                  <div />

                  <button
                    onClick={() => handlePtzMove(-1, 0, 0)}
                    className="p-3 bg-slate-800 hover:bg-sky-600 rounded-lg text-white font-bold text-center transition"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => handlePtzMove(0, 0, 0)}
                    className="p-3 bg-slate-900 border border-slate-700 hover:bg-slate-700 rounded-lg text-slate-300 font-bold text-center transition text-[10px]"
                  >
                    STOP
                  </button>
                  <button
                    onClick={() => handlePtzMove(1, 0, 0)}
                    className="p-3 bg-slate-800 hover:bg-sky-600 rounded-lg text-white font-bold text-center transition"
                  >
                    ▶
                  </button>

                  <div />
                  <button
                    onClick={() => handlePtzMove(0, -1, 0)}
                    className="p-3 bg-slate-800 hover:bg-sky-600 rounded-lg text-white font-bold text-center transition"
                  >
                    ▼
                  </button>
                  <div />
                </div>

                {/* Zoom Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handlePtzMove(0, 0, 1)}
                    className="px-4 py-2 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-bold transition flex items-center gap-1"
                  >
                    Zoom IN (+)
                  </button>
                  <button
                    onClick={() => handlePtzMove(0, 0, -1)}
                    className="px-4 py-2 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-bold transition flex items-center gap-1"
                  >
                    Zoom OUT (-)
                  </button>
                </div>

                {ptzMessage && (
                  <div className="text-emerald-400 font-mono text-xs animate-pulse">
                    {ptzMessage}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TIME & SECURITY */}
          {activeTab === 'TIME_SEC' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">NTP Server Sync Target</label>
                  <input
                    type="text"
                    value={onvifConfig.ntpServer}
                    onChange={(e) => setOnvifConfig({ ...onvifConfig, ntpServer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-semibold mb-1">Timezone Offset</label>
                  <input
                    type="text"
                    value={onvifConfig.timezone}
                    onChange={(e) => setOnvifConfig({ ...onvifConfig, timezone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-200"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  WS-Security & Transport Encryption
                </h4>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-slate-400 mb-1">WS-Security Auth Token Mode</label>
                    <select
                      value={onvifConfig.wsSecurityMode}
                      onChange={(e) => setOnvifConfig({ ...onvifConfig, wsSecurityMode: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200"
                    >
                      <option value="DIGEST">UsernameToken (SHA-1 / SHA-256 Digest)</option>
                      <option value="MUTUAL_TLS">Mutual TLS (mTLS Certificate Binding)</option>
                      <option value="PLAINTEXT">Plaintext (Legacy Non-Encrypted)</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <span className="text-slate-400">Enforce HTTPS Only</span>
                    <input
                      type="checkbox"
                      checked={onvifConfig.httpsMandatory}
                      onChange={(e) => setOnvifConfig({ ...onvifConfig, httpsMandatory: e.target.checked })}
                      className="w-4 h-4 accent-sky-500 rounded"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: MANUFACTURER NATIVE API */}
          {activeTab === 'VENDOR' && (
            <div className="space-y-3">
              <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-lg text-purple-300">
                Native protocol parameters decoded via manufacturer driver for <span className="font-bold text-white">{device.anchor.vendor}</span>.
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2 font-mono">
                {Object.entries(manufacturerParams).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between border-b border-slate-900 py-1.5 text-xs">
                    <span className="text-slate-400">{k}:</span>
                    <span className="text-emerald-400 font-bold">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 transition shadow-md shadow-sky-950/50"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Applying to Device...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Apply Parameters & Persist
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
