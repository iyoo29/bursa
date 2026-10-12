import { useState, useEffect } from 'react';
import { Terminal, Activity, Cpu, Keyboard, MousePointer2, Settings, Wifi } from 'lucide-react';
import './index.css';

const SERVER_URL = 'http://localhost:8000';

function App() {
  const [devices, setDevices] = useState([]);
  const [serverStatus, setServerStatus] = useState('connecting');
  const [lastAction, setLastAction] = useState(null);

  // Fungsi untuk mengambil daftar perangkat (Polling sederhana setiap 3 detik)
  const fetchDevices = async () => {
    try {
      const response = await fetch(`${SERVER_URL}/api/devices`);
      const data = await response.json();
      setDevices(data.devices || []);
      setServerStatus('online');
    } catch (error) {
      console.error("Gagal terhubung ke server lokal:", error);
      setServerStatus('error');
    }
  };

  useEffect(() => {
    // Panggil saat pertama kali load
    fetchDevices();
    
    // Set interval polling
    const interval = setInterval(fetchDevices, 3000);
    return () => clearInterval(interval);
  }, []);

  // Fungsi untuk mengirim aksi jarak jauh (remote action) ke T-Dongle S3
  const sendAction = async (deviceId, actionName, params = {}) => {
    try {
      const response = await fetch(`${SERVER_URL}/api/devices/${deviceId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionName, params })
      });
      
      const result = await response.json();
      if (result.success) {
        setLastAction(`Berhasil: ${actionName} ke ${deviceId}`);
      } else {
        setLastAction(`Gagal: ${result.error}`);
      }
      
      // Bersihkan notifikasi setelah 3 detik
      setTimeout(() => setLastAction(null), 3000);
    } catch (error) {
      setLastAction('Gagal mengirim perintah. Pastikan server aktif.');
      setTimeout(() => setLastAction(null), 3000);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header-section animate-fade-in">
        <div>
          <h1>AIRA Dashboard</h1>
          <p>AI Remote Agent (T-Dongle S3) Control Center</p>
        </div>
        <div className="glass-card" style={{ padding: '12px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span className={`status-dot status-${serverStatus}`}></span>
            <span style={{ fontWeight: 500 }}>
              {serverStatus === 'online' ? 'Server Lokal Aktif' : 
               serverStatus === 'connecting' ? 'Menghubungkan...' : 'Server Terputus'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="grid-dashboard">
        
        {/* Kolom Kiri: Daftar Perangkat */}
        <section className="glass-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Cpu color="var(--accent-cyan)" />
            <h2>Perangkat Aktif</h2>
          </div>
          
          <p>Dongle yang sedang terhubung dan siap menerima perintah jarak jauh.</p>
          
          <div className="device-list">
            {devices.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', opacity: 0.5 }}>
                <Wifi size={40} style={{ marginBottom: '10px' }} />
                <p>Belum ada T-Dongle S3 yang terhubung.</p>
                <p style={{ fontSize: '0.85rem' }}>Pastikan dongle menyala dan terkoneksi ke WiFi.</p>
              </div>
            ) : (
              devices.map((device) => (
                <div key={device.id} className="device-item">
                  <div className="device-info">
                    <span className={`status-dot ${device.status === 'error' || device.status === 'emergency_stop' ? 'status-error' : 'status-online'}`}></span>
                    <div>
                      <div className="device-id">{device.id}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Status: <span style={{ color: 'var(--text-secondary)' }}>{device.status}</span> • v{device.firmware_version}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Kolom Kanan: Panel Kontrol (Simulasi) */}
        <section className="glass-card animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Terminal color="var(--accent-blue)" />
            <h2>Pusat Kendali</h2>
          </div>
          
          {devices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
              <Activity size={40} style={{ marginBottom: '10px' }} />
              <p>Menunggu perangkat untuk mengaktifkan kendali...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <p>Simulasikan aksi jarak jauh ke T-Dongle pertama (<b>{devices[0].id}</b>):</p>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <button 
                  className="btn btn-outline"
                  onClick={() => sendAction(devices[0].id, 'mouse_move', { x: 50, y: 50 })}
                >
                  <MousePointer2 size={16} /> Gerak Mouse
                </button>
                <button 
                  className="btn btn-outline"
                  onClick={() => sendAction(devices[0].id, 'click')}
                >
                  <MousePointer2 size={16} /> Klik Kiri
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => sendAction(devices[0].id, 'type_text', { text: "Hello from AIRA Web Dashboard!\n" })}
                  style={{ gridColumn: '1 / -1' }}
                >
                  <Keyboard size={16} /> Simulasikan Ketikan
                </button>
                <button 
                  className="btn btn-outline"
                  onClick={() => sendAction(devices[0].id, 'key_combination', { keys: ["GUI", "r"] })}
                  style={{ gridColumn: '1 / -1' }}
                >
                  <Settings size={16} /> Buka Jendela Run (Win+R)
                </button>
              </div>

              {lastAction && (
                <div style={{ 
                  marginTop: '10px', 
                  padding: '10px', 
                  borderRadius: '6px', 
                  background: 'var(--glass-highlight)',
                  border: '1px solid var(--glass-border)',
                  fontSize: '0.9rem'
                }} className="animate-fade-in">
                  {lastAction}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
