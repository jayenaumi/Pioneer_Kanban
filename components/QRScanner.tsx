
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

const QRScanner: React.FC<QRScannerProps> = ({ onScanSuccess, onScanError }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader-internal-context";
  const isMounted = useRef(true);

  // Check initial permission status
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' as any }).then(status => {
        setPermissionStatus(status.state as any);
        status.onchange = () => setPermissionStatus(status.state as any);
      }).catch(() => setPermissionStatus('unknown'));
    }
  }, []);

  const requestPermission = async () => {
    try {
      setIsInitializing(true);
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus('granted');
      // Re-trigger scanner start
      startScanner();
    } catch (err: any) {
      console.error("Manual Permission Error:", err);
      setError("Camera Blocked: Please enable camera in browser settings and reload.");
      setPermissionStatus('denied');
      setIsInitializing(false);
    }
  };

  const startScanner = async () => {
    // Vital buffer for Android WebView/APK to stabilize DOM layout before camera bind
    await new Promise(r => setTimeout(r, 600));
    if (!isMounted.current) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("Browser Unsuitable: Camera APIs not supported or blocked by insecure context.");
      setIsInitializing(false);
      return;
    }

    // Stop any existing scanner
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        console.debug("Error stopping scanner:", e);
      }
    }

    try {
      const scanner = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE]
      };

      // Try environment camera first, then fallback to any camera
      try {
        await scanner.start(
          { facingMode: "environment" },
          config,
          (decodedText) => {
            if (isMounted.current) {
              if (navigator.vibrate) navigator.vibrate(50);
              onScanSuccess(decodedText);
            }
          },
          () => {} 
        );
      } catch (e) {
        console.warn("Environment camera failed, trying default camera...", e);
        await scanner.start(
          { facingMode: "user" }, // Fallback to user camera (front) or default
          config,
          (decodedText) => {
            if (isMounted.current) {
              if (navigator.vibrate) navigator.vibrate(50);
              onScanSuccess(decodedText);
            }
          },
          () => {}
        );
      }

      if (isMounted.current) {
        setIsInitializing(false);
        setPermissionStatus('granted');
        setError(null);
      }
    } catch (err: any) {
      if (isMounted.current) {
        console.error("Scanner Hardware Error:", err);
        let userMsg = "Camera access denied. Check system permissions.";
        
        if (err.toString().includes('NotAllowedError') || err.name === 'NotAllowedError') {
          userMsg = "Camera Blocked: Please click the camera icon in your browser address bar and select 'Allow'.";
          setPermissionStatus('denied');
        } else if (err.name === 'NotFoundError') {
          userMsg = "No camera detected on this device.";
        } else if (err.name === 'NotReadableError') {
          userMsg = "Camera is already in use by another application.";
        }
        
        setError(userMsg);
        setIsInitializing(false);
        if (onScanError) onScanError(err.message);
      }
    }
  };

  useEffect(() => {
    isMounted.current = true;
    startScanner();

    return () => {
      isMounted.current = false;
      const scanner = html5QrCodeRef.current;
      if (scanner) {
        if (scanner.isScanning) {
          scanner.stop()
            .then(() => {
              scanner.clear();
            })
            .catch(e => console.debug("Clean scanner shutdown:", e));
        }
      }
    };
  }, [onScanSuccess, onScanError]);

  return (
    <div className="w-full relative aspect-square bg-slate-950 overflow-hidden">
      <div id={scannerId} className="w-full h-full" />
      
      {isInitializing && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-10">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Opening Hardware...</p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center z-20 overflow-y-auto">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
            <span className="text-red-500 text-xl">!</span>
          </div>
          <p className="text-sm font-black text-white mb-2 uppercase tracking-widest">Camera Access Blocked</p>
          <p className="text-[10px] text-slate-400 mb-6 leading-relaxed max-w-[240px]">
            Your browser is blocking the camera. To fix this:
            <br /><br />
            1. Click the <span className="text-indigo-400 font-bold">Lock/Camera icon</span> in the address bar.
            <br />
            2. Set Camera to <span className="text-indigo-400 font-bold">"Allow"</span>.
            <br />
            3. Refresh this page.
          </p>
          
          <div className="flex flex-col gap-3 w-full max-w-[220px]">
            {permissionStatus === 'denied' && (
              <button 
                onClick={requestPermission} 
                className="px-6 py-3 bg-emerald-600 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
              >
                Try Requesting Again
              </button>
            )}
            <button 
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert("Link copied! Open this in your mobile browser (Chrome/Safari).");
              }} 
              className="px-6 py-3 bg-slate-700 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-transform border border-slate-600"
            >
              Copy App Link
            </button>
            <button 
              onClick={() => window.open(window.location.href, '_blank')} 
              className="px-6 py-3 bg-slate-800 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-transform border border-slate-700"
            >
              Open in New Tab
            </button>
            <button 
              onClick={() => window.location.reload()} 
              className="px-6 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-xl uppercase tracking-widest shadow-lg active:scale-95 transition-transform"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )}

      {!error && !isInitializing && (
        <div className="absolute inset-0 pointer-events-none border-[40px] border-slate-950/40">
          <div className="w-full h-full border-2 border-indigo-500/50 relative">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-indigo-500 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-indigo-500 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-indigo-500 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-indigo-500 rounded-br-xl" />
            
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50 animate-scan"></div>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes scan {
          0% { top: 0%; }
          100% { top: 100%; }
        }
        .animate-scan {
          animation: scan 3s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default QRScanner;
