import { useState, useEffect, useRef } from 'react';
import { 
  Terminal, Activity, Cpu, Keyboard, MousePointer2, Settings, Wifi, 
  Monitor, Video, VideoOff, ShieldCheck, Sparkles, Send, Play, 
  CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw, Lock,
  Camera, Ban
} from 'lucide-react';
import './index.css';

const SERVER_URL = `http://${window.location.hostname}:8000`;

function App() {
  // State Server & Perangkat
  const [devices, setDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [serverHealth, setServerHealth] = useState({
    status: 'connecting',
    auth_enabled: false,
    has_screenshot: false,
    connected_count: 0
  });

  // State Web Companion Screen Sharing & Host Helper Preview
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [companionPreview, setCompanionPreview] = useState(null);
  const [hostHelperPreview, setHostHelperPreview] = useState(null);
  const [hostHelperMetadata, setHostHelperMetadata] = useState(null);
  const [captureStats, setCaptureStats] = useState({ count: 0, lastTime: null });

  // State AI Planner
  const [promptInput, setPromptInput] = useState('Buka kalkulator dan hitung 25 + 75');
  const [isPlanning, setIsPlanning] = useState(false);
  const [aiPlan, setAiPlan] = useState(null);
  const [planError, setPlanError] = useState(null);

  // State Eksekusi Rencana
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);

  // State Feedback Aksi Manual
  const [lastAction, setLastAction] = useState(null);

  // State Observation Queue (Tahap 3C)
  const [observationTask, setObservationTask] = useState(null);
  const [isRequestingObs, setIsRequestingObs] = useState(false);
  const [obsError, setObsError] = useState(null);
  const [isCancellingObs, setIsCancellingObs] = useState(false);
  const observationPollTimerRef = useRef(null);
  const activeTaskIdRef = useRef(null);

  // State Autentikasi Tab Browser (sessionStorage)
  const [apiKey, setApiKey] = useState(() => {
    try {
      return sessionStorage.getItem('bursa_api_key') || '';
    } catch (e) {
      return '';
    }
  });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState('');
  const [authError, setAuthError] = useState(false);
  const apiKeyRef = useRef(apiKey);
  apiKeyRef.current = apiKey;

  const getAuthHeaders = (extraHeaders = {}) => {
    const headers = { ...extraHeaders };
    const currentKey = apiKeyRef.current;
    if (currentKey) {
      headers['x-bursa-key'] = currentKey;
    }
    return headers;
  };

  const handleSaveKey = () => {
    try {
      sessionStorage.setItem('bursa_api_key', tempKey.trim());
    } catch (e) {}
    setApiKey(tempKey.trim());
    setAuthError(false);
    setShowKeyModal(false);
    setLastAction('Kunci akses disimpan di memori sesi.');
    setTimeout(() => setLastAction(null), 3000);
  };

  const handleClearKey = () => {
    try {
      sessionStorage.removeItem('bursa_api_key');
    } catch (e) {}
    setApiKey('');
    setTempKey('');
    setAuthError(false);
    setShowKeyModal(false);
    setLastAction('Kunci akses dibersihkan dari memori sesi.');
    setTimeout(() => setLastAction(null), 3000);
  };

  const streamRef = useRef(null);
  const videoRef = useRef(null);
  const captureIntervalRef = useRef(null);
  const isSharingScreenRef = useRef(false);
  const lastFetchedTimestampRef = useRef(null);
  const isFetchingScreenshotRef = useRef(false);
  const screenshotRequestIdRef = useRef(0);

  // 1. Polling Status Server, Perangkat & Screenshot Host Helper
  const checkHealthAndDevices = async () => {
    try {
      const [healthRes, devicesRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/health`),
        fetch(`${SERVER_URL}/api/devices`, { headers: getAuthHeaders() })
      ]);

      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setServerHealth({
          status: 'online',
          auth_enabled: healthData.auth_enabled,
          has_screenshot: healthData.has_screenshot,
          connected_count: healthData.connected_count
        });

        // Ambil screenshot Host Helper jika tersedia dan Web Companion sedang tidak aktif
        if (healthData.has_screenshot && !isSharingScreenRef.current) {
          if (!isFetchingScreenshotRef.current) {
            isFetchingScreenshotRef.current = true;
            const reqId = ++screenshotRequestIdRef.current;
            try {
              const screenRes = await fetch(`${SERVER_URL}/api/screenshot/latest`, { headers: getAuthHeaders() });
              if (screenRes.status === 401) {
                setAuthError(true);
              }
              if (reqId === screenshotRequestIdRef.current) {
                if (screenRes.ok) {
                  const screenData = await screenRes.json();
                  const b64 = screenData.image_base64;
                  if (typeof b64 === 'string' && (b64.startsWith('data:image/jpeg') || b64.startsWith('data:image/png') || b64.startsWith('data:image/webp'))) {
                    if (screenData.timestamp !== lastFetchedTimestampRef.current) {
                      lastFetchedTimestampRef.current = screenData.timestamp;
                      setHostHelperPreview(b64);
                      setHostHelperMetadata({
                        source: screenData.source || 'Host_Helper',
                        timestamp: screenData.timestamp,
                        width: screenData.width || 0,
                        height: screenData.height || 0
                      });
                    }
                  }
                } else if (screenRes.status === 404) {
                  lastFetchedTimestampRef.current = null;
                  setHostHelperPreview(null);
                  setHostHelperMetadata(null);
                }
              }
            } catch (err) {
              // Abaikan kegagalan jaringan sementara tanpa membanjiri console
            } finally {
              isFetchingScreenshotRef.current = false;
            }
          }
        } else if (!healthData.has_screenshot) {
          // Bersihkan screenshot Host Helper jika TTL kedaluwarsa atau server belum memilikinya
          if (lastFetchedTimestampRef.current !== null) {
            lastFetchedTimestampRef.current = null;
            setHostHelperPreview(null);
            setHostHelperMetadata(null);
          }
        }
      }

      if (devicesRes.status === 401) {
        setAuthError(true);
      } else if (devicesRes.ok) {
        setAuthError(false);
        const devData = await devicesRes.json();
        const devList = devData.devices || [];
        setDevices(devList);
        
        // Auto-select first dongle device if not selected
        if (!selectedDevice && devList.length > 0) {
          const firstDongle = devList.find(d => d.type === 'dongle') || devList[0];
          setSelectedDevice(firstDongle.id);
        }
      }
    } catch (error) {
      console.warn("Gagal terhubung ke server lokal BURSA:", error.message);
      setServerHealth(prev => ({ ...prev, status: 'error' }));
    }
  };

  useEffect(() => {
    checkHealthAndDevices();
    const interval = setInterval(checkHealthAndDevices, 2500);
    return () => clearInterval(interval);
  }, [selectedDevice]);

  // Cleanup stream & observation polling saat unmount
  useEffect(() => {
    return () => {
      stopScreenSharing();
      stopObservationPolling();
    };
  }, []);

  // 2. Web Companion Screen Sharing
  const startScreenSharing = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });

      streamRef.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      videoRef.current = video;

      isSharingScreenRef.current = true;
      setIsSharingScreen(true);
      setLastAction('Web Companion: Berbagi layar aktif.');

      stream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };

      const captureFrame = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const base64Data = canvas.toDataURL('image/jpeg', 0.6);
        setCompanionPreview(base64Data);

        try {
          await fetch(`${SERVER_URL}/api/screenshot`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              image_base64: base64Data,
              width: canvas.width,
              height: canvas.height,
              source: 'Web_Companion_Browser'
            })
          });

          setCaptureStats(prev => ({
            count: prev.count + 1,
            lastTime: new Date().toLocaleTimeString()
          }));
        } catch (err) {
          console.error('[Web Companion] Gagal mengirim tangkapan layar:', err);
        }
      };

      setTimeout(captureFrame, 500);
      captureIntervalRef.current = setInterval(captureFrame, 2500);

    } catch (err) {
      console.warn('[Web Companion] Izin berbagi layar dibatalkan:', err);
      setLastAction('Izin berbagi layar dibatalkan.');
      setTimeout(() => setLastAction(null), 3000);
    }
  };

  const stopScreenSharing = () => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    videoRef.current = null;
    isSharingScreenRef.current = false;
    setIsSharingScreen(false);
    setCompanionPreview(null);
    setLastAction('Web Companion: Berbagi layar dihentikan.');
    setTimeout(() => setLastAction(null), 3000);
  };

  // ============================================================
  // 2b. Observation Queue Actions & Polling (Tahap 3C)
  // ============================================================
  const stopObservationPolling = () => {
    if (observationPollTimerRef.current) {
      clearInterval(observationPollTimerRef.current);
      observationPollTimerRef.current = null;
    }
  };

  const fetchAndMatchScreenshot = async (taskId, retryCount = 0) => {
    try {
      const res = await fetch(`${SERVER_URL}/api/screenshot/latest`, { headers: getAuthHeaders() });
      if (res.status === 401) {
        setAuthError(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        // Verifikasi bahwa screenshot di server benar-benar memiliki task_id yang cocok persis
        if (data && data.task_id === taskId) {
          const b64 = data.image_base64;
          if (typeof b64 === 'string' && (b64.startsWith('data:image/jpeg') || b64.startsWith('data:image/png') || b64.startsWith('data:image/webp'))) {
            lastFetchedTimestampRef.current = data.timestamp;
            setHostHelperPreview(b64);
            setHostHelperMetadata({
              source: data.source || 'Host_Helper',
              timestamp: data.timestamp,
              width: data.width || 0,
              height: data.height || 0,
              task_id: data.task_id
            });
            setObservationTask(prev => (prev && prev.id === taskId) ? { ...prev, screenshot_matched: true } : prev);
            setLastAction(`Tangkapan layar untuk tugas ${taskId} berhasil ditampilkan.`);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('[ObsQueue] Gagal mengambil screenshot terbaru:', err);
    }

    // Jika belum cocok dan masih dalam batas percobaan (maksimal 3 kali retry dengan jeda 600ms)
    if (retryCount < 3 && activeTaskIdRef.current === taskId) {
      setTimeout(() => fetchAndMatchScreenshot(taskId, retryCount + 1), 600);
    } else if (activeTaskIdRef.current === taskId) {
      setObservationTask(prev => (prev && prev.id === taskId) ? {
        ...prev,
        screenshot_matched: false,
        error_message: prev.error_message || `Tugas selesai, namun tangkapan layar dengan ID ${taskId} belum cocok di server.`
      } : prev);
    }
  };

  const startPollingTask = (taskId) => {
    stopObservationPolling();
    activeTaskIdRef.current = taskId;

    const pollTaskStatus = async () => {
      if (activeTaskIdRef.current !== taskId) {
        stopObservationPolling();
        return;
      }

      try {
        const res = await fetch(`${SERVER_URL}/api/observation/tasks/${taskId}`, {
          headers: getAuthHeaders()
        });

        if (res.status === 401) {
          setAuthError(true);
          setObsError('Autentikasi ditolak (HTTP 401). Periksa kunci akses API.');
          stopObservationPolling();
          return;
        }

        if (res.status === 404) {
          setObsError('Tugas tidak ditemukan di server (kemungkinan server di-restart).');
          setObservationTask(prev => (prev && prev.id === taskId) ? {
            ...prev,
            status: 'failed',
            error_message: 'Tugas tidak ditemukan di server.'
          } : prev);
          stopObservationPolling();
          return;
        }

        if (res.ok) {
          const taskData = await res.json();
          setObservationTask(prev => (prev && prev.id === taskId) ? {
            ...prev,
            status: taskData.status,
            started_at: taskData.started_at,
            completed_at: taskData.completed_at,
            error_message: taskData.error_message,
            result_metadata: taskData.result_metadata
          } : prev);

          // Hentikan polling jika sudah mencapai status terminal
          if (taskData.status === 'completed') {
            stopObservationPolling();
            fetchAndMatchScreenshot(taskId);
          } else if (taskData.status === 'failed') {
            stopObservationPolling();
            setLastAction(`Tugas observasi ${taskId} gagal: ${taskData.error_message || 'Batas waktu habis'}`);
          } else if (taskData.status === 'cancelled') {
            stopObservationPolling();
            setLastAction(`Tugas observasi ${taskId} dibatalkan.`);
          }
        }
      } catch (err) {
        console.warn('[ObsQueue] Gangguan jaringan saat polling status tugas:', err.message);
      }
    };

    pollTaskStatus();
    observationPollTimerRef.current = setInterval(pollTaskStatus, 1000);
  };

  const requestObservation = async () => {
    if (isRequestingObs) return;
    if (observationTask && ['queued', 'running'].includes(observationTask.status)) {
      setLastAction('Tugas observasi sebelumnya masih berlangsung. Mohon tunggu.');
      return;
    }

    setIsRequestingObs(true);
    setObsError(null);

    try {
      const res = await fetch(`${SERVER_URL}/api/observation/request`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ requested_by: 'dashboard' })
      });

      if (res.status === 401) {
        setAuthError(true);
        setObsError('Autentikasi ditolak (HTTP 401). Silakan atur Kunci Akses API.');
        return;
      }
      if (res.status === 503) {
        setObsError('Layanan tidak tersedia (HTTP 503): Server dalam mode fail-closed.');
        return;
      }
      if (res.status === 429) {
        setObsError('Antrean observasi penuh (HTTP 429). Tunggu tugas yang ada selesai.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const taskId = data.task_id;
        setObservationTask({
          id: taskId,
          status: 'queued',
          queue_position: data.queue_position || 1,
          created_at: data.created_at || new Date().toISOString(),
          started_at: null,
          completed_at: null,
          error_message: null,
          screenshot_matched: false
        });
        setLastAction(`Permintaan observasi ${taskId} masuk antrean.`);
        startPollingTask(taskId);
      } else {
        const errData = await res.json().catch(() => ({}));
        setObsError(errData.message || errData.error || `Permintaan gagal (HTTP ${res.status}).`);
      }
    } catch (err) {
      setObsError(`Gagal menghubungi server: ${err.message}`);
    } finally {
      setIsRequestingObs(false);
    }
  };

  const cancelObservation = async () => {
    if (!observationTask || !['queued', 'running'].includes(observationTask.status)) return;
    if (isCancellingObs) return;

    const taskId = observationTask.id;
    setIsCancellingObs(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/observation/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (res.status === 401) {
        setAuthError(true);
        setObsError('Autentikasi ditolak saat membatalkan tugas.');
        return;
      }
      if (res.status === 400 || res.status === 409) {
        const data = await res.json().catch(() => ({}));
        setObsError(data.message || 'Tugas sudah terminal dan tidak dapat dibatalkan.');
        stopObservationPolling();
        return;
      }

      if (res.ok) {
        stopObservationPolling();
        setObservationTask(prev => (prev && prev.id === taskId) ? {
          ...prev,
          status: 'cancelled',
          completed_at: new Date().toISOString()
        } : prev);
        setLastAction(`Tugas ${taskId} berhasil dibatalkan.`);
      }
    } catch (err) {
      setObsError(`Gagal membatalkan tugas: ${err.message}`);
    } finally {
      setIsCancellingObs(false);
    }
  };

  // 3. AI Planning: Kirim Prompt ke /api/ai/plan
  const requestAiPlan = async () => {
    if (!promptInput.trim()) {
      setPlanError('Instruksi/prompt tidak boleh kosong.');
      return;
    }
    if (!selectedDevice) {
      setPlanError('Pilih perangkat target terlebih dahulu.');
      return;
    }

    setIsPlanning(true);
    setPlanError(null);
    setAiPlan(null);
    setExecutionResult(null);

    try {
      const response = await fetch(`${SERVER_URL}/api/ai/plan`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt: promptInput,
          device_id: selectedDevice
        })
      });

      if (response.status === 401) {
        setAuthError(true);
        setPlanError('Tidak diotorisasi: Kunci akses API salah atau diperlukan.');
        return;
      }

      const data = await response.json();

      if (!response.ok || !data.success) {
        setPlanError(data.error || 'Gagal membuat rencana tindakan.');
      } else {
        setAiPlan(data);
      }
    } catch (err) {
      setPlanError('Gagal menghubungi AI Planner di server lokal.');
    } finally {
      setIsPlanning(false);
    }
  };

  // 4. Eksekusi Rencana Aksi ke /api/plan/execute dengan Verifikasi Perangkat
  const executePlan = async () => {
    if (!aiPlan || !aiPlan.plan) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const response = await fetch(`${SERVER_URL}/api/plan/execute`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          plan_id: aiPlan.plan.plan_id,
          device_id: aiPlan.plan.device_id || aiPlan.plan.target_device || selectedDevice,
          steps: aiPlan.plan.steps
        })
      });

      if (response.status === 401) {
        setAuthError(true);
        setExecutionResult({
          http_status: 401,
          success: false,
          status: 'unauthorized',
          error: 'Eksekusi ditolak: Kunci akses API salah atau diperlukan.',
          executed_steps: []
        });
        return;
      }

      const data = await response.json();
      
      // Simpan hasil eksekusi fisik aktual
      setExecutionResult({
        http_status: response.status,
        success: data.success === true && data.status === 'succeeded',
        status: data.status || 'unknown',
        error: data.error || null,
        executed_steps: data.executed_steps || []
      });

    } catch (err) {
      setExecutionResult({
        http_status: 0,
        success: false,
        status: 'network_error',
        error: 'Koneksi ke server gagal saat proses eksekusi rencana.',
        executed_steps: []
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // 5. Aksi Manual Sederhana (HID Direct Test)
  const sendManualAction = async (actionName, params = {}) => {
    if (!selectedDevice) return;
    try {
      const response = await fetch(`${SERVER_URL}/api/devices/${selectedDevice}/execute`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: actionName, params })
      });
      if (response.status === 401) {
        setAuthError(true);
        setLastAction('Ditolak: Kunci akses API salah atau diperlukan.');
        setTimeout(() => setLastAction(null), 3500);
        return;
      }
      const result = await response.json();
      if (result.success) {
        setLastAction(`Berhasil kirim: ${actionName}`);
      } else {
        setLastAction(`Ditolak: ${result.error}`);
      }
      setTimeout(() => setLastAction(null), 3500);
    } catch (err) {
      setLastAction('Gagal mengirim perintah manual.');
      setTimeout(() => setLastAction(null), 3500);
    }
  };

  const activePreview = (isSharingScreen && companionPreview) ? companionPreview : hostHelperPreview;
  const isCompanionPreview = Boolean(isSharingScreen && companionPreview);

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header-section animate-fade-in">
        <div>
          <h1>BURSA Dashboard</h1>
          <p>AI Remote Agent (LILYGO T-Dongle S3 & Web Companion) Control Center</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div className="glass-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldCheck size={18} color="var(--accent-green)" />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Allowlist Keamanan Aktif</span>
          </div>

          <div 
            className="glass-card" 
            onClick={() => { setTempKey(apiKey); setShowKeyModal(true); }}
            title="Klik untuk melihat atau mengatur kunci akses API"
            style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
          >
            <Lock size={16} color={serverHealth.auth_enabled ? (authError ? "var(--accent-red)" : (apiKey ? "var(--accent-green)" : "var(--accent-yellow)")) : (apiKey ? "var(--accent-green)" : "var(--accent-cyan)")} />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {serverHealth.auth_enabled 
                ? (authError ? 'Autentikasi Ditolak (Klik)' : (apiKey ? 'Token Terpasang' : 'Kunci Diperlukan (Klik)'))
                : (apiKey ? 'Token Sesi Aktif' : 'Mode Lokal (Tanpa Kunci)')}
            </span>
          </div>

          <div className="glass-card" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`status-dot status-${serverHealth.status}`}></span>
            <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
              {serverHealth.status === 'online' ? 'Server Aktif' : 
               serverHealth.status === 'connecting' ? 'Menghubungkan...' : 'Server Terputus'}
            </span>
          </div>
        </div>
      </header>

      {/* Modal Pengaturan Kunci Akses API (sessionStorage) */}
      {showKeyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card animate-fade-in" style={{ width: '90%', maxWidth: '440px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={18} color="var(--accent-cyan)" /> Kunci Akses API (BURSA)
              </h3>
              <button className="btn btn-outline" onClick={() => setShowKeyModal(false)} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>✕</button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Kunci disimpan hanya pada memori sesi tab browser (<code>sessionStorage</code>) dan tidak disimpan di source code.
            </p>
            <input 
              type="password"
              placeholder="Masukkan BURSA_API_KEY..."
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '8px',
                border: '1px solid var(--glass-border)', background: 'rgba(0,0,0,0.3)',
                color: 'var(--text-primary)', marginBottom: '16px', boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={handleClearKey} style={{ padding: '8px 14px' }}>
                Hapus
              </button>
              <button className="btn btn-primary" onClick={handleSaveKey} style={{ padding: '8px 16px' }}>
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <main className="grid-dashboard">
        
        {/* Kolom 1: Status & Perangkat */}
        <section className="glass-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
            <Cpu color="var(--accent-cyan)" />
            <h2>Perangkat Terhubung</h2>
          </div>
          
          <p style={{ fontSize: '0.9rem' }}>Pilih target USB Dongle untuk menerima aksi komputer:</p>
          
          <div className="device-list">
            {devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '25px 0', opacity: 0.6 }}>
                <Wifi size={36} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '0.9rem' }}>Belum ada T-Dongle S3 yang terhubung.</p>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gunakan simulator atau sambungkan dongle fisik.</p>
              </div>
            ) : (
              devices.map((device) => (
                <div 
                  key={device.id} 
                  className={`device-item ${selectedDevice === device.id ? 'selected' : ''}`}
                  onClick={() => setSelectedDevice(device.id)}
                  style={{
                    cursor: 'pointer',
                    borderColor: selectedDevice === device.id ? 'var(--accent-cyan)' : 'var(--glass-border)',
                    background: selectedDevice === device.id ? 'rgba(0, 240, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'
                  }}
                >
                  <div className="device-info">
                    <span className={`status-dot ${device.status === 'error' || device.status === 'emergency_stop' ? 'status-error' : 'status-online'}`}></span>
                    <div>
                      <div className="device-id">{device.id}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Status: <span style={{ color: 'var(--text-secondary)' }}>{device.status}</span> • Tipe: {device.type || 'dongle'}
                      </div>
                    </div>
                  </div>
                  {selectedDevice === device.id && (
                    <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Aktif</span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick Manual Actions */}
          {selectedDevice && (
            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid var(--glass-border)' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Uji Perintah Cepat ({selectedDevice}):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button 
                  className="btn btn-outline" 
                  style={{ fontSize: '0.8rem', padding: '8px' }}
                  onClick={() => sendManualAction('mouse_move', { x: 50, y: 50 })}
                >
                  <MousePointer2 size={14} /> Geser Mouse
                </button>
                <button 
                  className="btn btn-outline" 
                  style={{ fontSize: '0.8rem', padding: '8px' }}
                  onClick={() => sendManualAction('click')}
                >
                  <MousePointer2 size={14} /> Klik Kiri
                </button>
              </div>
              {lastAction && (
                <div style={{ 
                  marginTop: '10px', 
                  padding: '8px', 
                  borderRadius: '6px', 
                  background: 'var(--glass-highlight)',
                  fontSize: '0.8rem',
                  color: 'var(--accent-cyan)'
                }}>
                  {lastAction}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Kolom 2: Visual & Layar PC (Web Companion & Host Helper) */}
        <section className="glass-card animate-fade-in" style={{ animationDelay: '0.15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
            <Monitor color="var(--accent-green)" />
            <h2>Konteks Visual & Layar</h2>
          </div>

          <p style={{ fontSize: '0.9rem' }}>
            Observasi visual layar PC untuk AI Planner melalui antrean on-demand Host Helper atau Web Companion.
          </p>

          <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Tombol Minta Screenshot Baru (Observation Queue) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button 
                id="btn-request-observation"
                className="btn btn-primary" 
                onClick={requestObservation}
                disabled={isRequestingObs || (observationTask && ['queued', 'running'].includes(observationTask.status))}
                style={{ width: '100%', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {isRequestingObs ? (
                  <>
                    <RefreshCw size={18} className="animate-spin" /> Mengirim Permintaan...
                  </>
                ) : (
                  <>
                    <Camera size={18} /> Minta Screenshot Baru
                  </>
                )}
              </button>

              {/* Status Antrean Observasi Aktif */}
              {observationTask && (
                <div 
                  id="observation-task-status"
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--glass-highlight)',
                    border: '1px solid var(--glass-border)',
                    fontSize: '0.82rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      ID: {observationTask.id}
                    </span>
                    <div>
                      {observationTask.status === 'queued' && (
                        <span className="badge badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} className="animate-spin" /> Antrean ({observationTask.queue_position || 1})
                        </span>
                      )}
                      {observationTask.status === 'running' && (
                        <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <RefreshCw size={12} className="animate-spin" /> Sedang Diproses
                        </span>
                      )}
                      {observationTask.status === 'completed' && (
                        <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle size={12} /> Selesai
                        </span>
                      )}
                      {observationTask.status === 'failed' && (
                        <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <XCircle size={12} /> Gagal
                        </span>
                      )}
                      {observationTask.status === 'cancelled' && (
                        <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                          <Ban size={12} /> Dibatalkan
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Keterangan detail status */}
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {observationTask.status === 'queued' && 'Menunggu Host Helper mengambil tugas...'}
                    {observationTask.status === 'running' && 'Host Helper sedang mengambil tangkapan layar...'}
                    {observationTask.status === 'completed' && (
                      observationTask.screenshot_matched 
                        ? 'Tangkapan layar berhasil diterima dan ditampilkan di pratinjau.'
                        : 'Tugas selesai, memverifikasi keselarasan gambar terbaru...'
                    )}
                    {observationTask.status === 'failed' && (
                      <span style={{ color: 'var(--accent-red)' }}>
                        {observationTask.error_message || 'Tugas observasi gagal atau batas waktu habis.'}
                      </span>
                    )}
                    {observationTask.status === 'cancelled' && 'Tugas observasi telah dibatalkan oleh pengguna.'}
                  </div>

                  {/* Tombol Pembatalan jika masih aktif */}
                  {['queued', 'running'].includes(observationTask.status) && (
                    <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        id="btn-cancel-observation"
                        className="btn btn-outline"
                        onClick={cancelObservation}
                        disabled={isCancellingObs}
                        style={{
                          fontSize: '0.75rem',
                          padding: '4px 10px',
                          borderColor: 'var(--accent-red)',
                          color: 'var(--accent-red)'
                        }}
                      >
                        <Ban size={12} style={{ marginRight: '4px' }} />
                        {isCancellingObs ? 'Membatalkan...' : 'Batalkan Tugas'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Error Alert Antrean jika ada */}
              {obsError && (
                <div style={{
                  padding: '8px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255, 68, 68, 0.1)',
                  border: '1px solid rgba(255, 68, 68, 0.25)',
                  fontSize: '0.8rem',
                  color: 'var(--accent-red)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <AlertTriangle size={14} />
                  <span>{obsError}</span>
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)', margin: '4px 0' }} />

            {/* Bagian Web Companion Screen Sharing (Tetap Ada & Tidak Dirusak) */}
            {!isSharingScreen ? (
              <button 
                className="btn btn-outline" 
                onClick={startScreenSharing}
                style={{ width: '100%', padding: '10px', fontSize: '0.85rem' }}
              >
                <Video size={16} /> Aktifkan Web Companion (Browser Share)
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button 
                  className="btn btn-outline" 
                  onClick={stopScreenSharing}
                  style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)', padding: '8px', fontSize: '0.85rem' }}
                >
                  <VideoOff size={16} /> Hentikan Web Companion
                </button>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Tangkapan terkirim: <b>{captureStats.count}</b> • Terakhir: <b>{captureStats.lastTime || '-'}</b>
                </div>
              </div>
            )}

            {/* Status Screenshot di Server */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Konteks Layar AI:</span>
              {serverHealth.has_screenshot ? (
                <span className="badge badge-success">Tersedia & Valid</span>
              ) : (
                <span className="badge badge-warning">Belum Ada / Kedaluwarsa</span>
              )}
            </div>

            {/* Pratinjau Gambar */}
            {activePreview && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    {isCompanionPreview 
                      ? 'Pratinjau Layar (Web Companion):' 
                      : `Pratinjau Layar (${hostHelperMetadata?.source || 'Host Helper'}):`}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {hostHelperMetadata?.task_id && (
                      <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                        Tugas: {hostHelperMetadata.task_id}
                      </span>
                    )}
                    {!isCompanionPreview && hostHelperMetadata?.width ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {hostHelperMetadata.width}x{hostHelperMetadata.height}
                      </span>
                    ) : null}
                  </div>
                </div>
                <img 
                  src={activePreview} 
                  alt="Screen Preview" 
                  style={{ 
                    width: '100%', 
                    borderRadius: '8px', 
                    border: '1px solid var(--glass-border)',
                    maxHeight: '140px',
                    objectFit: 'cover'
                  }} 
                />
              </div>
            )}
          </div>
        </section>

        {/* Kolom 3 & 4: AI Planner & Konfirmasi Eksekusi (Rentang Lebar) */}
        <section className="glass-card animate-fade-in" style={{ animationDelay: '0.2s', gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px' }}>
            <Sparkles color="var(--accent-blue)" />
            <h2>AI Planner Terpadu & Eksekusi Terverifikasi</h2>
          </div>

          <p style={{ fontSize: '0.9rem', marginBottom: '15px' }}>
            Kirim instruksi pengguna dalam bahasa alami. AI merencanakan aksi berstruktur, memvalidasi keamanan, meminta konfirmasi Anda, dan memverifikasi eksekusi fisik dari dongle.
          </p>

          {/* Form Input Prompt AI */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
            <textarea 
              className="ai-textarea"
              placeholder="Contoh: Buka kalkulator dan hitung 25 + 75..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              disabled={isPlanning || isExecuting}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Target: <span style={{ color: 'var(--accent-cyan)', fontFamily: 'monospace' }}>{selectedDevice || 'Belum dipilih'}</span>
              </div>
              <button 
                className="btn btn-primary"
                onClick={requestAiPlan}
                disabled={isPlanning || isExecuting || !selectedDevice}
                style={{ minWidth: '180px' }}
              >
                {isPlanning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Merencanakan...
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> Buat Rencana AI (/api/ai/plan)
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Pembuatan Rencana */}
          {planError && (
            <div className="animate-fade-in" style={{ 
              padding: '12px 16px', 
              borderRadius: '8px', 
              background: 'rgba(255, 42, 42, 0.1)', 
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '20px'
            }}>
              <AlertTriangle size={18} />
              <span>{planError}</span>
            </div>
          )}

          {/* Kartu Rencana Aksi AI */}
          {aiPlan && aiPlan.plan && (
            <div className="animate-fade-in" style={{ 
              background: 'rgba(0, 0, 0, 0.3)', 
              borderRadius: '12px', 
              border: '1px solid var(--glass-border)',
              padding: '20px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Rencana Aksi AI Terverifikasi</h3>
                    <span className="badge badge-info">{aiPlan.provider || 'Mock Provider'}</span>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Plan ID: <code style={{ color: 'var(--accent-cyan)' }}>{aiPlan.plan.plan_id}</code>
                  </p>
                </div>

                {/* Indikator Konfirmasi Pengguna */}
                {aiPlan.plan.requires_confirmation ? (
                  <span className="badge badge-warning" style={{ padding: '6px 12px' }}>
                    <AlertTriangle size={14} /> Memerlukan Persetujuan Pengguna
                  </span>
                ) : (
                  <span className="badge badge-success" style={{ padding: '6px 12px' }}>
                    <CheckCircle size={14} /> Aman Dijalankan Langsung
                  </span>
                )}
              </div>

              {/* Penjelasan Rencana */}
              <div style={{ 
                padding: '12px 16px', 
                background: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '8px', 
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                marginBottom: '15px',
                borderLeft: '4px solid var(--accent-blue)'
              }}>
                <b>Penjelasan Rencana:</b> {aiPlan.plan.explanation}
              </div>

              {/* Daftar Langkah (Steps) */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Langkah Aksi ({aiPlan.plan.steps.length} tindakan):
                </div>
                {aiPlan.plan.steps.map((step, idx) => (
                  <div key={idx} className="step-card">
                    <div className="step-number">{idx + 1}</div>
                    <div className="step-content">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="step-action-name">{step.action}</span>
                        {step.action === 'delay' && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--accent-yellow)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> Server-Side Delay
                          </span>
                        )}
                      </div>
                      <div className="step-params">
                        {JSON.stringify(step.params || {})}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tombol Persetujuan / Eksekusi */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button 
                  className="btn btn-outline" 
                  onClick={() => { setAiPlan(null); setExecutionResult(null); }}
                  disabled={isExecuting}
                >
                  Batalkan Rencana
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={executePlan}
                  disabled={isExecuting}
                  style={{ minWidth: '200px' }}
                >
                  {isExecuting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" /> Mengeksekusi di Dongle...
                    </>
                  ) : (
                    <>
                      <Play size={16} /> {aiPlan.plan.requires_confirmation ? 'Setujui & Jalankan Rencana' : 'Jalankan Rencana'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Tampilan Hasil Eksekusi Hardware Aktual */}
          {executionResult && (
            <div className="animate-fade-in" style={{ 
              marginTop: '15px', 
              padding: '20px', 
              borderRadius: '12px', 
              background: executionResult.success ? 'rgba(0, 230, 118, 0.08)' : 'rgba(255, 42, 42, 0.08)',
              border: `1px solid ${executionResult.success ? 'var(--accent-green)' : 'var(--accent-red)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                {executionResult.success ? (
                  <CheckCircle size={22} color="var(--accent-green)" />
                ) : (
                  <XCircle size={22} color="var(--accent-red)" />
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: executionResult.success ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {executionResult.success ? 'Eksekusi Berhasil Diverifikasi oleh Dongle' : 'Eksekusi Gagal di Perangkat / Server'}
                  </h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Status: <b style={{ color: 'var(--text-primary)' }}>{executionResult.status}</b> • HTTP Response: {executionResult.http_status}
                  </div>
                </div>
              </div>

              {executionResult.error && (
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-red)', marginBottom: '12px', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
                  <b>Pesan Kesalahan:</b> {executionResult.error}
                </div>
              )}

              {/* Rincian Langkah yang Telah Dieksekusi */}
              {executionResult.executed_steps.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Laporan Verifikasi Langkah Perangkat:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {executionResult.executed_steps.map((s, idx) => (
                      <div key={idx} style={{ 
                        fontSize: '0.8rem', 
                        padding: '6px 10px', 
                        borderRadius: '6px', 
                        background: 'rgba(0,0,0,0.2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <span>Langkah {s.step}: <code style={{ color: 'var(--accent-cyan)' }}>{s.action}</code></span>
                        <span style={{ color: s.status === 'succeeded' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {s.status === 'succeeded' ? '✓ Sukses diverifikasi' : `✗ Gagal (${s.error || s.message || 'error'})`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                * Catatan: Status sukses hanya diberikan setelah T-Dongle S3 / simulator mengirimkan laporan <code>action_result</code> konfirmasi balik via WebSocket.
              </div>
            </div>
          )}

        </section>

      </main>
    </div>
  );
}

export default App;
