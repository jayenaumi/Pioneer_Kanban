
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import * as htmlToImage from 'html-to-image';
import { 
  OrderMaster, 
  ScanningData, 
  ProductionStatus 
} from './types';
import { PROCESS_FLOW, BUNDLE_QTY_FIXED } from './constants';
import Layout from './components/Layout';
import ProductionChart from './components/ProductionChart';
import QRScanner from './components/QRScanner';
import Modal from './components/Modal';
import { supabase, isSupabaseConfigured } from './services/supabase';
import { QRCodeSVG } from 'qrcode.react';
import emailjs from '@emailjs/browser';
import Auth from './components/Auth';
import { 
  Search, 
  Download, 
  Trash2, 
  Scan, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  RefreshCw,
  Filter,
  Scissors,
  Wind as Thread,
  Droplets,
  Flag,
  QrCode,
  FileText,
  Copy,
  Plus,
  Database,
  Mail,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from './lib/utils';
import { motion } from 'motion/react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const qrContainerRef = useRef<HTMLDivElement>(null);
  const [dbOrders, setDbOrders] = useState<any[]>([]);
  const [dbRejections, setDbRejections] = useState<any[]>([]);
  const [dbOrderInfo, setDbOrderInfo] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  
  const [performanceView, setPerformanceView] = useState<'Sewing' | 'Finishing'>('Sewing');
  const [dashboardStartDate, setDashboardStartDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [dashboardEndDate, setDashboardEndDate] = useState(new Date().toLocaleDateString('en-CA'));
  
  // Email Configuration State
  const [autoEmail, setAutoEmail] = useState(localStorage.getItem('pioneer_auto_email') === 'true');
  const [recipientEmail, setRecipientEmail] = useState(localStorage.getItem('pioneer_recipient_email') || import.meta.env.VITE_RECIPIENT_EMAIL || '');

  const [isPWAInstalled, setIsPWAInstalled] = useState(false);
  const [orderCategoryFilter, setOrderCategoryFilter] = useState('ALL');
  const [orderStartDate, setOrderStartDate] = useState('');
  const [orderEndDate, setOrderEndDate] = useState('');
  const [orderProcessStepFilter, setOrderProcessStepFilter] = useState('ALL');
  const [orderSewingLineFilter, setOrderSewingLineFilter] = useState('ALL');
  const [orderFinishingLineFilter, setOrderFinishingLineFilter] = useState('ALL');
  const [rejectionSearch, setRejectionSearch] = useState({ buyer: '', style: '', po: '' });
  const [rejectionCategoryFilter, setRejectionCategoryFilter] = useState('ALL');
  const [rejectionStartDate, setRejectionStartDate] = useState('');
  const [rejectionEndDate, setRejectionEndDate] = useState('');
  
  const [qrFormData, setQrFormData] = useState({
    buyer: '',
    style: '',
    po: '',
    color: '',
    size: '',
    po_qty: '',
    cutting_qty: '',
    bundle_qty: '20'
  });
  const [qrSizeEntries, setQrSizeEntries] = useState<Record<string, { cutting_qty: string, bundle_qty: string }>>({});
  const [generatedBundles, setGeneratedBundles] = useState<any[]>([]);

  // Find matching order info for QR generation
  const qrMatchedOrder = useMemo(() => {
    if (!qrFormData.buyer || !qrFormData.style || !qrFormData.po || !qrFormData.color) return null;
    return dbOrderInfo.find(o => 
      o.buyer === qrFormData.buyer && 
      o.style === qrFormData.style && 
      o.po === qrFormData.po && 
      o.color === qrFormData.color
    );
  }, [dbOrderInfo, qrFormData.buyer, qrFormData.style, qrFormData.po, qrFormData.color]);

  // Derived stats for each size
  const qrSizeStats = useMemo(() => {
    const stats: Record<string, { orderQty: number, totalCut: number }> = {};
    if (!qrMatchedOrder) return stats;

    const sizes = qrMatchedOrder.size_data || [];
    sizes.forEach((s: any) => {
      // Calculate total cut so far for this specific size in this specific order
      const totalCut = dbOrders
        .filter(o => 
          o.style === qrMatchedOrder.style && 
          o.po === qrMatchedOrder.po && 
          o.color === qrMatchedOrder.color && 
          o.size === s.size
        )
        .reduce((sum, o) => sum + (o.cutting_in || 0), 0);

      stats[s.size] = {
        orderQty: parseInt(s.qty) || 0,
        totalCut
      };
    });
    return stats;
  }, [qrMatchedOrder, dbOrders]);

  const qrTableTotals = useMemo(() => {
    if (!qrMatchedOrder) return { orderQty: 0, prevCut: 0, cuttingPlanned: 0 };
    
    let orderQty = 0;
    let prevCut = 0;
    let cuttingPlanned = 0;

    (qrMatchedOrder.size_data || []).forEach((s: any) => {
      const stats = qrSizeStats[s.size] || { orderQty: 0, totalCut: 0 };
      const entry = qrSizeEntries[s.size] || { cutting_qty: '', bundle_qty: '20' };
      
      orderQty += stats.orderQty;
      prevCut += stats.totalCut;
      cuttingPlanned += (parseInt(entry.cutting_qty) || 0);
    });

    return { orderQty, prevCut, cuttingPlanned };
  }, [qrMatchedOrder, qrSizeStats, qrSizeEntries]);

  // Initialize size entries when order is matched
  useEffect(() => {
    if (qrMatchedOrder) {
      const newEntries: Record<string, { cutting_qty: string, bundle_qty: string }> = {};
      (qrMatchedOrder.size_data || []).forEach((s: any) => {
        newEntries[s.size] = qrSizeEntries[s.size] || { cutting_qty: '', bundle_qty: qrFormData.bundle_qty || '20' };
      });
      setQrSizeEntries(newEntries);
    }
  }, [qrMatchedOrder, qrFormData.bundle_qty]);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    onConfirm?: (password?: string) => void;
    confirmLabel?: string;
    showPasswordInput?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info'
  });

  const [formData, setFormData] = useState({
    id: '',
    buyer: '',
    style: '',
    po: '',
    color: '',
    size: '',
    qty: BUNDLE_QTY_FIXED.toString(),
    po_qty: ''
  });

  const [selectedProcess, setSelectedProcess] = useState('Cutting Input');
  const [selectedLine, setSelectedLine] = useState('N/A');
  const [selectedTable, setSelectedTable] = useState('Table 1');
  const [rejectionQty, setRejectionQty] = useState('0');
  const [rejectionReason, setRejectionReason] = useState('');
  const [scanStatus, setScanStatus] = useState<{message: string, type: 'success' | 'error' | 'warning' | null}>({message: '', type: null});
  const [orderSearch, setOrderSearch] = useState({ buyer: '', style: '', po: '' });
  const [orderInfoSearch, setOrderInfoSearch] = useState({ buyer: '', style: '' });
  
  // History Tab Specific Search State
  const [historySearch, setHistorySearch] = useState({
    bundleId: '',
    startDate: '',
    endDate: '',
    process: 'ALL',
    sewingLine: 'ALL',
    finishingLine: 'ALL'
  });

  // Pagination states
  const [orderInfoPage, setOrderInfoPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [rejectionsPage, setRejectionsPage] = useState(1);
  const [hourlyReportsPage, setHourlyReportsPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const rowsPerPage = 30;

  const [hourlyReportDate, setHourlyReportDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [hourlyReportProcess, setHourlyReportProcess] = useState('Sewing Output');

  useEffect(() => setOrderInfoPage(1), [orderInfoSearch]);
  useEffect(() => setOrdersPage(1), [orderCategoryFilter, orderStartDate, orderEndDate, orderSearch, orderProcessStepFilter, orderSewingLineFilter, orderFinishingLineFilter]);
  useEffect(() => setRejectionsPage(1), [rejectionSearch, rejectionCategoryFilter, rejectionStartDate, rejectionEndDate]);
  useEffect(() => setHourlyReportsPage(1), [hourlyReportDate, hourlyReportProcess]);
  useEffect(() => setHistoryPage(1), [historySearch]);

  const [orderMasterData, setOrderMasterData] = useState({
    buyer: '',
    style: '',
    po: '',
    color: '',
    sizes: [{ id: Math.random().toString(36).substr(2, 9), size: '', qty: '' }]
  });

  // Map UI Process name to exact DB Column name
  const processToColumn = (process: string): string => {
    const mapping: Record<string, string> = {
      'Cutting Input': 'cutting_in',
      'Cutting Output': 'cutting_out',
      'Sewing Input': 'sew_in',
      'Sewing Output': 'sew_out',
      'Send to Wash': 'send_to_wash',
      'Wash Input': 'wash_in',
      'Wash Output': 'wash_out',
      'Finishing Input': 'fin_in',
      'Finishing Output': 'fin_out'
    };
    return mapping[process] || 'cutting_in';
  };

  const getPreviousNetQty = (order: any, currentProcess: string) => {
    if (!order) return null;
    switch (currentProcess) {
      case 'Cutting Output':   return order.cutting_in;
      case 'Sewing Input':     return order.cutting_out;
      case 'Sewing Output':    return order.sew_in;
      case 'Send to Wash':     return order.sew_out;
      case 'Wash Input':       return order.send_to_wash;
      case 'Wash Output':      return order.wash_in;
      case 'Finishing Input':  return order.wash_out || order.sew_out;
      case 'Finishing Output': return order.fin_in;
      default: return null;
    }
  };

  const handleGenerateQR = async () => {
    const { buyer, style, po, color } = qrFormData;
    
    // Check if we have any size entries
    const entriesToProcess = Object.entries(qrSizeEntries).filter(([_, data]) => (parseInt(data.cutting_qty) || 0) > 0);
    
    if (entriesToProcess.length === 0) {
      setModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Please enter cutting quantity for at least one size.',
        type: 'error'
      });
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const newBundles: any[] = [];
    let bundleCounter = 1;

    entriesToProcess.forEach(([size, data]) => {
      const totalQty = parseInt(data.cutting_qty);
      const bQty = parseInt(data.bundle_qty) || 20;
      const numBundles = Math.ceil(totalQty / bQty);
      const poQty = qrSizeStats[size]?.orderQty || 0;

      for (let i = 1; i <= numBundles; i++) {
        const currentBQty = (i === numBundles) ? (totalQty - (i - 1) * bQty) : bQty;
        const bundleNum = bundleCounter.toString().padStart(4, '0');
        const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const bundleId = `PG-${dateStr}${bundleNum}${randomPart}`;
        bundleCounter++;
        
        const qrData = `ID=${bundleId}|Buyer=${buyer}|Style=${style}|PO=${po}|Color=${color}|Size=${size}|PO Qty=${poQty}|Bundle Qty=${currentBQty}`;
        
        newBundles.push({
          id: bundleId,
          buyer,
          style,
          po,
          color,
          size,
          po_qty: poQty,
          bundle_qty: currentBQty,
          qrData
        });
      }
    });
    
    setGeneratedBundles(newBundles);
  };

  const handleGeneratePcsQR = async () => {
    const { buyer, style, po, color } = qrFormData;
    const entriesToProcess = Object.entries(qrSizeEntries).filter(([_, data]) => (parseInt(data.cutting_qty) || 0) > 0);
    
    if (entriesToProcess.length === 0) {
      setModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Please enter cutting quantity for at least one size.',
        type: 'error'
      });
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
    const newBundles: any[] = [];
    let pcsCounter = 1;

    entriesToProcess.forEach(([size, data]) => {
      const totalQty = parseInt(data.cutting_qty);
      const poQty = qrSizeStats[size]?.orderQty || 0;

      for (let i = 1; i <= totalQty; i++) {
        const pcsNum = pcsCounter.toString().padStart(4, '0');
        const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const bundleId = `PCS-${dateStr}${pcsNum}${randomPart}`;
        pcsCounter++;
        
        const qrData = `ID=${bundleId}|Buyer=${buyer}|Style=${style}|PO=${po}|Color=${color}|Size=${size}|PO Qty=${poQty}|Bundle Qty=1`;
        
        newBundles.push({
          id: bundleId,
          buyer,
          style,
          po,
          color,
          size,
          po_qty: poQty,
          bundle_qty: 1,
          qrData
        });
      }
    });
    
    setGeneratedBundles(newBundles);
  };

  const handleCuttingInput = async () => {
    const { buyer, style, po, color } = qrFormData;
    const entriesToProcess = Object.entries(qrSizeEntries).filter(([_, data]) => (parseInt(data.cutting_qty) || 0) > 0);
    
    if (entriesToProcess.length === 0) {
      setModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Please enter cutting quantity for at least one size.',
        type: 'error'
      });
      return;
    }

    setIsLoading(true);
    try {
      const payloads: any[] = [];
      const newBundles: any[] = [];
      const now = new Date();
      const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
      let bundleCounter = 1;

      entriesToProcess.forEach(([size, data]) => {
        const totalQty = parseInt(data.cutting_qty);
        const bQty = parseInt(data.bundle_qty) || 20;
        const numBundles = Math.ceil(totalQty / bQty);
        const poQty = qrSizeStats[size]?.orderQty || 0;

        for (let i = 1; i <= numBundles; i++) {
          const currentBQty = (i === numBundles) ? (totalQty - (i - 1) * bQty) : bQty;
          const bundleNum = bundleCounter.toString().padStart(4, '0');
          const randomPart = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          const bundleId = `PG-${dateStr}${bundleNum}${randomPart}`;
          bundleCounter++;
          
          const qrData = `ID=${bundleId}|Buyer=${buyer}|Style=${style}|PO=${po}|Color=${color}|Size=${size}|PO Qty=${poQty}|Bundle Qty=${currentBQty}`;

          payloads.push({
            bundle_id: bundleId,
            buyer: buyer || 'TBA',
            style,
            po,
            color: color || 'N/A',
            size: size || 'N/A',
            po_quantity: poQty,
            cutting_in: currentBQty,
            line: selectedTable,
            cutting_line: selectedTable,
            created_at: now.toISOString(),
            factory_name: user?.user_metadata?.factory
          });

          newBundles.push({
            id: bundleId,
            buyer,
            style,
            po,
            color,
            size,
            po_qty: poQty,
            bundle_qty: currentBQty,
            qrData
          });
        }
      });

      const { error } = await supabase.from('orders').insert(payloads);
      if (error) throw error;

      setGeneratedBundles(newBundles);
      
      setModal({
        isOpen: true,
        title: 'Success',
        message: `Cutting Input for ${newBundles.length} bundles recorded and QR codes generated successfully for ${selectedTable}.`,
        type: 'success'
      });
      
      setTimeout(() => handleExportPDF(true), 1200);
      fetchData();
    } catch (error: any) {
      setModal({
        isOpen: true,
        title: 'Error',
        message: error.message || 'Failed to record Cutting Input.',
        type: 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const sendEmailWithAttachment = async (pdfBase64: string, filename: string) => {
    const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
    const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
    const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
      console.warn("EmailJS credentials not configured.");
      return;
    }

    if (!recipientEmail) {
      console.warn("Recipient email not specified.");
      return;
    }

    try {
      const templateParams = {
        to_email: recipientEmail,
        message: `New Cutting Input generated for Style: ${qrFormData.style}, PO: ${qrFormData.po}.`,
        subject: `Cutting Input PDF - ${qrFormData.style}`,
        content: pdfBase64, // Base64 content for attachment
        filename: filename
      };

      await emailjs.send(serviceId, templateId, templateParams, publicKey);
      console.log("Email sent successfully");
    } catch (err) {
      console.error("Failed to send email:", err);
    }
  };

  const handleExportPDF = async (silent = false) => {
    if (!qrContainerRef.current) {
      if (!silent) {
        setModal({
          isOpen: true,
          title: 'Export Error',
          message: 'QR container not found. Please generate QR codes first.',
          type: 'error'
        });
      }
      return;
    }
    
    setIsLoading(true);
    try {
      // Ensure we are at the top to avoid capture offsets
      window.scrollTo(0, 0);
      
      // Small delay to ensure all QR codes are fully rendered
      await new Promise(resolve => setTimeout(resolve, 800));

      // Use html-to-image which handles modern CSS (oklch) much better
      const dataUrl = await htmlToImage.toPng(qrContainerRef.current, {
        quality: 0.95,
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        style: {
          display: 'grid',
          padding: '20px'
        }
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(dataUrl);
      const imgHeightInPdf = (imgProps.height * pdfWidth) / imgProps.width;
      
      let heightLeft = imgHeightInPdf;
      let position = 0;

      // Add first page
      pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, imgHeightInPdf, undefined, 'FAST');
      heightLeft -= pdfHeight;

      // Add subsequent pages if content is longer than one page
      while (heightLeft > 0) {
        position = heightLeft - imgHeightInPdf;
        pdf.addPage();
        pdf.addImage(dataUrl, 'PNG', 0, position, pdfWidth, imgHeightInPdf, undefined, 'FAST');
        heightLeft -= pdfHeight;
      }
      
      const fileName = `QR_Bundles_${new Date().getTime()}.pdf`;
      pdf.save(fileName);
      
      // Send email if autoEmail is enabled
      if (autoEmail && recipientEmail) {
        const pdfBase64 = pdf.output('datauristring').split(',')[1];
        await sendEmailWithAttachment(pdfBase64, fileName);
      }
      
      if (!silent) {
        setModal({
          isOpen: true,
          title: 'PDF Exported',
          message: 'Your QR codes have been exported to PDF successfully.',
          type: 'success'
        });
      }
    } catch (error: any) {
      console.error("PDF Export Error:", error);
      if (!silent) {
        setModal({
          isOpen: true,
          title: 'PDF Export Failed',
          message: `An error occurred: ${error.message || 'The content might be too large for PDF export. Try generating fewer bundles at once.'}`,
          type: 'error'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const fetchData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const userFactory = user.user_metadata?.factory;

      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      let rejectionsQuery = supabase
        .from('rejection_logs')
        .select('*')
        .order('created_at', { ascending: false });

      let orderInfoQuery = supabase
        .from('order_info')
        .select('*')
        .order('created_at', { ascending: false });

      if (userFactory) {
        if (userFactory === 'Maxcom International (BD) Limited') {
          // For Maxcom, show their data AND any legacy data (null)
          ordersQuery = ordersQuery.or(`factory_name.eq."${userFactory}",factory_name.is.null`);
          rejectionsQuery = rejectionsQuery.or(`factory_name.eq."${userFactory}",factory_name.is.null`);
          orderInfoQuery = orderInfoQuery.or(`factory_name.eq."${userFactory}",factory_name.is.null`);
        } else {
          ordersQuery = ordersQuery.eq('factory_name', userFactory);
          rejectionsQuery = rejectionsQuery.eq('factory_name', userFactory);
          orderInfoQuery = orderInfoQuery.eq('factory_name', userFactory);
        }
      }

      const { data: orders, error: ordersError } = await ordersQuery;
      const { data: rejections, error: rejectionsError } = await rejectionsQuery;
      const { data: orderInfo, error: orderInfoError } = await orderInfoQuery;
      
      if (ordersError) {
        console.error("Supabase Orders Fetch Error:", ordersError.message);
        const isAuthError = ordersError.message.includes('refresh_token_not_found') || 
                           ordersError.message.includes('JWT');
        
        if (isAuthError) {
          setScanStatus({ message: 'Session expired. Please sign in again.', type: 'error' });
          setUser(null);
        } else {
          setScanStatus({ message: 'Cloud Error: Table "orders" fetch failed.', type: 'error' });
        }
      } else {
        setDbOrders(orders || []);
      }

      if (rejectionsError) {
        console.error("Supabase Rejection Logs Fetch Error:", rejectionsError.message);
      } else {
        setDbRejections(rejections || []);
      }

      if (orderInfoError) {
        console.error("Supabase Order Info Fetch Error:", orderInfoError.message);
      } else {
        setDbOrderInfo(orderInfo || []);
      }
    } catch (error: any) {
      console.error("Connectivity Failure:", error);
      setScanStatus({ message: 'Network Failure: Unable to reach database.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    localStorage.setItem('pioneer_auto_email', autoEmail.toString());
  }, [autoEmail]);

  useEffect(() => {
    localStorage.setItem('pioneer_recipient_email', recipientEmail);
  }, [recipientEmail]);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Session Error:", error.message);
          // If refresh token is invalid or not found, clear local session
          const msg = (error.message || '').toLowerCase();
          const isInvalidToken = msg.includes('refresh_token_not_found') || 
                                msg.includes('refresh token not found') ||
                                msg.includes('invalid refresh token') ||
                                msg.includes('refresh_token_invalid');
          
          if (isInvalidToken) {
            console.warn("Invalid session detected, clearing auth state...");
            try {
              await (supabase.auth as any).signOut({ scope: 'local' }).catch(() => {});
            } catch (signOutErr) {
              console.error("Local sign out failed:", signOutErr);
            }
            setUser(null);
          } else {
            // Also clear user if there is any other error but not matching invalid token
            setUser(null);
          }
        } else {
          setUser(session?.user ?? null);
        }
      } catch (err: any) {
        console.error("Auth initialization failed:", err);
        // Specifically handle browser "Failed to fetch" which can happen if server is unreachable
        if (err.message === 'Failed to fetch') {
          setScanStatus({ message: 'Network Error: Check your connection.', type: 'error' });
        }
      } finally {
        setAuthLoading(false);
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("Auth Event:", event);
      
      if (event === 'SIGNED_OUT') {
        setUser(null);
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        setUser(session?.user ?? null);
      } else if (event === 'USER_UPDATED') {
        setUser(session?.user ?? null);
      }
      
      // Handle the case where refresh fails during a session change
      if (!session && event !== 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const addOrderInfoSize = () => {
    setOrderMasterData(prev => ({
      ...prev,
      sizes: [...prev.sizes, { id: Math.random().toString(36).substr(2, 9), size: '', qty: '' }]
    }));
  };

  const removeOrderInfoSize = (id: string) => {
    if (orderMasterData.sizes.length === 1) return;
    setOrderMasterData(prev => ({
      ...prev,
      sizes: prev.sizes.filter(s => s.id !== id)
    }));
  };

  const updateOrderInfoSize = (id: string, field: 'size' | 'qty', value: string) => {
    setOrderMasterData(prev => ({
      ...prev,
      sizes: prev.sizes.map(s => s.id === id ? { ...s, [field]: value } : s)
    }));
  };

  const handleOrderInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const { buyer, style, po, color, sizes } = orderMasterData;
      
      // Calculate total PO Qty
      const totalPoQty = sizes.reduce((sum, item) => sum + (parseInt(item.qty) || 0), 0);
      
      // Since the table might not exist, we notify the user or try to insert
      // In a real scenario, we'd ensure the table exists or use a generic 'orders' update if applicable.
      // But based on the request, this is a new "Master" info.
      const { error } = await supabase
        .from('order_info')
        .insert([{
          buyer,
          style,
          po,
          color,
          size_data: sizes,
          total_po_qty: totalPoQty,
          factory_name: user?.user_metadata?.factory
        }]);

      if (error) {
        // If table doesn't exist, we might get a 404 or similar
        if (error.code === '42P01') {
          throw new Error('Table "order_info" does not exist. Please run the SQL migration to create it.');
        }
        throw error;
      }

      setModal({
        isOpen: true,
        title: 'Success',
        message: 'Order Information saved successfully!',
        type: 'success'
      });
      
      // Reset form
      setOrderMasterData({
        buyer: '',
        style: '',
        po: '',
        color: '',
        sizes: [{ id: Math.random().toString(36).substr(2, 9), size: '', qty: '' }]
      });
      fetchData();
    } catch (err: any) {
      console.error("Order Info Save Error:", err);
      setModal({
        isOpen: true,
        title: 'Submission Result',
        message: err.message || 'An error occurred while saving.',
        type: err.message?.includes('does not exist') ? 'warning' : 'error'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteOrderInfo = (id: string) => {
    setModal({
      isOpen: true,
      title: 'Delete Order Master',
      message: 'Enter management password to delete this order information:',
      type: 'warning',
      showPasswordInput: true,
      confirmLabel: 'Delete Now',
      onConfirm: async (password) => {
        if (password === 'pg123') {
          setIsLoading(true);
          try {
            const { error } = await supabase
              .from('order_info')
              .delete()
              .eq('id', id);

            if (error) throw error;
            
            setModal({
              isOpen: true,
              title: 'Deleted',
              message: 'Order information has been removed.',
              type: 'success'
            });
            fetchData();
          } catch (err: any) {
            setModal({
              isOpen: true,
              title: 'Error',
              message: err.message || 'Failed to delete.',
              type: 'error'
            });
          } finally {
            setIsLoading(false);
          }
        } else {
          setModal({
            isOpen: true,
            title: 'Permission Denied',
            message: 'Invalid management password.',
            type: 'error'
          });
        }
      }
    });
  };

  const filteredOrderInfo = useMemo(() => {
    let data = dbOrderInfo;
    if (orderInfoSearch.buyer) {
      data = data.filter(o => o.buyer.toLowerCase().includes(orderInfoSearch.buyer.toLowerCase()));
    }
    if (orderInfoSearch.style) {
      data = data.filter(o => o.style.toLowerCase().includes(orderInfoSearch.style.toLowerCase()));
    }
    return data;
  }, [dbOrderInfo, orderInfoSearch]);

  const paginatedOrderInfo = useMemo(() => {
    const start = (orderInfoPage - 1) * rowsPerPage;
    return filteredOrderInfo.slice(start, start + rowsPerPage);
  }, [filteredOrderInfo, orderInfoPage, rowsPerPage]);

  const uniqueSizes = useMemo(() => {
    const sizes = new Set<string>();
    filteredOrderInfo.forEach(order => {
      if (Array.isArray(order.size_data)) {
        order.size_data.forEach((s: any) => {
          if (s.size) sizes.add(s.size);
        });
      }
    });
    return Array.from(sizes).sort();
  }, [filteredOrderInfo]);

  const orderInfoTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    uniqueSizes.forEach(size => totals[size] = 0);
    let grandTotal = 0;

    filteredOrderInfo.forEach(order => {
      uniqueSizes.forEach(size => {
        const sizeObj = (order.size_data || []).find((s: any) => s.size === size);
        if (sizeObj) {
          totals[size] += (parseInt(sizeObj.qty) || 0);
        }
      });
      grandTotal += (parseInt(order.total_po_qty) || 0);
    });

    return { totals, grandTotal };
  }, [filteredOrderInfo, uniqueSizes]);

  const handleExportOrderInfoExcel = async () => {
    if (filteredOrderInfo.length === 0) {
      setModal({ isOpen: true, title: 'No Data', message: 'No records to export.', type: 'warning' });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Order Database');

    // Headers
    const headers = ['Date', 'Time', 'Buyer', 'Style', 'PO', 'Color', ...uniqueSizes.map(s => `${s} Qty`), 'Total PO Qty'];
    const headerRow = worksheet.addRow(headers);
    
    // Style headers
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center' };
    });

    // Content
    filteredOrderInfo.forEach(order => {
      const date = new Date(order.created_at);
      const rowData: any[] = [
        date.toLocaleDateString(),
        date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        order.buyer || 'N/A',
        order.style,
        order.po,
        order.color,
      ];

      // Add each size qty
      uniqueSizes.forEach(sizeName => {
        const sizeObj = (order.size_data || []).find((s: any) => s.size === sizeName);
        rowData.push(sizeObj ? parseInt(sizeObj.qty) || 0 : 0);
      });

      rowData.push(parseInt(order.total_po_qty) || 0);
      worksheet.addRow(rowData);
    });

    // Add Totals Row
    const totalRowData: any[] = ['', '', 'TOTAL', '', '', ''];
    uniqueSizes.forEach(size => {
      totalRowData.push(orderInfoTotals.totals[size]);
    });
    totalRowData.push(orderInfoTotals.grandTotal);
    
    const totalRow = worksheet.addRow(totalRowData);
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.border = { top: { style: 'thin' } };
    });

    // Adjust column widths
    worksheet.columns.forEach(column => {
      column.width = 15;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Order_Database_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  useEffect(() => {
    if (activeTab === 'scan' && formData.id) {
      const existing = dbOrders.find(o => o.bundle_id.toUpperCase() === formData.id.toUpperCase());
      if (existing) {
        const prevNet = getPreviousNetQty(existing, selectedProcess);
        if (prevNet !== null && prevNet !== undefined) {
          setFormData(prev => ({ ...prev, qty: prevNet.toString() }));
        }
      }
    }
  }, [formData.id, selectedProcess, activeTab, dbOrders]);

  const handleQRScanResult = useCallback((decodedText: string) => {
    try {
      if (decodedText.includes('|')) {
        const parts = decodedText.split('|');
        const data: Record<string, string> = {};
        parts.forEach(part => {
          const [key, val] = part.split('=');
          if (key && val) data[key.trim()] = val.trim();
        });

        setFormData(prev => ({
          ...prev,
          id: data['ID'] || prev.id,
          buyer: data['Buyer'] || prev.buyer,
          style: data['Style'] || prev.style,
          po: data['PO'] || prev.po,
          color: data['Color'] || prev.color,
          size: data['Size'] || prev.size,
          po_qty: data['PO Qty'] || data['Total Qty'] || data['Order Qty'] || prev.po_qty,
          qty: data['Bundle Qty'] || data['Qty'] || BUNDLE_QTY_FIXED.toString()
        }));
        setScanStatus({ message: 'QR Parsed Successfully', type: 'success' });
      } else {
        setFormData(prev => ({ ...prev, id: decodedText }));
        setScanStatus({ message: 'QR Captured', type: 'warning' });
      }
      setShowCamera(false);
    } catch (e) {
      setScanStatus({ message: 'QR Read Error', type: 'error' });
    }
  }, []);

  const handleAddToOrder = async () => {
    if (!formData.id || !formData.style || !formData.po || !formData.po_qty) {
      setScanStatus({ message: 'Bundle ID, Style, PO, and PO Quantity are mandatory.', type: 'error' });
      return;
    }

    const bundleId = formData.id.toUpperCase();
    const totalBundleQty = parseInt(formData.qty) || 0;
    const rejQty = parseInt(rejectionQty) || 0;
    const netProductionQty = Math.max(0, totalBundleQty - rejQty);
    const poQtyValue = parseInt(formData.po_qty) || 0;
    const targetColumn = processToColumn(selectedProcess);

    setScanStatus({ message: 'Processing with Supabase...', type: 'warning' });

    try {
      // 1. Fetch existing order to check sequence and get current rejection totals
      const userFactory = user?.user_metadata?.factory;
      let query = supabase
        .from('orders')
        .select('*')
        .eq('bundle_id', bundleId);

      if (userFactory === 'Maxcom International (BD) Limited') {
        query = query.or(`factory_name.eq."${userFactory}",factory_name.is.null`);
      } else {
        query = query.eq('factory_name', userFactory || '');
      }

      const { data: existing, error: fetchErr } = await query.maybeSingle();

      if (fetchErr) throw fetchErr;
      
      const prevNet = getPreviousNetQty(existing, selectedProcess);
      if (prevNet !== null && prevNet !== undefined && totalBundleQty > prevNet) {
        setScanStatus({ message: `Quantity Error: Cannot process ${totalBundleQty} pcs. Only ${prevNet} pcs were completed in the previous stage.`, type: 'error' });
        return;
      }

      // Sequence Validation (only for production)
      if (netProductionQty > 0) {
        if (selectedProcess === 'Cutting Output') {
          if (!existing || !existing.cutting_in) {
            setScanStatus({ message: 'Sequence Error: Cutting Input must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Sewing Input') {
          if (!existing || !existing.cutting_out) {
            setScanStatus({ message: 'Sequence Error: Cutting Output must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Sewing Output') {
          if (!existing || !existing.sew_in) {
            setScanStatus({ message: 'Sequence Error: Sewing Input must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Send to Wash') {
          if (!existing || !existing.sew_out) {
            setScanStatus({ message: 'Sequence Error: Sewing Output must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Wash Input') {
          if (!existing || !existing.send_to_wash) {
            setScanStatus({ message: 'Sequence Error: Send to Wash must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Wash Output') {
          if (!existing || !existing.wash_in) {
            setScanStatus({ message: 'Sequence Error: Wash Input must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Finishing Input') {
          if (!existing || (!existing.sew_out && !existing.wash_out)) {
            setScanStatus({ message: 'Sequence Error: Sewing Output or Wash Output must be completed first.', type: 'error' });
            return;
          }
        } else if (selectedProcess === 'Finishing Output') {
          if (!existing || !existing.fin_in) {
            setScanStatus({ message: 'Sequence Error: Finishing Input must be completed first.', type: 'error' });
            return;
          }
        }
      }

      // 2. Prepare Payload for Orders (Summary)
      const payload: any = {
        bundle_id: bundleId,
        buyer: formData.buyer || 'TBA',
        style: formData.style,
        po: formData.po,
        color: formData.color || 'N/A',
        size: formData.size || 'N/A',
        po_quantity: poQtyValue,
        [targetColumn]: (existing?.[targetColumn] || 0) + netProductionQty,
        line: selectedLine,
        factory_name: user?.user_metadata?.factory
      };

      // If there's a rejection, update summary and log it
      if (rejQty > 0) {
        payload.total_rejections = (existing?.total_rejections || 0) + rejQty;
        payload.last_rejection_at = new Date().toISOString();

        // 2a. Insert Rejection Log entry
        const { error: logErr } = await supabase
          .from('rejection_logs')
          .insert([{
            bundle_id: bundleId,
            buyer: formData.buyer || 'TBA',
            style: formData.style,
            po: formData.po,
            color: formData.color || 'N/A',
            size: formData.size || 'N/A',
            po_qty: poQtyValue,
            bundle_qty: totalBundleQty,
            rejections_qty: rejQty,
            process: selectedProcess,
            line: selectedLine,
            reason: rejectionReason || 'No reason provided',
            factory_name: user?.user_metadata?.factory
          }]);
        
        if (logErr) {
          console.error("Log Error:", logErr);
          throw logErr;
        }
      }

      if (selectedProcess.includes('Sewing')) {
        payload.sewing_line = selectedLine;
      } else if (selectedProcess.includes('Finishing')) {
        payload.finishing_line = selectedLine;
      } else if (selectedProcess.includes('Cutting')) {
        payload.cutting_line = selectedLine;
      } else if (selectedProcess.includes('Wash')) {
        payload.wash_line = selectedLine;
      }

      // 3. Update or Insert
      if (existing) {
        const { error: updateErr } = await supabase
          .from('orders')
          .update(payload)
          .eq('id', existing.id);
        
        if (updateErr) throw updateErr;
      } else {
        const { error: insertErr } = await supabase
          .from('orders')
          .insert([payload]);
        
        if (insertErr) throw insertErr;
      }

      setScanStatus({ 
        message: rejQty > 0 
          ? `Success: ${netProductionQty} production & ${rejQty} rejection recorded.` 
          : 'Production data recorded successfully.', 
        type: 'success' 
      });
      
      // Reset form
      setFormData(prev => ({ ...prev, id: '' }));
      setRejectionQty('0');
      setRejectionReason('');
      await fetchData();
    } catch (e: any) {
      console.error("Supabase Error:", e);
      setScanStatus({ message: `Sync Error: ${e.message}`, type: 'error' });
    }
  };

  const handleEraseAllData = async () => {
    setModal({
      isOpen: true,
      title: 'Danger Zone',
      message: "This will permanently delete all production logs in the 'orders' table. This action cannot be undone.",
      type: 'warning',
      confirmLabel: 'Erase All Data',
      showPasswordInput: true,
      onConfirm: async (password) => {
        const adminPass = import.meta.env.VITE_ADMIN_PASSWORD || '';
        if (password !== adminPass) {
          setScanStatus({ message: 'Invalid Password. Action Aborted.', type: 'error' });
          return;
        }
        setScanStatus({ message: 'Wiping database...', type: 'warning' });
        try {
          const userFactory = user?.user_metadata?.factory;
          if (!userFactory) throw new Error("No factory assigned to user.");

          const { error: error1 } = await supabase
            .from('orders')
            .delete()
            .eq('factory_name', userFactory);

          const { error: error2 } = await supabase
            .from('rejection_logs')
            .delete()
            .eq('factory_name', userFactory);

          if (error1) throw error1;
          if (error2) throw error2;
          
          setScanStatus({ message: 'Database successfully cleared.', type: 'success' });
          setDbOrders([]);
          setDbRejections([]);
          setModal({
            isOpen: true,
            title: 'Success',
            message: 'Database successfully cleared.',
            type: 'success'
          });
        } catch (e: any) {
          console.error("Delete Error:", e);
          setScanStatus({ message: 'Failed to clear database.', type: 'error' });
          setModal({
            isOpen: true,
            title: 'Error',
            message: 'Failed to clear database. Please check your connection.',
            type: 'error'
          });
        }
      }
    });
  };

  const handleDeleteRecord = async (bundleId: string, process: string) => {
    const col = processToColumn(process);
    setModal({
      isOpen: true,
      title: 'Delete Record',
      message: `Are you sure you want to delete the ${process} record for bundle ${bundleId}?`,
      type: 'warning',
      confirmLabel: 'Delete',
      showPasswordInput: true,
      onConfirm: async (password) => {
        const adminPass = import.meta.env.VITE_ADMIN_PASSWORD || '';
        if (password !== adminPass) {
          setScanStatus({ message: 'Invalid Password. Action Aborted.', type: 'error' });
          return;
        }
        setScanStatus({ message: 'Deleting record...', type: 'warning' });
        try {
          const userFactory = user?.user_metadata?.factory;
          let query = supabase
            .from('orders')
            .update({ [col]: 0 })
            .eq('bundle_id', bundleId);
          
          if (userFactory === 'Maxcom International (BD) Limited') {
            query = query.or(`factory_name.eq."${userFactory}",factory_name.is.null`);
          } else {
            query = query.eq('factory_name', userFactory || '');
          }

          const { error } = await query;

          if (error) throw error;
          
          setScanStatus({ message: 'Record successfully deleted.', type: 'success' });
          await fetchData();
        } catch (e: any) {
          console.error("Delete Error:", e);
          setScanStatus({ message: 'Failed to delete record.', type: 'error' });
        }
      }
    });
  };

  const handleDeleteRejection = async (log: any) => {
    setModal({
      isOpen: true,
      title: 'Delete Rejection Record',
      message: `Delete this rejection of ${log.rejections_qty} for ${log.bundle_id} at ${log.process}?`,
      type: 'warning',
      confirmLabel: 'Delete',
      showPasswordInput: true,
      onConfirm: async (password) => {
        const adminPass = import.meta.env.VITE_ADMIN_PASSWORD || '';
        if (password !== adminPass) {
          setScanStatus({ message: 'Invalid Password. Action Aborted.', type: 'error' });
          return;
        }
        setScanStatus({ message: 'Deleting rejection log...', type: 'warning' });
        try {
          // 1. Delete the log
          const { error: deleteErr } = await supabase
            .from('rejection_logs')
            .delete()
            .eq('id', log.id);

          if (deleteErr) throw deleteErr;

          // 2. Decrement the total_rejections in orders table
          const existing = dbOrders.find(o => o.bundle_id === log.bundle_id);
          if (existing) {
            const newTotal = Math.max(0, (existing.total_rejections || 0) - (log.rejections_qty || 0));
            const userFactory = user?.user_metadata?.factory;
            let query = supabase
              .from('orders')
              .update({ total_rejections: newTotal })
              .eq('bundle_id', log.bundle_id);
            
            if (userFactory === 'Maxcom International (BD) Limited') {
              query = query.or(`factory_name.eq."${userFactory}",factory_name.is.null`);
            } else {
              query = query.eq('factory_name', userFactory || '');
            }

            const { error: updateErr } = await query;
            
            if (updateErr) throw updateErr;
          }
          
          setScanStatus({ message: 'Rejection record removed.', type: 'success' });
          await fetchData();
        } catch (e: any) {
          console.error("Rejection Delete Error:", e);
          setScanStatus({ message: 'Failed to delete rejection.', type: 'error' });
        }
      }
    });
  };

  const handleExportExcel = async () => {
    if (filteredOrders.length === 0) {
      setModal({
        isOpen: true,
        title: 'No Data',
        message: 'There is no production data available for the current filters to export.',
        type: 'info'
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Production Report');

    // Define columns
    const columns = [
      { header: 'Scan Date/Time', key: 'scan_time', width: 25 },
      { header: 'Bundle ID', key: 'bundle_id', width: 20 },
      { header: 'Buyer', key: 'buyer', width: 15 },
      { header: 'Style', key: 'style', width: 20 },
      { header: 'PO Number', key: 'po', width: 15 },
      { header: 'Color', key: 'color', width: 12 },
      { header: 'Size', key: 'size', width: 10 },
      { header: 'PO Total Qty', key: 'po_qty', width: 15 },
    ];

    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Cutting') {
      columns.push({ header: 'Cutting Input', key: 'cutting_in', width: 15 });
      columns.push({ header: 'Cutting Output', key: 'cutting_out', width: 15 });
      columns.push({ header: 'Cutting Line', key: 'cutting_line', width: 15 });
    }
    
    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing') {
      columns.push({ header: 'Sewing Input', key: 'sew_in', width: 15 });
      columns.push({ header: 'Sewing Output', key: 'sew_out', width: 15 });
      columns.push({ header: 'Sewing Line', key: 'sew_line', width: 15 });
    }

    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Wash') {
      columns.push({ header: 'Send to Wash', key: 'send_to_wash', width: 15 });
      columns.push({ header: 'Wash Input', key: 'wash_in', width: 15 });
      columns.push({ header: 'Wash Output', key: 'wash_out', width: 15 });
      columns.push({ header: 'Wash Line', key: 'wash_line', width: 15 });
    }

    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Finishing') {
      columns.push({ header: 'Finishing Input', key: 'fin_in', width: 15 });
      columns.push({ header: 'Finishing Output', key: 'fin_out', width: 15 });
      columns.push({ header: 'Finishing Line', key: 'fin_line', width: 15 });
    }

    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing' || orderCategoryFilter === 'Finishing') {
      columns.push({ header: 'Last Line', key: 'last_line', width: 15 });
    }

    columns.push({ header: 'Total Rejections', key: 'total_rejections', width: 15 });

    worksheet.columns = columns;

    // Add data
    filteredOrders.forEach(o => {
      const rowData: any = {
        scan_time: o.created_at ? new Date(o.created_at).toLocaleString() : '-',
        bundle_id: o.bundle_id,
        buyer: o.buyer,
        style: o.style,
        po: o.po,
        color: o.color,
        size: o.size,
        po_qty: o.po_quantity,
        last_line: o.line,
        total_rejections: o.total_rejections || 0
      };

      if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Cutting') {
        rowData.cutting_in = o.cutting_in || 0;
        rowData.cutting_out = o.cutting_out || 0;
        rowData.cutting_line = o.cutting_line || '-';
      }
      if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing') {
        rowData.sew_in = o.sew_in || 0;
        rowData.sew_out = o.sew_out || 0;
        rowData.sew_line = o.sewing_line || '-';
      }
      if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Wash') {
        rowData.send_to_wash = o.send_to_wash || 0;
        rowData.wash_in = o.wash_in || 0;
        rowData.wash_out = o.wash_out || 0;
        rowData.wash_line = o.wash_line || '-';
      }
      if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Finishing') {
        rowData.fin_in = o.fin_in || 0;
        rowData.fin_out = o.fin_out || 0;
        rowData.fin_line = o.finishing_line || '-';
      }

      worksheet.addRow(rowData);
    });

    // Add Grand Total row
    const totalRowData: any = {
      scan_time: 'GRAND TOTAL',
      po_qty: reportTotals.po_qty
    };

    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Cutting') {
      totalRowData.cutting_in = reportTotals.cutting_in;
      totalRowData.cutting_out = reportTotals.cutting_out;
      totalRowData.cutting_line = '-';
    }
    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing') {
      totalRowData.sew_in = reportTotals.sew_in;
      totalRowData.sew_out = reportTotals.sew_out;
      totalRowData.sew_line = '-';
    }
    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Wash') {
      totalRowData.send_to_wash = reportTotals.send_to_wash;
      totalRowData.wash_in = reportTotals.wash_in;
      totalRowData.wash_out = reportTotals.wash_out;
      totalRowData.wash_line = '-';
    }
    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Finishing') {
      totalRowData.fin_in = reportTotals.fin_in;
      totalRowData.fin_out = reportTotals.fin_out;
      totalRowData.fin_line = '-';
    }
    if (orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing' || orderCategoryFilter === 'Finishing') {
      totalRowData.last_line = '-';
    }

    const totalRow = worksheet.addRow(totalRowData);
    totalRow.height = 25;
    totalRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }; // Slate 900
      cell.border = {
        top: { style: 'medium', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'medium', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };
      if (typeof cell.value === 'number') {
        cell.numFmt = '#,##0';
      }
    });

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      const headerText = cell.value as string;
      
      // Default style
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0F172A' } // Slate 900
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' },
        bold: true,
        size: 11
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
      };

      // Specific process colors
      if (headerText.includes('Cutting')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
      } else if (headerText.includes('Sewing')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9F1239' } };
      } else if (headerText.includes('Wash')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92400E' } };
      } else if (headerText.includes('Finishing')) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };
      }
    });

    // Style all data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header
      
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
      });
    });

    // Generate and save
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `Pioneer_Group_${orderCategoryFilter}_Report_${new Date().toLocaleDateString('en-CA')}.xlsx`;
    saveAs(blob, fileName);
  };

  const handleExportRejectionsExcel = async () => {
    if (filteredRejections.length === 0) {
      setModal({
        isOpen: true,
        title: 'No Data',
        message: 'There is no rejection data available for the current filters to export.',
        type: 'info'
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rejections Report');

    worksheet.columns = [
      { header: 'Scan Date/Time', key: 'scan_time', width: 25 },
      { header: 'Bundle ID', key: 'bundle_id', width: 20 },
      { header: 'Buyer', key: 'buyer', width: 15 },
      { header: 'Style', key: 'style', width: 20 },
      { header: 'PO Number', key: 'po', width: 15 },
      { header: 'Color', key: 'color', width: 12 },
      { header: 'Size', key: 'size', width: 10 },
      { header: 'PO Qty', key: 'po_qty', width: 15 },
      { header: 'Rejection Qty', key: 'rejections_qty', width: 15 },
      { header: 'Process', key: 'process', width: 15 },
      { header: 'Line', key: 'line', width: 15 },
      { header: 'Reason', key: 'reason', width: 25 }
    ];

    filteredRejections.forEach(r => {
      worksheet.addRow({
        scan_time: r.created_at ? new Date(r.created_at).toLocaleString() : '-',
        bundle_id: r.bundle_id,
        buyer: r.buyer,
        style: r.style,
        po: r.po,
        color: r.color,
        size: r.size,
        po_qty: r.po_qty,
        rejections_qty: r.rejections_qty,
        process: r.process,
        line: r.line,
        reason: r.reason || '-'
      });
    });

    // Style the header
    const headerRow = worksheet.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Style data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Rejections_Report_${new Date().toLocaleDateString('en-CA')}.xlsx`);
  };

  const dashboardStats = useMemo(() => {
    const startDate = new Date(dashboardStartDate);
    const endDate = new Date(dashboardEndDate);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const stats = {
      cutting: { output: 0, input: 0, rejections: 0 },
      sewing: { output: 0, input: 0, rejections: 0 },
      wash: { output: 0, input: 0, rejections: 0 },
      finishing: { output: 0, input: 0, rejections: 0 },
      totalRejections: 0
    };

    dbOrders.forEach(order => {
      const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString('en-CA') : null;
      if (orderDate && orderDate >= dashboardStartDate && orderDate <= dashboardEndDate) {
        stats.cutting.input += (order.cutting_in || 0);
        stats.cutting.output += (order.cutting_out || 0);
        stats.sewing.input += (order.sew_in || 0);
        stats.sewing.output += (order.sew_out || 0);
        stats.wash.input += (order.wash_in || 0);
        stats.wash.output += (order.wash_out || 0);
        stats.finishing.input += (order.fin_in || 0);
        stats.finishing.output += (order.fin_out || 0);
        stats.totalRejections += (order.total_rejections || 0);
      }
    });

    const filteredRejections = dbRejections.filter(r => {
      const rejDate = r.created_at ? new Date(r.created_at).toLocaleDateString('en-CA') : null;
      return rejDate && rejDate >= dashboardStartDate && rejDate <= dashboardEndDate;
    });

    const calcWip = (input: number, output: number) => Math.max(0, input - output);
    const calcEff = (input: number, output: number) => Math.round((output / (input || 1)) * 100) || 0;

    return {
      cutting: { ...stats.cutting, wip: calcWip(stats.cutting.input, stats.cutting.output), eff: calcEff(stats.cutting.input, stats.cutting.output) },
      sewing: { ...stats.sewing, wip: calcWip(stats.sewing.input, stats.sewing.output), eff: calcEff(stats.sewing.input, stats.sewing.output) },
      wash: { ...stats.wash, wip: calcWip(stats.wash.input, stats.wash.output), eff: calcEff(stats.wash.input, stats.wash.output) },
      finishing: { ...stats.finishing, wip: calcWip(stats.finishing.input, stats.finishing.output), eff: calcEff(stats.finishing.input, stats.finishing.output) },
      totalRejections: stats.totalRejections,
      filteredRejections
    };
  }, [dbOrders, dbRejections, dashboardStartDate, dashboardEndDate]);

  const linePerformanceData = useMemo(() => {
    const linesCount = performanceView === 'Sewing' ? 15 : 10;
    return Array.from({ length: linesCount }, (_, i) => {
      const lineName = `Line-${i + 1}`;
      const lineOrders = dbOrders.filter(o => {
        const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('en-CA') : null;
        return o.line === lineName && orderDate && orderDate >= dashboardStartDate && orderDate <= dashboardEndDate;
      });
      
      let input = 0, output = 0, rejections = 0;
      if (performanceView === 'Sewing') {
        input = lineOrders.reduce((sum, o) => sum + (o.sew_in || 0), 0);
        output = lineOrders.reduce((sum, o) => sum + (o.sew_out || 0), 0);
      } else {
        input = lineOrders.reduce((sum, o) => sum + (o.fin_in || 0), 0);
        output = lineOrders.reduce((sum, o) => sum + (o.fin_out || 0), 0);
      }
      rejections = lineOrders.reduce((sum, o) => sum + (o.total_rejections || 0), 0);

      return { line: lineName, input, output, rejections, wip: Math.max(0, input - output), status: output > 0 ? 'Active' : 'Idle' };
    });
  }, [dbOrders, performanceView, dashboardStartDate, dashboardEndDate]);

  const filteredOrders = useMemo(() => {
    return dbOrders.filter(o => {
      const mb = !orderSearch.buyer || (o.buyer || '').toLowerCase().includes(orderSearch.buyer.toLowerCase());
      const ms = !orderSearch.style || (o.style || '').toLowerCase().includes(orderSearch.style.toLowerCase());
      const mp = !orderSearch.po || (o.po || '').toLowerCase().includes(orderSearch.po.toLowerCase());
      
      const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('en-CA') : null;
      const msDate = !orderStartDate || (orderDate && orderDate >= orderStartDate);
      const meDate = !orderEndDate || (orderDate && orderDate <= orderEndDate);
      const md = msDate && meDate;
      
      let mc = true;
      if (orderCategoryFilter === 'Cutting') mc = (o.cutting_in > 0 || o.cutting_out > 0);
      else if (orderCategoryFilter === 'Sewing') mc = (o.sew_in > 0 || o.sew_out > 0);
      else if (orderCategoryFilter === 'Wash') mc = (o.send_to_wash > 0 || o.wash_in > 0 || o.wash_out > 0);
      else if (orderCategoryFilter === 'Finishing') mc = (o.fin_in > 0 || o.fin_out > 0);
      
      const mps = orderProcessStepFilter === 'ALL' || (o[processToColumn(orderProcessStepFilter)] > 0);
      const msl = orderSewingLineFilter === 'ALL' || o.sewing_line === orderSewingLineFilter;
      const mfl = orderFinishingLineFilter === 'ALL' || o.finishing_line === orderFinishingLineFilter;
      
      return mb && ms && mp && mc && md && mps && msl && mfl;
    });
  }, [dbOrders, orderSearch, orderCategoryFilter, orderStartDate, orderEndDate, orderProcessStepFilter, orderSewingLineFilter, orderFinishingLineFilter]);

  const paginatedOrders = useMemo(() => {
    const start = (ordersPage - 1) * rowsPerPage;
    return filteredOrders.slice(start, start + rowsPerPage);
  }, [filteredOrders, ordersPage, rowsPerPage]);

  const hourlyReportData = useMemo(() => {
    const hours = Array.from({ length: 13 }, (_, i) => i + 8); // 8am to 8pm
    const processCol = processToColumn(hourlyReportProcess);
    const isSewing = hourlyReportProcess.includes('Sewing');
    
    // Group orders by line, buyer, style
    const groups: { [key: string]: any } = {};
    
    dbOrders.forEach(o => {
      const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('en-CA') : null;
      if (orderDate !== hourlyReportDate) return;
      
      // Use specific line column based on process
      const line = isSewing ? (o.sewing_line || '') : (o.finishing_line || '');
      if (!line) return; // Only show records that have a line assigned for this process

      const buyer = o.buyer || 'TBA';
      const style = o.style || 'N/A';
      const key = `${line}|${buyer}|${style}`;
      
      if (!groups[key]) {
        groups[key] = {
          line,
          buyer,
          style,
          po_qty: o.po_quantity || 0,
          total_input: 0,
          total_output: 0,
          hourly_output: hours.reduce((acc: any, h) => { acc[h] = 0; return acc; }, {})
        };
      }
      
      // Calculate inputs/outputs based on process
      if (isSewing) {
        groups[key].total_input += (o.sew_in || 0);
        groups[key].total_output += (o.sew_out || 0);
      } else {
        groups[key].total_input += (o.fin_in || 0);
        groups[key].total_output += (o.fin_out || 0);
      }

      // Hourly output for the selected process
      if (o[processCol] > 0) {
        const scanTime = new Date(o.created_at);
        const hour = scanTime.getHours();
        if (groups[key].hourly_output[hour] !== undefined) {
          groups[key].hourly_output[hour] += o[processCol];
        }
      }
    });

    return Object.values(groups).map(g => ({
      ...g,
      wip: Math.max(0, g.total_input - g.total_output)
    }));
  }, [dbOrders, hourlyReportDate, hourlyReportProcess]);

  const filteredHistory = useMemo(() => {
    return dbOrders.filter(o => {
      const matchesId = !historySearch.bundleId || o.bundle_id.toLowerCase().includes(historySearch.bundleId.toLowerCase());
      
      const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('en-CA') : null;
      const matchesStartDate = !historySearch.startDate || (orderDate && orderDate >= historySearch.startDate);
      const matchesEndDate = !historySearch.endDate || (orderDate && orderDate <= historySearch.endDate);
      const matchesDate = matchesStartDate && matchesEndDate;
      
      let matchesProcess = true;
      if (historySearch.process !== 'ALL') {
        const col = processToColumn(historySearch.process);
        matchesProcess = (o[col] > 0);
      }

      const matchesSewingLine = historySearch.sewingLine === 'ALL' || o.sewing_line === historySearch.sewingLine;
      const matchesFinishingLine = historySearch.finishingLine === 'ALL' || o.finishing_line === historySearch.finishingLine;

      return matchesId && matchesDate && matchesProcess && matchesSewingLine && matchesFinishingLine;
    });
  }, [dbOrders, historySearch]);

  const paginatedHourlyReports = useMemo(() => {
    const start = (hourlyReportsPage - 1) * rowsPerPage;
    return hourlyReportData.slice(start, start + rowsPerPage);
  }, [hourlyReportData, hourlyReportsPage]);

  const paginatedHistory = useMemo(() => {
    const start = (historyPage - 1) * rowsPerPage;
    return filteredHistory.slice(start, start + rowsPerPage);
  }, [filteredHistory, historyPage, rowsPerPage]);

  const filteredRejections = useMemo(() => {
    return dbRejections.filter(r => {
      const mb = !rejectionSearch.buyer || (r.buyer || '').toLowerCase().includes(rejectionSearch.buyer.toLowerCase());
      const ms = !rejectionSearch.style || (r.style || '').toLowerCase().includes(rejectionSearch.style.toLowerCase());
      const mp = !rejectionSearch.po || (r.po || '').toLowerCase().includes(rejectionSearch.po.toLowerCase());
      
      const rejDate = r.created_at ? new Date(r.created_at).toLocaleDateString('en-CA') : null;
      const msDate = !rejectionStartDate || (rejDate && rejDate >= rejectionStartDate);
      const meDate = !rejectionEndDate || (rejDate && rejDate <= rejectionEndDate);
      const md = msDate && meDate;

      let mc = true;
      if (rejectionCategoryFilter !== 'ALL') {
        const process = (r.process || '').toLowerCase();
        if (rejectionCategoryFilter === 'Cutting') mc = process.includes('cutting');
        else if (rejectionCategoryFilter === 'Sewing') mc = process.includes('sewing');
        else if (rejectionCategoryFilter === 'Wash') mc = process.includes('wash');
        else if (rejectionCategoryFilter === 'Finishing') mc = process.includes('finishing');
      }
      
      return mb && ms && mp && mc && md;
    });
  }, [dbRejections, rejectionSearch, rejectionCategoryFilter, rejectionStartDate, rejectionEndDate]);

  const paginatedRejections = useMemo(() => {
    const start = (rejectionsPage - 1) * rowsPerPage;
    return filteredRejections.slice(start, start + rowsPerPage);
  }, [filteredRejections, rejectionsPage, rowsPerPage]);

  const reportTotals = useMemo(() => {
    return filteredOrders.reduce((acc, o) => {
      acc.po_qty += (o.po_quantity || 0);
      acc.cutting_in += (o.cutting_in || 0);
      acc.cutting_out += (o.cutting_out || 0);
      acc.sew_in += (o.sew_in || 0);
      acc.sew_out += (o.sew_out || 0);
      acc.send_to_wash += (o.send_to_wash || 0);
      acc.wash_in += (o.wash_in || 0);
      acc.wash_out += (o.wash_out || 0);
      acc.fin_in += (o.fin_in || 0);
      acc.fin_out += (o.fin_out || 0);
      acc.total_rejections += (o.total_rejections || 0);
      return acc;
    }, { po_qty: 0, cutting_in: 0, cutting_out: 0, sew_in: 0, sew_out: 0, send_to_wash: 0, wash_in: 0, wash_out: 0, fin_in: 0, fin_out: 0, total_rejections: 0 });
  }, [filteredOrders]);

  const chartData = useMemo(() => {
    const logs: any[] = [];
    dbOrders.forEach(o => {
      const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('en-CA') : null;
      if (orderDate && orderDate >= dashboardStartDate && orderDate <= dashboardEndDate) {
        if (o.cutting_in > 0) logs.push({ process: 'Cutting Input', qty: o.cutting_in, scan_time: o.created_at });
        if (o.cutting_out > 0) logs.push({ process: 'Cutting Output', qty: o.cutting_out, scan_time: o.created_at });
        if (o.sew_in > 0) logs.push({ process: 'Sewing Input', qty: o.sew_in, scan_time: o.created_at });
        if (o.sew_out > 0) logs.push({ process: 'Sewing Output', qty: o.sew_out, scan_time: o.created_at });
        if (o.send_to_wash > 0) logs.push({ process: 'Send to Wash', qty: o.send_to_wash, scan_time: o.created_at });
        if (o.wash_in > 0) logs.push({ process: 'Wash Input', qty: o.wash_in, scan_time: o.created_at });
        if (o.wash_out > 0) logs.push({ process: 'Wash Output', qty: o.wash_out, scan_time: o.created_at });
        if (o.fin_in > 0) logs.push({ process: 'Finishing Input', qty: o.fin_in, scan_time: o.created_at });
        if (o.fin_out > 0) logs.push({ process: 'Finishing Output', qty: o.fin_out, scan_time: o.created_at });
      }
    });
    return logs;
  }, [dbOrders, dashboardStartDate, dashboardEndDate]);

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="animate-spin text-blue-600" size={40} />
          <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Securing Connection...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth onSuccess={setUser} />;
  }

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={user}>
      {!isSupabaseConfigured && (
        <div className="mx-4 md:mx-8 mt-4 bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-4 text-amber-800">
          <AlertCircle size={20} className="shrink-0" />
          <div className="text-xs font-bold">
            <p className="uppercase tracking-wider mb-1">Database Not Connected</p>
            <p className="font-medium opacity-80">Please configure your Supabase URL and Anon Key in the environment variables to enable data synchronization.</p>
          </div>
        </div>
      )}
      {activeTab === 'dashboard' && (
        <div className="space-y-12 animate-fadeIn">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Start Date</label>
                  <input 
                    type="date" 
                    value={dashboardStartDate} 
                    onChange={(e) => setDashboardStartDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all"
                  />
                </div>
                <div className="text-slate-300 font-black mt-4">TO</div>
                <div className="flex flex-col">
                  <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">End Date</label>
                  <input 
                    type="date" 
                    value={dashboardEndDate} 
                    onChange={(e) => setDashboardEndDate(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all"
                  />
                </div>
                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={() => {
                      const today = new Date().toLocaleDateString('en-CA');
                      setDashboardStartDate(today);
                      setDashboardEndDate(today);
                    }}
                    className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      const yesterday = d.toLocaleDateString('en-CA');
                      setDashboardStartDate(yesterday);
                      setDashboardEndDate(yesterday);
                    }}
                    className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                  >
                    Yesterday
                  </button>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase">Viewing Tenure</p>
                <p className="text-sm font-black text-slate-900">{new Date(dashboardStartDate).toLocaleDateString()} - {new Date(dashboardEndDate).toLocaleDateString()}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              <DashboardCard icon={Scissors} title="Cutting" value={dashboardStats.cutting.output} color="blue" label="CUT" subMetrics={[{label:'Input', value:dashboardStats.cutting.input}, {label:'WIP', value:dashboardStats.cutting.wip}, {label:'Achieve%', value:dashboardStats.cutting.eff+'%', highlight:true}]} />
              <DashboardCard icon={Thread} title="Sewing" value={dashboardStats.sewing.output} color="tan" label="SEW" subMetrics={[{label:'Input', value:dashboardStats.sewing.input}, {label:'WIP', value:dashboardStats.sewing.wip}, {label:'Achieve%', value:dashboardStats.sewing.eff+'%', highlight:true}]} />
              <DashboardCard icon={Droplets} title="Wash" value={dashboardStats.wash.output} color="amber" label="WSH" subMetrics={[{label:'Input', value:dashboardStats.wash.input}, {label:'WIP', value:dashboardStats.wash.wip}, {label:'Achieve%', value:dashboardStats.wash.eff+'%', highlight:true}]} />
              <DashboardCard icon={Flag} title="Finishing" value={dashboardStats.finishing.output} color="emerald" label="FIN" subMetrics={[{label:'Input', value:dashboardStats.finishing.input}, {label:'WIP', value:dashboardStats.finishing.wip}, {label:'Achieve%', value:dashboardStats.finishing.eff+'%', highlight:true}]} />
              <DashboardCard icon={AlertCircle} title="Rejections" value={dashboardStats.totalRejections} color="rose" label="REJ" subMetrics={[{label:'Alerts', value:dashboardStats.filteredRejections.length}, {label:'Bundles Impacted', value:dashboardStats.filteredRejections.reduce((acc, r) => acc.add(r.bundle_id), new Set()).size}]} />
            </div>
          
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
            <div className="bg-slate-900 px-8 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
              <h3 className="text-xl font-black text-white uppercase">Floor Matrix</h3>
              <div className="flex bg-slate-800 p-1 rounded-2xl">
                {['Sewing', 'Finishing'].map((v: any) => (
                  <button key={v} onClick={() => setPerformanceView(v)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${performanceView === v ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400'}`}>{v}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-400 uppercase text-[9px] font-black border-b">
                  <tr>
                    <th className="px-8 py-5">Line</th>
                    <th className="px-8 py-5">Input</th>
                    <th className="px-8 py-5">Output</th>
                    <th className="px-8 py-5 text-rose-500">Rejections</th>
                    <th className="px-8 py-5">WIP</th>
                    <th className="px-8 py-5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-[11px] font-bold text-black">
                  {linePerformanceData.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-8 py-4 font-black text-slate-900">{item.line}</td>
                      <td className="px-8 py-4">{item.input.toLocaleString()}</td>
                      <td className="px-8 py-4 text-indigo-600 font-black">{item.output.toLocaleString()}</td>
                      <td className="px-8 py-4 text-rose-600 font-black">{item.rejections.toLocaleString()}</td>
                      <td className="px-8 py-4 text-amber-600">{item.wip.toLocaleString()}</td>
                      <td className="px-8 py-4 text-center"><span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase border ${item.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>{item.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ProductionChart data={chartData} />
        </div>
      )}

      {activeTab === 'order-info' && (
        <div className="space-y-8 animate-fadeIn max-w-5xl mx-auto">
          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-slate-100">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                <FileText size={24} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Order Information</h3>
                <p className="text-slate-500 text-sm font-medium mt-1">Define master order details and size breakdown</p>
              </div>
            </div>

            <form onSubmit={handleOrderInfoSubmit} className="space-y-10">
              {/* Header Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Buyer Name</label>
                  <input
                    type="text"
                    required
                    value={orderMasterData.buyer}
                    onChange={(e) => setOrderMasterData({ ...orderMasterData, buyer: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder="Enter buyer name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Style Number</label>
                  <input
                    type="text"
                    required
                    value={orderMasterData.style}
                    onChange={(e) => setOrderMasterData({ ...orderMasterData, style: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder="Enter style #"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">PO Number</label>
                  <input
                    type="text"
                    required
                    value={orderMasterData.po}
                    onChange={(e) => setOrderMasterData({ ...orderMasterData, po: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder="Enter PO #"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Color</label>
                  <input
                    type="text"
                    required
                    value={orderMasterData.color}
                    onChange={(e) => setOrderMasterData({ ...orderMasterData, color: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    placeholder="Enter color"
                  />
                </div>
              </div>

              {/* Size Breakdown section */}
              <div className="pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Size Wise Qty</h4>
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-md text-[9px] font-bold uppercase">{orderMasterData.sizes.length} Sizes</span>
                  </div>
                  <button
                    type="button"
                    onClick={addOrderInfoSize}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    <Plus size={14} />
                    <span>Add Size</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {orderMasterData.sizes.map((sizeItem) => (
                    <div key={sizeItem.id} className="flex gap-3 items-center bg-slate-50 p-3 rounded-2xl border border-slate-100 hover:border-blue-200 transition-colors">
                      <div className="w-24">
                        <input
                          type="text"
                          required
                          value={sizeItem.size}
                          onChange={(e) => updateOrderInfoSize(sizeItem.id, 'size', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 transition-all outline-none"
                          placeholder="Size (S, M...)"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="number"
                          required
                          value={sizeItem.qty}
                          onChange={(e) => updateOrderInfoSize(sizeItem.id, 'qty', e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:border-blue-500 transition-all outline-none"
                          placeholder="Size Qty"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOrderInfoSize(sizeItem.id)}
                        className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                        disabled={orderMasterData.sizes.length === 1}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-6 bg-slate-900 text-white rounded-2xl flex items-center justify-between shadow-xl shadow-slate-200">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Cumulative Qty</span>
                  </div>
                  <span className="text-2xl font-black italic tracking-tight">
                    {orderMasterData.sizes.reduce((sum, s) => sum + (parseInt(s.qty) || 0), 0).toLocaleString()} <span className="text-[10px] uppercase ml-1 opacity-50 not-italic">pcs</span>
                  </span>
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-blue-600 text-white rounded-2xl py-5 font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  {isLoading ? (
                    <RefreshCw className="animate-spin" size={24} />
                  ) : (
                    <>
                      <span className="text-sm">Submit Order Information</span>
                      <CheckCircle2 size={24} className="group-hover:scale-110 transition-transform" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-[2rem] p-8 md:p-12 shadow-xl border border-slate-100 overflow-hidden">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 mb-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-900 tracking-tight">Order Database</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">Master order database and breakdown</p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                  <input
                    type="text"
                    placeholder="Filter Buyer..."
                    value={orderInfoSearch.buyer}
                    onChange={(e) => setOrderInfoSearch({ ...orderInfoSearch, buyer: e.target.value })}
                    className="pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:bg-white focus:border-blue-500 transition-all outline-none w-40"
                  />
                </div>
                <div className="relative group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={14} />
                  <input
                    type="text"
                    placeholder="Filter Style..."
                    value={orderInfoSearch.style}
                    onChange={(e) => setOrderInfoSearch({ ...orderInfoSearch, style: e.target.value })}
                    className="pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold focus:bg-white focus:border-blue-500 transition-all outline-none w-44"
                  />
                </div>
                <button
                  onClick={handleExportOrderInfoExcel}
                  className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 uppercase tracking-widest"
                >
                  <Download size={14} /> Export Excel
                </button>
              </div>
            </div>

            <div className="overflow-x-auto -mx-8 md:-mx-12 px-8 md:px-12 pb-4">
              <table className="w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                    <th className="px-4 py-4 text-left bg-slate-800 first:rounded-l-xl whitespace-nowrap">Date/Time</th>
                    <th className="px-4 py-4 text-left bg-slate-800 whitespace-nowrap">Buyer</th>
                    <th className="px-4 py-4 text-left bg-slate-800 whitespace-nowrap">Style</th>
                    <th className="px-4 py-4 text-left bg-slate-800 whitespace-nowrap">PO</th>
                    <th className="px-4 py-4 text-left bg-slate-800 whitespace-nowrap">Color</th>
                    {uniqueSizes.map(size => (
                      <th key={size} className="px-4 py-4 text-right bg-slate-800 whitespace-nowrap">{size} Qty</th>
                    ))}
                    <th className="px-4 py-4 text-right bg-slate-800 whitespace-nowrap">Total PO Qty</th>
                    <th className="px-4 py-4 text-center bg-slate-800 last:rounded-r-xl whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrderInfo.map((order) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group bg-slate-50 hover:bg-white transition-colors"
                    >
                      <td className="px-4 py-3 first:rounded-l-xl last:rounded-r-xl border-y border-transparent group-hover:border-slate-100">
                        <div className="flex flex-col">
                          <span className="text-[11px] font-bold text-slate-900">{new Date(order.created_at).toLocaleDateString()}</span>
                          <span className="text-[9px] text-slate-400 font-medium">{new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-y border-transparent group-hover:border-slate-100">
                        <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{order.buyer || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-3 border-y border-transparent group-hover:border-slate-100">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-black tracking-tight">{order.style}</span>
                      </td>
                      <td className="px-4 py-3 border-y border-transparent group-hover:border-slate-100">
                        <span className="text-[11px] font-bold text-slate-700">{order.po}</span>
                      </td>
                      <td className="px-4 py-3 border-y border-transparent group-hover:border-slate-100">
                        <span className="px-1.5 py-0.5 bg-white text-slate-600 rounded text-[9px] font-bold uppercase border border-slate-200">{order.color}</span>
                      </td>
                      
                      {uniqueSizes.map(sizeName => {
                        const sizeObj = (order.size_data || []).find((s: any) => s.size === sizeName);
                        return (
                          <td key={sizeName} className="px-4 py-3 border-y border-transparent group-hover:border-slate-100 text-right">
                            <span className="text-xs font-black text-slate-900">
                              {sizeObj ? parseInt(sizeObj.qty).toLocaleString() : '-'}
                            </span>
                          </td>
                        );
                      })}

                      <td className="px-4 py-3 border-y border-transparent group-hover:border-slate-100 text-right">
                        <span className="text-xs font-bold text-blue-600">{parseInt(order.total_po_qty).toLocaleString()}</span>
                      </td>
                      <td className="px-4 py-3 first:rounded-l-xl last:rounded-r-xl border-y border-transparent group-hover:border-slate-100 text-center">
                        <button
                          onClick={() => handleDeleteOrderInfo(order.id)}
                          className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                          title="Delete Order Record"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                  {filteredOrderInfo.length > 0 && (
                    <tr className="bg-slate-100/50">
                      <td colSpan={5} className="px-4 py-4 rounded-l-xl text-xs font-black text-slate-900 uppercase tracking-widest text-right">
                        Grand Total
                      </td>
                      {uniqueSizes.map(sizeName => (
                        <td key={sizeName} className="px-4 py-4 text-right">
                          <span className="text-xs font-black text-slate-900">
                            {orderInfoTotals.totals[sizeName].toLocaleString()}
                          </span>
                        </td>
                      ))}
                      <td className="px-4 py-4 text-right">
                        <span className="text-xs font-black text-blue-700">
                          {orderInfoTotals.grandTotal.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4 rounded-r-xl"></td>
                    </tr>
                  )}
                  {filteredOrderInfo.length === 0 && (
                    <tr>
                      <td colSpan={uniqueSizes.length + 7} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-3 opacity-20">
                          <FileText size={48} />
                          <p className="text-[11px] font-black uppercase tracking-widest">No matching order records</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Pagination 
              totalRows={filteredOrderInfo.length}
              currentPage={orderInfoPage}
              rowsPerPage={rowsPerPage}
              onPageChange={setOrderInfoPage}
            />
          </div>
        </div>
      )}

      {activeTab === 'generate-qr' && (
        <div className="space-y-12 animate-fadeIn">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 max-w-6xl mx-auto">
            <div className="flex items-center gap-4 mb-12">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                <QrCode size={24} />
              </div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Generate Bundle QR</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 text-left mb-12">
              <div className="flex flex-col group">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest group-focus-within:text-indigo-600 transition-colors">Buyer</label>
                <input 
                  list="buyer-list"
                  className="bg-slate-50 border-4 border-slate-50 focus:border-indigo-500 focus:bg-white shadow-sm rounded-2xl px-6 py-4 font-black text-slate-900 outline-none transition-all"
                  value={qrFormData.buyer}
                  onChange={(e) => setQrFormData({...qrFormData, buyer: e.target.value})}
                  placeholder="Select or Type..."
                />
                <datalist id="buyer-list">
                  {Array.from(new Set(dbOrderInfo.map(o => o.buyer))).map(b => <option key={b} value={b} />)}
                </datalist>
              </div>

              <div className="flex flex-col group">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest group-focus-within:text-indigo-600 transition-colors">Style *</label>
                <input 
                  list="style-list"
                  className="bg-slate-50 border-4 border-slate-50 focus:border-indigo-500 focus:bg-white shadow-sm rounded-2xl px-6 py-4 font-black text-slate-900 outline-none transition-all"
                  value={qrFormData.style}
                  onChange={(e) => {
                    const style = e.target.value;
                    const matches = dbOrderInfo.filter(o => o.style === style && (!qrFormData.buyer || o.buyer === qrFormData.buyer));
                    if (matches.length === 1) {
                      setQrFormData({
                        ...qrFormData,
                        style,
                        buyer: matches[0].buyer,
                        po: matches[0].po,
                        color: matches[0].color
                      });
                    } else {
                      setQrFormData({...qrFormData, style});
                    }
                  }}
                  placeholder="Select or Type..."
                />
                <datalist id="style-list">
                  {Array.from(new Set(dbOrderInfo.filter(o => !qrFormData.buyer || o.buyer === qrFormData.buyer).map(o => o.style))).map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              <div className="flex flex-col group">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest group-focus-within:text-indigo-600 transition-colors">PO *</label>
                <select 
                  className="bg-slate-50 border-4 border-slate-50 focus:border-indigo-500 focus:bg-white shadow-sm rounded-2xl px-6 py-4 font-black text-slate-900 outline-none transition-all appearance-none"
                  value={qrFormData.po}
                  onChange={(e) => setQrFormData({...qrFormData, po: e.target.value})}
                >
                  <option value="">Select PO</option>
                  {Array.from(new Set(dbOrderInfo.filter(o => 
                    o.style === qrFormData.style && (!qrFormData.buyer || o.buyer === qrFormData.buyer)
                  ).map(o => o.po))).map(po => <option key={po} value={po}>{po}</option>)}
                </select>
              </div>

              <div className="flex flex-col group">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest group-focus-within:text-indigo-600 transition-colors">Color</label>
                <select 
                  className="bg-slate-50 border-4 border-slate-50 focus:border-indigo-500 focus:bg-white shadow-sm rounded-2xl px-6 py-4 font-black text-slate-900 outline-none transition-all appearance-none"
                  value={qrFormData.color}
                  onChange={(e) => setQrFormData({...qrFormData, color: e.target.value})}
                >
                  <option value="">Select Color</option>
                  {Array.from(new Set(dbOrderInfo.filter(o => 
                    o.style === qrFormData.style && o.po === qrFormData.po && (!qrFormData.buyer || o.buyer === qrFormData.buyer)
                  ).map(o => o.color))).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="flex flex-col group">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest group-focus-within:text-indigo-600 transition-colors">PO Qty</label>
                <div className="bg-slate-100 border-4 border-slate-100 shadow-sm rounded-2xl px-6 py-4 font-black text-indigo-600 flex items-center h-full min-h-[64px]">
                  {qrMatchedOrder ? (parseInt(qrMatchedOrder.total_po_qty) || 0).toLocaleString() : '-'}
                </div>
              </div>
            </div>

            {qrMatchedOrder && (
              <div className="bg-slate-50 rounded-[2.5rem] p-8 border border-slate-200 overflow-hidden">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Size Wise Cutting Input</h3>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm">
                      <span className="text-[9px] font-black text-slate-400 uppercase">Standard Bundle</span>
                      <input 
                        type="number"
                        className="w-12 text-center text-xs font-black text-indigo-600 outline-none"
                        value={qrFormData.bundle_qty}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQrFormData({...qrFormData, bundle_qty: val});
                          // Apply to all initialized sizes
                          const newEntries = {...qrSizeEntries};
                          Object.keys(newEntries).forEach(s => newEntries[s].bundle_qty = val);
                          setQrSizeEntries(newEntries);
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-separate border-spacing-y-2">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="px-6 py-2">Size</th>
                        <th className="px-6 py-2 text-right">Size Qty</th>
                        <th className="px-6 py-2 text-right">Prev Cut</th>
                        <th className="px-6 py-2 text-right">Balance</th>
                        <th className="px-6 py-2 w-32 bg-indigo-50 text-indigo-600 rounded-t-xl border-x border-t border-indigo-100">Cutting Qty</th>
                        <th className="px-6 py-2 w-32">Bundle Qty</th>
                        <th className="px-6 py-2 text-right">New Total</th>
                        <th className="px-6 py-2 text-right">New Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(qrMatchedOrder.size_data || []).map((s: any) => {
                        const stats = qrSizeStats[s.size] || { orderQty: 0, totalCut: 0 };
                        const entry = qrSizeEntries[s.size] || { cutting_qty: '', bundle_qty: qrFormData.bundle_qty };
                        const newCutValue = parseInt(entry.cutting_qty) || 0;
                        const balance = stats.orderQty - stats.totalCut;
                        const newTotal = stats.totalCut + newCutValue;
                        const newBalance = stats.orderQty - newTotal;

                        return (
                          <tr key={s.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 group hover:border-indigo-200 transition-colors">
                            <td className="px-6 py-4 first:rounded-l-2xl">
                              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-black uppercase">{s.size}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-black text-slate-900">{stats.orderQty.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="text-xs font-bold text-slate-500">{stats.totalCut.toLocaleString()}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={cn("text-xs font-black", balance > 0 ? "text-emerald-600" : "text-rose-500")}>
                                {balance.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-6 py-4 bg-indigo-50/30 border-x border-indigo-100">
                              <input 
                                type="number"
                                placeholder="..."
                                className="w-full bg-white border border-indigo-200 rounded-xl px-4 py-2 text-xs font-black text-indigo-700 focus:border-indigo-500 outline-none transition-all"
                                value={entry.cutting_qty}
                                onChange={(e) => setQrSizeEntries({
                                  ...qrSizeEntries,
                                  [s.size]: { ...entry, cutting_qty: e.target.value }
                                })}
                              />
                            </td>
                            <td className="px-6 py-4">
                              <input 
                                type="number"
                                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 text-xs font-black text-slate-400 focus:border-indigo-500 outline-none transition-all"
                                value={entry.bundle_qty}
                                onChange={(e) => setQrSizeEntries({
                                  ...qrSizeEntries,
                                  [s.size]: { ...entry, bundle_qty: e.target.value }
                                })}
                              />
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className={cn("text-xs font-black", newTotal <= stats.orderQty ? "text-indigo-600" : "text-amber-500 animate-pulse")}>
                                {newTotal.toLocaleString()}
                              </span>
                            </td>
                            <td className="px-6 py-4 last:rounded-r-2xl text-right">
                              <span className={cn("text-xs font-black", newBalance >= 0 ? "text-emerald-500" : "text-rose-500")}>
                                {newBalance.toLocaleString()}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {/* Total Row */}
                      <tr className="bg-slate-900/5 border border-slate-900/10">
                        <td className="px-6 py-4 rounded-l-2xl">
                          <span className="text-xs font-black text-slate-900 uppercase">Total</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs font-black text-slate-900">{qrTableTotals.orderQty.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs font-bold text-slate-500">{qrTableTotals.prevCut.toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs font-black text-slate-900">{(qrTableTotals.orderQty - qrTableTotals.prevCut).toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 bg-indigo-100/50 border-x border-indigo-200">
                          <div className="w-full bg-white rounded-xl px-4 py-2 text-xs font-black text-indigo-700 text-center shadow-sm">
                            {qrTableTotals.cuttingPlanned.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4"></td>
                        <td className="px-6 py-4 text-right">
                          <span className="text-xs font-black text-indigo-600">{(qrTableTotals.prevCut + qrTableTotals.cuttingPlanned).toLocaleString()}</span>
                        </td>
                        <td className="px-6 py-4 last:rounded-r-2xl text-right">
                          <span className="text-xs font-black text-slate-900">{(qrTableTotals.orderQty - (qrTableTotals.prevCut + qrTableTotals.cuttingPlanned)).toLocaleString()}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 flex items-center justify-between p-6 bg-slate-900 rounded-3xl text-white shadow-xl">
                   <div className="flex items-center gap-6">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Cutting Planned</span>
                        <span className="text-xl font-black italic tracking-tight">
                          {Object.values(qrSizeEntries).reduce((sum, entry) => sum + (parseInt(entry.cutting_qty) || 0), 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-px h-8 bg-slate-800" />
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Estimated Bundles</span>
                        <span className="text-xl font-black italic text-indigo-400 tracking-tight">
                          {Object.values(qrSizeEntries).reduce((sum, entry) => {
                            const c = parseInt(entry.cutting_qty) || 0;
                            const b = parseInt(entry.bundle_qty) || 20;
                            return sum + Math.ceil(c / b);
                          }, 0)}
                        </span>
                      </div>
                   </div>
                   <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Summary Status</span>
                        <span className="text-[11px] font-bold text-emerald-400">Ready to Generate</span>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 size={24} />
                      </div>
                   </div>
                </div>
              </div>
            )}

            <div className="mt-12 flex flex-col md:flex-row gap-6">
              <button 
                onClick={handleGenerateQR}
                disabled={!qrMatchedOrder}
                className={cn(
                  "flex-1 py-8 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl active:scale-[0.99] transition-all flex items-center justify-center gap-4 group",
                  qrMatchedOrder ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <QrCode size={20} className="group-hover:rotate-12 transition-transform" />
                Bundle QR
              </button>
              <button 
                onClick={handleGeneratePcsQR}
                disabled={!qrMatchedOrder}
                className={cn(
                  "flex-1 py-8 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl active:scale-[0.99] transition-all flex items-center justify-center gap-4 group",
                  qrMatchedOrder ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                )}
              >
                <QrCode size={20} className="group-hover:rotate-12 transition-transform" />
                QR code (pcs)
              </button>
              <button 
                onClick={() => {
                  setQrFormData({
                    buyer: '', style: '', po: '', color: '', size: '', po_qty: '', cutting_qty: '', bundle_qty: '20'
                  });
                  setQrSizeEntries({});
                  setGeneratedBundles([]);
                }}
                className="px-12 bg-slate-100 text-slate-400 py-8 rounded-[2rem] font-black uppercase tracking-widest hover:bg-slate-200 hover:text-slate-900 transition-all"
              >
                Reset
              </button>
            </div>
          </div>

          {generatedBundles.length > 0 && (
            <div className="space-y-12 animate-fadeIn">
              <div className="space-y-8">
                <div className="flex justify-between items-end px-4">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase">Generated Bundles</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Total {generatedBundles.length} bundles created</p>
                  </div>
                </div>

                <div id="qr-bundles-container" ref={qrContainerRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 print:grid-cols-2 bg-white p-4 rounded-[2rem]">
                  {generatedBundles.map((bundle, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-[2rem] shadow-xl border border-slate-100 flex flex-col items-center space-y-6 print:shadow-none print:border print:rounded-none break-inside-avoid">
                      <div className="p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-inner">
                        <QRCodeSVG 
                          value={bundle.qrData} 
                          size={180}
                          level="H"
                          includeMargin={true}
                        />
                      </div>
                      
                      <div className="w-full border-t-2 border-slate-100 pt-6 space-y-1">
                        <div className="flex justify-between items-center bg-slate-50 px-4 py-2 rounded-xl">
                          <span className="text-[9px] font-black text-slate-400 uppercase">ID</span>
                          <span className="text-[11px] font-black text-slate-900 tabular-nums">{bundle.id}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div className="flex flex-col bg-slate-50 p-3 rounded-xl">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Buyer</span>
                            <span className="text-[10px] font-black text-slate-900 truncate">{bundle.buyer || '-'}</span>
                          </div>
                          <div className="flex flex-col bg-slate-50 p-3 rounded-xl">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Style</span>
                            <span className="text-[10px] font-black text-slate-900 truncate">{bundle.style}</span>
                          </div>
                          <div className="flex flex-col bg-slate-50 p-3 rounded-xl">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-1">PO</span>
                            <span className="text-[10px] font-black text-slate-900 truncate">{bundle.po}</span>
                          </div>
                          <div className="flex flex-col bg-slate-50 p-3 rounded-xl">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Color</span>
                            <span className="text-[10px] font-black text-slate-900 truncate">{bundle.color || '-'}</span>
                          </div>
                          <div className="flex flex-col bg-slate-50 p-3 rounded-xl">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-1">Size</span>
                            <span className="text-[10px] font-black text-slate-900 truncate">{bundle.size || '-'}</span>
                          </div>
                          <div className="flex flex-col bg-slate-50 p-3 rounded-xl">
                            <span className="text-[8px] font-black text-slate-400 uppercase mb-1">B. Qty</span>
                            <span className="text-[10px] font-black text-indigo-600">{bundle.bundle_qty}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center bg-slate-900 px-4 py-3 rounded-xl mt-2">
                          <span className="text-[8px] font-black text-slate-400 uppercase">Size Qty</span>
                          <span className="text-[11px] font-black text-white tabular-nums">{bundle.po_qty || '-'}</span>
                        </div>
                      </div>

                      <div className="flex gap-2 w-full no-print">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(bundle.id);
                            setScanStatus({ message: 'Bundle ID Copied', type: 'success' });
                          }}
                          className="flex-1 bg-slate-50 text-slate-400 p-3 rounded-xl hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center justify-center gap-2 text-[9px] font-black uppercase"
                        >
                          <Copy size={12} />
                          Copy ID
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-slate-100 space-y-8 animate-fadeIn">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                    <Database size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 uppercase">Save to Database</h3>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Finalize and record cutting input</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="flex items-center gap-4 bg-slate-50 px-8 py-5 rounded-2xl w-full md:w-auto border border-slate-100">
                      <input 
                        type="checkbox" 
                        id="auto-email-final" 
                        checked={autoEmail} 
                        onChange={(e) => setAutoEmail(e.target.checked)}
                        className="w-6 h-6 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="auto-email-final" className="text-xs font-black text-slate-700 uppercase cursor-pointer">
                        Auto Email PDF
                      </label>
                    </div>
                    <div className="flex-1 w-full relative">
                      <Mail className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                      <input 
                        type="email" 
                        placeholder="recipient@example.com"
                        value={recipientEmail}
                        onChange={(e) => setRecipientEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-16 pr-8 py-5 text-sm font-bold outline-none focus:border-indigo-500 transition-all text-black focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="flex flex-col w-full md:w-72">
                      <label className="text-[10px] font-black text-slate-400 uppercase mb-2 ml-2 text-left tracking-widest">Production Table</label>
                      <select 
                        value={selectedTable}
                        onChange={(e) => setSelectedTable(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-2xl px-8 py-5 text-base font-bold outline-none focus:border-slate-900 transition-all appearance-none cursor-pointer text-black"
                      >
                        {Array.from({ length: 15 }, (_, i) => `Table ${i + 1}`).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      onClick={handleCuttingInput}
                      disabled={Object.values(qrSizeEntries).every(v => !v.cutting_qty || parseInt(v.cutting_qty) === 0)}
                      className="flex-1 py-10 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.25em] shadow-2xl shadow-blue-200 active:scale-[0.98] transition-all flex items-center justify-center gap-6 group"
                    >
                      <Database size={28} className="group-hover:translate-y-[-4px] transition-transform" />
                      Submit Cutting to Database
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-6 animate-fadeIn pb-24 text-black">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                <SearchFieldSmall label="Buyer" value={orderSearch.buyer} onChange={(v: string) => setOrderSearch({...orderSearch, buyer: v})} />
                <SearchFieldSmall label="Style" value={orderSearch.style} onChange={(v: string) => setOrderSearch({...orderSearch, style: v})} />
                <SearchFieldSmall label="PO" value={orderSearch.po} onChange={(v: string) => setOrderSearch({...orderSearch, po: v})} />
              </div>
              <button 
                onClick={handleExportExcel}
                className="mt-6 md:mt-0 px-8 py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-emerald-700 transition-all shadow-lg flex items-center space-x-2 active:scale-95"
              >
                <span>📥</span>
                <span>Export Excel</span>
              </button>
            </div>
            <div className="flex flex-col gap-6 pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                {['ALL', 'Cutting', 'Sewing', 'Wash', 'Finishing'].map(cat => (
                  <button key={cat} onClick={() => setOrderCategoryFilter(cat)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${orderCategoryFilter === cat ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400'}`}>{cat}</button>
                ))}
              </div>
              
              <div className="flex flex-wrap gap-6 items-end justify-between">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Start Date</label>
                    <input 
                      type="date" 
                      value={orderStartDate} 
                      onChange={(e) => setOrderStartDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all"
                    />
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">End Date</label>
                    <input 
                      type="date" 
                      value={orderEndDate} 
                      onChange={(e) => setOrderEndDate(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all"
                    />
                  </div>
                  
                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Process</label>
                    <select 
                      value={orderProcessStepFilter} 
                      onChange={(e) => setOrderProcessStepFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all min-w-[140px]"
                    >
                      <option value="ALL">ALL PROCESSES</option>
                      {PROCESS_FLOW.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Sewing Line</label>
                    <select 
                      value={orderSewingLineFilter} 
                      onChange={(e) => setOrderSewingLineFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all"
                    >
                      <option value="ALL">ALL LINES</option>
                      {Array.from({ length: 15 }, (_, i) => `Line-${i + 1}`).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col">
                    <label className="text-[9px] font-black text-slate-400 uppercase mb-1 ml-1">Finishing Line</label>
                    <select 
                      value={orderFinishingLineFilter} 
                      onChange={(e) => setOrderFinishingLineFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-[10px] font-bold outline-none focus:border-slate-900 transition-all"
                    >
                      <option value="ALL">ALL LINES</option>
                      {Array.from({ length: 10 }, (_, i) => `Line-${i + 1}`).map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const today = new Date().toLocaleDateString('en-CA');
                        setOrderStartDate(today);
                        setOrderEndDate(today);
                      }}
                      className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                    >
                      Today
                    </button>
                    <button 
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() - 1);
                        const yesterday = d.toLocaleDateString('en-CA');
                        setOrderStartDate(yesterday);
                        setOrderEndDate(yesterday);
                      }}
                      className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                    >
                      Yesterday
                    </button>
                    <button 
                      onClick={() => {
                        setOrderStartDate('');
                        setOrderEndDate('');
                        setOrderProcessStepFilter('ALL');
                        setOrderCategoryFilter('ALL');
                        setOrderSewingLineFilter('ALL');
                        setOrderFinishingLineFilter('ALL');
                        setOrderSearch({ buyer: '', style: '', po: '' });
                      }}
                      className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>

                {(orderStartDate || orderEndDate) && (
                  <div className="text-right hidden lg:block">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Viewing Tenure</p>
                    <p className="text-sm font-black text-slate-900">
                      {orderStartDate ? new Date(orderStartDate).toLocaleDateString() : 'Start'} - {orderEndDate ? new Date(orderEndDate).toLocaleDateString() : 'End'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-bold text-black">
                <thead className="bg-slate-900 text-white uppercase text-[9px] font-black text-center">
                  <tr>
                    <th className="px-4 py-5 text-left">Scan Date/Time</th>
                    <th className="px-4 py-5 text-left">Bundle</th>
                    <th className="px-4 py-5 text-left">Buyer</th>
                    <th className="px-4 py-5 text-left">Style</th>
                    <th className="px-4 py-5 text-left">PO</th>
                    <th className="px-4 py-5">Color</th>
                    <th className="px-4 py-5">Size</th>
                    <th className="px-4 py-5">PO Qty</th>
                    
                    {orderProcessStepFilter === 'ALL' ? (
                      <>
                        {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Cutting') && (
                          <>
                            <th className="px-4 py-5 bg-blue-800">Cut In</th>
                            <th className="px-4 py-5 bg-blue-700">Cut Out</th>
                            <th className="px-4 py-5 bg-blue-900">Cut Line</th>
                          </>
                        )}
                        
                        {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing') && (
                          <>
                            <th className="px-4 py-5 bg-rose-800">Sew In</th>
                            <th className="px-4 py-5 bg-rose-700">Sew Out</th>
                            <th className="px-4 py-5 bg-rose-900">Sew Line</th>
                          </>
                        )}
                        
                        {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Wash') && (
                          <>
                            <th className="px-4 py-5 bg-amber-600">Send Wash</th>
                            <th className="px-4 py-5 bg-amber-800">Wash In</th>
                            <th className="px-4 py-5 bg-amber-700">Wash Out</th>
                            <th className="px-4 py-5 bg-amber-900">Wash Line</th>
                          </>
                        )}
                        
                        {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Finishing') && (
                          <>
                            <th className="px-4 py-5 bg-emerald-800">Fin In</th>
                            <th className="px-4 py-5 bg-emerald-700">Fin Out</th>
                            <th className="px-4 py-5 bg-emerald-900">Fin Line</th>
                          </>
                        )}
                      </>
                    ) : (
                      <th className="px-4 py-5 bg-slate-800">{orderProcessStepFilter}</th>
                    )}
                    
                    <th className="px-4 py-5 text-rose-500 border-l border-slate-800">Total Rej</th>

                    {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing' || orderCategoryFilter === 'Finishing') && (
                      <th className="px-4 py-5 text-right">Last Line</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y text-center">
                  {paginatedOrders.map((o: any) => (
                    <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 text-left text-slate-500 tabular-nums">
                        {o.created_at ? new Date(o.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-4 font-black text-left">{o.bundle_id}</td>
                      <td className="px-4 py-4 text-left">{o.buyer}</td>
                      <td className="px-4 py-4 text-left font-black">{o.style}</td>
                      <td className="px-4 py-4 text-left">{o.po}</td>
                      <td className="px-4 py-4">{o.color}</td>
                      <td className="px-4 py-4">{o.size}</td>
                      <td className="px-4 py-4 font-black">{o.po_quantity}</td>
                      
                      {orderProcessStepFilter === 'ALL' ? (
                        <>
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Cutting') && (
                            <>
                              <td className="px-4 py-4 bg-blue-50 font-black">{o.cutting_in || 0}</td>
                              <td className="px-4 py-4 bg-blue-100 font-black">{o.cutting_out || 0}</td>
                              <td className="px-4 py-4 bg-blue-50 text-blue-600 font-black">{o.cutting_line || '-'}</td>
                            </>
                          )}
                          
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing') && (
                            <>
                              <td className="px-4 py-4 bg-rose-50">{o.sew_in || 0}</td>
                              <td className="px-4 py-4 bg-rose-100 font-black">{o.sew_out || 0}</td>
                              <td className="px-4 py-4 bg-rose-50 text-rose-600 font-black">{o.sewing_line || '-'}</td>
                            </>
                          )}
                          
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Wash') && (
                            <>
                              <td className="px-4 py-4 bg-amber-50 font-black">{o.send_to_wash || 0}</td>
                              <td className="px-4 py-4 bg-amber-50">{o.wash_in || 0}</td>
                              <td className="px-4 py-4 bg-amber-100 font-black">{o.wash_out || 0}</td>
                              <td className="px-4 py-4 bg-amber-50 text-amber-600 font-black">{o.wash_line || '-'}</td>
                            </>
                          )}
                          
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Finishing') && (
                            <>
                              <td className="px-4 py-4 bg-emerald-50">{o.fin_in || 0}</td>
                              <td className="px-4 py-4 bg-emerald-100 font-black">{o.fin_out || 0}</td>
                              <td className="px-4 py-4 bg-emerald-50 text-emerald-600 font-black">{o.finishing_line || '-'}</td>
                            </>
                          )}
                        </>
                      ) : (
                        <td className="px-4 py-4 bg-slate-50 font-black">{o[processToColumn(orderProcessStepFilter)] || 0}</td>
                      )}

                      <td className="px-4 py-4 font-black text-rose-600 border-l border-slate-100 tabular-nums bg-rose-50/20">
                        {o.total_rejections || 0}
                      </td>
                      
                      {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing' || orderCategoryFilter === 'Finishing') && (
                        <td className="px-4 py-4 text-right font-black">{o.line}</td>
                      )}
                    </tr>
                  ))}
                  {filteredOrders.length === 0 && (
                    <tr><td colSpan={16} className="py-20 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">No Records Found</td></tr>
                  )}
                </tbody>
                {filteredOrders.length > 0 && (
                  <tfoot className="bg-slate-900 text-white uppercase text-[10px] font-black text-center sticky bottom-0 shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td colSpan={7} className="px-4 py-4 text-right border-r border-slate-700">GRAND TOTAL</td>
                      <td className="px-4 py-4 bg-slate-800">{reportTotals.po_qty.toLocaleString()}</td>
                      
                      {orderProcessStepFilter === 'ALL' ? (
                        <>
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Cutting') && (
                            <>
                              <td className="px-4 py-4 bg-blue-900">{reportTotals.cutting_in.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-blue-800">{reportTotals.cutting_out.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-blue-900">-</td>
                            </>
                          )}
                          
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing') && (
                            <>
                              <td className="px-4 py-4 bg-rose-900">{reportTotals.sew_in.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-rose-800">{reportTotals.sew_out.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-rose-900">-</td>
                            </>
                          )}
                          
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Wash') && (
                            <>
                              <td className="px-4 py-4 bg-amber-700">{reportTotals.send_to_wash.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-amber-900">{reportTotals.wash_in.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-amber-800">{reportTotals.wash_out.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-amber-900">-</td>
                            </>
                          )}
                          
                          {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Finishing') && (
                            <>
                              <td className="px-4 py-4 bg-emerald-900">{reportTotals.fin_in.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-emerald-800">{reportTotals.fin_out.toLocaleString()}</td>
                              <td className="px-4 py-4 bg-emerald-900">-</td>
                            </>
                          )}
                        </>
                      ) : (
                        <td className="px-4 py-4 bg-slate-800">
                          {orderProcessStepFilter === 'Cutting Input' && reportTotals.cutting_in.toLocaleString()}
                          {orderProcessStepFilter === 'Cutting Output' && reportTotals.cutting_out.toLocaleString()}
                          {orderProcessStepFilter === 'Sewing Input' && reportTotals.sew_in.toLocaleString()}
                          {orderProcessStepFilter === 'Sewing Output' && reportTotals.sew_out.toLocaleString()}
                          {orderProcessStepFilter === 'Send to Wash' && reportTotals.send_to_wash.toLocaleString()}
                          {orderProcessStepFilter === 'Wash Input' && reportTotals.wash_in.toLocaleString()}
                          {orderProcessStepFilter === 'Wash Output' && reportTotals.wash_out.toLocaleString()}
                          {orderProcessStepFilter === 'Finishing Input' && reportTotals.fin_in.toLocaleString()}
                          {orderProcessStepFilter === 'Finishing Output' && reportTotals.fin_out.toLocaleString()}
                        </td>
                      )}

                      <td className="px-4 py-4 bg-rose-900 border-l border-slate-700">{reportTotals.total_rejections.toLocaleString()}</td>
                      
                      {(orderCategoryFilter === 'ALL' || orderCategoryFilter === 'Sewing' || orderCategoryFilter === 'Finishing') && (
                        <td className="px-4 py-4 text-right">-</td>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <Pagination 
              totalRows={filteredOrders.length}
              currentPage={ordersPage}
              rowsPerPage={rowsPerPage}
              onPageChange={setOrdersPage}
            />
          </div>
        </div>
      )}

      {activeTab === 'hourly-reports' && (
        <div className="space-y-8">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Hourly Production Report</h2>
                <p className="text-slate-400 font-bold text-xs mt-1 uppercase tracking-widest">Real-time hourly tracking by line</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Report Date</label>
                  <input 
                    type="date" 
                    value={hourlyReportDate}
                    onChange={(e) => setHourlyReportDate(e.target.value)}
                    className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 text-xs font-bold text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                  />
                </div>
                
                <div className="flex flex-col">
                  <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Process Step</label>
                  <select 
                    value={hourlyReportProcess}
                    onChange={(e) => setHourlyReportProcess(e.target.value)}
                    className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-3 text-xs font-bold text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                  >
                    <option value="Sewing Output">Sewing Output</option>
                    <option value="Finishing Output">Finishing Output</option>
                  </select>
                </div>

                <button 
                  onClick={() => {
                    // Excel Export for Hourly Report
                    const workbook = new ExcelJS.Workbook();
                    const worksheet = workbook.addWorksheet('Hourly Report');
                    
                    const hours = Array.from({ length: 13 }, (_, i) => i + 8);
                    const lineHeader = hourlyReportProcess.includes('Sewing') ? 'Sewing Line' : 'Finishing Line';
                    const columns = [
                      { header: lineHeader, key: 'line', width: 15 },
                      { header: 'Buyer', key: 'buyer', width: 15 },
                      { header: 'Style', key: 'style', width: 20 },
                      { header: 'PO Qty', key: 'po_qty', width: 12 },
                      { header: 'Input Qty', key: 'total_input', width: 12 },
                      ...hours.map(h => ({ header: `${h}:00-${h+1}:00`, key: `h${h}`, width: 12 })),
                      { header: 'Total Output', key: 'total_output', width: 15 },
                      { header: 'Line WIP', key: 'wip', width: 12 },
                    ];
                    
                    worksheet.columns = columns;
                    
                    hourlyReportData.forEach(d => {
                      const row: any = {
                        line: d.line,
                        buyer: d.buyer,
                        style: d.style,
                        po_qty: d.po_qty,
                        total_input: d.total_input,
                        total_output: d.total_output,
                        wip: d.wip
                      };
                      hours.forEach(h => {
                        row[`h${h}`] = d.hourly_output[h] || 0;
                      });
                      worksheet.addRow(row);
                    });
                    
                    workbook.xlsx.writeBuffer().then(buffer => {
                      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                      saveAs(blob, `Hourly_Report_${hourlyReportDate}.xlsx`);
                    });
                  }}
                  className="bg-slate-900 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg hover:shadow-slate-200 active:scale-95 flex items-center gap-2"
                >
                  <Download size={14} /> Export Excel
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] font-bold text-black border-collapse">
                <thead className="bg-slate-900 text-white uppercase text-[9px] font-black text-center sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-6 text-left border-r border-slate-800">
                      {hourlyReportProcess.includes('Sewing') ? 'Sewing Line' : 'Finishing Line'}
                    </th>
                    <th className="px-4 py-6 text-left border-r border-slate-800">Buyer</th>
                    <th className="px-4 py-6 text-left border-r border-slate-800">Style</th>
                    <th className="px-4 py-6 border-r border-slate-800">PO Qty</th>
                    <th className="px-4 py-6 bg-blue-800 border-r border-slate-800">Input Qty</th>
                    
                    {Array.from({ length: 13 }, (_, i) => i + 8).map(h => (
                      <th key={h} className="px-2 py-6 border-r border-slate-800 min-w-[60px]">
                        {h}:00<br/>{h+1}:00
                      </th>
                    ))}
                    
                    <th className="px-4 py-6 bg-emerald-800 border-r border-slate-800">Total Output</th>
                    <th className="px-4 py-6 bg-rose-800">Line WIP</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-center">
                  {paginatedHourlyReports.map((d, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-4 text-left font-black border-r border-slate-100">{d.line}</td>
                      <td className="px-4 py-4 text-left border-r border-slate-100">{d.buyer}</td>
                      <td className="px-4 py-4 text-left font-black border-r border-slate-100">{d.style}</td>
                      <td className="px-4 py-4 border-r border-slate-100 tabular-nums">{d.po_qty.toLocaleString()}</td>
                      <td className="px-4 py-4 bg-blue-50 font-black border-r border-slate-100 tabular-nums">{d.total_input.toLocaleString()}</td>
                      
                      {Array.from({ length: 13 }, (_, i) => i + 8).map(h => (
                        <td key={h} className={cn(
                          "px-2 py-4 border-r border-slate-100 tabular-nums",
                          d.hourly_output[h] > 0 ? "text-indigo-600 font-black" : "text-slate-300"
                        )}>
                          {d.hourly_output[h] || '-'}
                        </td>
                      ))}
                      
                      <td className="px-4 py-4 bg-emerald-50 font-black border-r border-slate-100 tabular-nums">{d.total_output.toLocaleString()}</td>
                      <td className="px-4 py-4 bg-rose-50 text-rose-600 font-black tabular-nums">{d.wip.toLocaleString()}</td>
                    </tr>
                  ))}
                  {hourlyReportData.length === 0 && (
                    <tr>
                      <td colSpan={20} className="py-20 text-slate-400 font-black uppercase tracking-[0.2em] text-[10px]">
                        No production data found for this date and process
                      </td>
                    </tr>
                  )}
                </tbody>
                {hourlyReportData.length > 0 && (
                  <tfoot className="bg-slate-900 text-white uppercase text-[9px] font-black text-center sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-right border-r border-slate-700">GRAND TOTAL</td>
                      <td className="px-4 py-4 border-r border-slate-700">
                        {hourlyReportData.reduce((sum, d) => sum + d.po_qty, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 bg-blue-900 border-r border-slate-700">
                        {hourlyReportData.reduce((sum, d) => sum + d.total_input, 0).toLocaleString()}
                      </td>
                      
                      {Array.from({ length: 13 }, (_, i) => i + 8).map(h => (
                        <td key={h} className="px-2 py-4 border-r border-slate-700">
                          {hourlyReportData.reduce((sum, d) => sum + (d.hourly_output[h] || 0), 0).toLocaleString()}
                        </td>
                      ))}
                      
                      <td className="px-4 py-4 bg-emerald-900 border-r border-slate-700">
                        {hourlyReportData.reduce((sum, d) => sum + d.total_output, 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-4 bg-rose-900">
                        {hourlyReportData.reduce((sum, d) => sum + d.wip, 0).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            <Pagination 
              totalRows={hourlyReportData.length}
              currentPage={hourlyReportsPage}
              rowsPerPage={rowsPerPage}
              onPageChange={setHourlyReportsPage}
            />
          </div>
        </div>
      )}

      {activeTab === 'scan' && (
        <div className="max-w-5xl mx-auto space-y-8 animate-fadeIn pb-24 text-black">
          <div className="bg-white p-8 md:p-12 rounded-[3rem] shadow-2xl border border-slate-100 text-center">
            <h3 className="text-3xl font-black text-slate-900 uppercase mb-10 tracking-tight">Production Entry</h3>
            <div className="flex justify-center mb-10">
              <button onClick={() => setShowCamera(!showCamera)} className={`px-16 py-6 rounded-2xl font-black shadow-xl uppercase text-xs ${showCamera ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white'}`}>
                {showCamera ? 'Close Sensor' : 'Scan QR'}
              </button>
            </div>
            {showCamera && <div className="mt-4 mb-10 max-w-sm mx-auto rounded-[2.5rem] overflow-hidden border-8 border-slate-50 shadow-inner"><QRScanner onScanSuccess={handleQRScanResult} /></div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
              <ScanField label="Bundle ID *" value={formData.id} onChange={(v: string) => setFormData({...formData, id: v})} />
              <ScanField label="Buyer" value={formData.buyer} onChange={(v: string) => setFormData({...formData, buyer: v})} />
              <ScanField label="Style *" value={formData.style} onChange={(v: string) => setFormData({...formData, style: v})} />
              <ScanField label="PO *" value={formData.po} onChange={(v: string) => setFormData({...formData, po: v})} />
              <ScanField label="Color" value={formData.color} onChange={(v: string) => setFormData({...formData, color: v})} />
              <ScanField label="Size" value={formData.size} onChange={(v: string) => setFormData({...formData, size: v})} />
              <ScanField label="PO quantity *" value={formData.po_qty} onChange={(v: string) => setFormData({...formData, po_qty: v})} />
              <ScanField 
                label={selectedProcess === 'Cutting Input' ? "Bundle qty (20) *" : `Input qty (from prev stage) *`} 
                value={formData.qty} 
                onChange={(v: string) => setFormData({...formData, qty: v})} 
                readOnly={selectedProcess !== 'Cutting Input'}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left mt-6 border-t pt-8">
              <div className="flex flex-col"><label className="text-[10px] font-black uppercase text-slate-400 mb-2">Stage</label>
                <select value={selectedProcess} onChange={e => setSelectedProcess(e.target.value)} className="bg-slate-50 border-4 border-slate-50 rounded-2xl px-6 py-4 font-black text-black outline-none focus:border-indigo-500 transition-all">
                  {PROCESS_FLOW.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex flex-col"><label className="text-[10px] font-black uppercase text-slate-400 mb-2">Line</label>
                <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)} className="bg-slate-50 border-4 border-slate-50 rounded-2xl px-6 py-4 font-black text-black outline-none focus:border-indigo-500 transition-all">
                  <option value="N/A">N/A</option>
                  {selectedProcess === 'Send to Wash' ? (
                    <>
                      <option value="Maxcom Wash Plant">Maxcom Wash Plant</option>
                      <option value="Pioneer Wash Tech">Pioneer Wash Tech</option>
                    </>
                  ) : selectedProcess.includes('Cutting') ? (
                    Array.from({ length: 10 }).map((_, i) => <option key={i} value={`Table-${i+1}`}>Table {i+1}</option>)
                  ) : selectedProcess.includes('Wash') ? (
                    <>
                      {Array.from({ length: 10 }).map((_, i) => <option key={`mx-${i}`} value={`MX-M/C-${i+1}`}>MX-M/C-{i+1}</option>)}
                      {Array.from({ length: 20 }).map((_, i) => <option key={`pwt-${i}`} value={`PWT-M/C-${i+1}`}>PWT-M/C-{i+1}</option>)}
                    </>
                  ) : (
                    Array.from({ length: 15 }).map((_, i) => <option key={i} value={`Line-${i+1}`}>Line {i+1}</option>)
                  )}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Rejection Qty</label>
                <input 
                  type="number"
                  value={rejectionQty}
                  onChange={e => setRejectionQty(e.target.value)}
                  className="bg-slate-50 border-4 border-slate-50 rounded-2xl px-6 py-4 font-black text-rose-600 outline-none focus:border-rose-500 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mt-6">
              <div className="flex flex-col">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Rejection Reason</label>
                <input 
                  type="text"
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  className="bg-slate-50 border-4 border-slate-50 rounded-2xl px-6 py-4 font-black text-slate-900 outline-none focus:border-rose-500 transition-all"
                  disabled={parseInt(rejectionQty) <= 0}
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Net Production Qty</label>
                <div className="bg-indigo-50 border-4 border-indigo-50 rounded-2xl px-6 py-4 font-black text-indigo-600 flex items-center justify-between">
                  <span>{Math.max(0, (parseInt(formData.qty) || 0) - (parseInt(rejectionQty) || 0))}</span>
                  <span className="text-[8px] uppercase opacity-50">Calculated</span>
                </div>
              </div>
            </div>

            <button 
              onClick={handleAddToOrder} 
              className="w-full mt-12 bg-slate-950 text-white py-8 rounded-[2rem] font-black uppercase tracking-widest shadow-2xl active:scale-[0.99] transition-all"
            >
              SUBMIT
            </button>
            
            {scanStatus.message && (
              <div className={`mt-8 px-8 py-4 rounded-2xl text-[10px] font-black uppercase border animate-fadeIn ${scanStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : scanStatus.type === 'warning' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                {scanStatus.message}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'rejections' && (
        <div className="space-y-8 animate-fadeIn pb-24 text-black">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Rejections Report</h2>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Track and manage production rejections</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={handleExportRejectionsExcel}
                  className="bg-emerald-600 text-white px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg flex items-center gap-2 active:scale-95"
                >
                  <Download size={16} /> Export Excel
                </button>
                <button 
                  onClick={fetchData}
                  className="bg-slate-50 text-slate-600 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all flex items-center gap-2"
                >
                  <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Refresh Data
                </button>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <SearchFieldSmall label="Buyer" value={rejectionSearch.buyer} onChange={(v: string) => setRejectionSearch({...rejectionSearch, buyer: v})} />
                <SearchFieldSmall label="Style" value={rejectionSearch.style} onChange={(v: string) => setRejectionSearch({...rejectionSearch, style: v})} />
                <SearchFieldSmall label="PO" value={rejectionSearch.po} onChange={(v: string) => setRejectionSearch({...rejectionSearch, po: v})} />
              </div>
              
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="flex items-center gap-2 mr-4">
                  {['ALL', 'Cutting', 'Sewing', 'Wash', 'Finishing'].map(cat => (
                    <button 
                      key={cat} 
                      onClick={() => setRejectionCategoryFilter(cat)} 
                      className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${rejectionCategoryFilter === cat ? 'bg-slate-900 text-white border-slate-900 shadow-lg' : 'bg-white text-slate-400 border-slate-100 hover:border-slate-200'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl">
                  <span className="text-[9px] font-black uppercase text-slate-400 px-2">Dates:</span>
                  <input 
                    type="date"
                    value={rejectionStartDate}
                    onChange={(e) => setRejectionStartDate(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none focus:border-indigo-500 w-32"
                  />
                  <span className="text-slate-300">-</span>
                  <input 
                    type="date"
                    value={rejectionEndDate}
                    onChange={(e) => setRejectionEndDate(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black outline-none focus:border-indigo-500 w-32"
                  />
                </div>

                {(rejectionSearch.buyer || rejectionSearch.style || rejectionSearch.po || rejectionCategoryFilter !== 'ALL' || rejectionStartDate || rejectionEndDate) && (
                  <button 
                    onClick={() => {
                      setRejectionSearch({ buyer: '', style: '', po: '' });
                      setRejectionCategoryFilter('ALL');
                      setRejectionStartDate('');
                      setRejectionEndDate('');
                    }}
                    className="px-6 py-2 text-[10px] font-black text-rose-500 uppercase hover:bg-rose-50 rounded-xl transition-all ml-auto"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredRejections.length > 0 ? (
            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px] font-bold text-black border-collapse">
                  <thead className="bg-slate-900 text-white uppercase text-[9px] font-black text-center sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Scan Date/Time</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Bundle</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Buyer</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Style</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">PO</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Color</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Size</th>
                      <th className="px-4 py-6 border-r border-slate-800">PO Qty</th>
                      <th className="px-4 py-6 border-r border-slate-800">Rejection Qty</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Process</th>
                      <th className="px-4 py-6 text-left border-r border-slate-800">Line</th>
                      <th className="px-4 py-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-center">
                    {paginatedRejections.map((r, idx) => (
                      <tr key={idx} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-4 text-left border-r border-slate-100 text-slate-500 tabular-nums">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-left font-black border-r border-slate-100 text-rose-600">{r.bundle_id}</td>
                        <td className="px-4 py-4 text-left border-r border-slate-100">{r.buyer}</td>
                        <td className="px-4 py-4 text-left font-black border-r border-slate-100">{r.style}</td>
                        <td className="px-4 py-4 text-left border-r border-slate-100">{r.po}</td>
                        <td className="px-4 py-4 text-left border-r border-slate-100">{r.color}</td>
                        <td className="px-4 py-4 text-left border-r border-slate-100">{r.size}</td>
                        <td className="px-4 py-4 border-r border-slate-100 tabular-nums">{r.po_qty?.toLocaleString()}</td>
                        <td className="px-4 py-4 border-r border-slate-100 tabular-nums text-rose-600 font-black">
                          {r.rejections_qty}
                        </td>
                        <td className="px-4 py-4 text-left border-r border-slate-100">
                          <span className="bg-slate-100 px-3 py-1 rounded-full text-[9px] uppercase">{r.process}</span>
                        </td>
                        <td className="px-4 py-4 text-left font-black border-r border-slate-100">{r.line}</td>
                        <td className="px-4 py-4 text-right">
                          <button 
                            onClick={() => handleDeleteRejection(r)}
                            className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination 
                totalRows={filteredRejections.length}
                currentPage={rejectionsPage}
                rowsPerPage={rowsPerPage}
                onPageChange={setRejectionsPage}
              />
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 p-20 text-center">
              <div className="flex flex-col items-center justify-center space-y-6">
                <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
                  <AlertCircle size={48} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 uppercase">No Rejections Found</h3>
                <p className="text-slate-400 font-bold text-sm max-w-md mx-auto">
                  {!dbRejections.length ? "There are currently no rejection records to display. Rejections will appear here once they are logged during the production process." : "No rejections match your search filters."}
                </p>
                {(rejectionSearch.buyer || rejectionSearch.style || rejectionSearch.po || rejectionCategoryFilter !== 'ALL' || rejectionStartDate || rejectionEndDate) && (
                  <button 
                    onClick={() => {
                      setRejectionSearch({ buyer: '', style: '', po: '' });
                      setRejectionCategoryFilter('ALL');
                      setRejectionStartDate('');
                      setRejectionEndDate('');
                    }}
                    className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black uppercase text-xs"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="space-y-6 animate-fadeIn pb-24 text-black">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 space-y-6 relative">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <h3 className="text-2xl font-black uppercase text-slate-900">Live Activity</h3>
              <div className="flex items-center gap-6">
                {(historySearch.startDate || historySearch.endDate) && (
                  <div className="text-right hidden lg:block">
                    <p className="text-[10px] font-black text-slate-400 uppercase">Viewing Tenure</p>
                    <p className="text-sm font-black text-slate-900">
                      {historySearch.startDate ? new Date(historySearch.startDate).toLocaleDateString() : 'Start'} - {historySearch.endDate ? new Date(historySearch.endDate).toLocaleDateString() : 'End'}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const today = new Date().toLocaleDateString('en-CA');
                      setHistorySearch({...historySearch, startDate: today, endDate: today});
                    }}
                    className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => {
                      const d = new Date();
                      d.setDate(d.getDate() - 1);
                      const yesterday = d.toLocaleDateString('en-CA');
                      setHistorySearch({...historySearch, startDate: yesterday, endDate: yesterday});
                    }}
                    className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors"
                  >
                    Yesterday
                  </button>
                  <button 
                    onClick={() => setHistorySearch({ bundleId: '', startDate: '', endDate: '', process: 'ALL', sewingLine: 'ALL', finishingLine: 'ALL' })}
                    className="px-6 py-2 text-[10px] font-black text-slate-400 uppercase hover:text-slate-900 transition-colors flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-100 shadow-sm hover:shadow-md active:scale-95"
                  >
                    <span>↺</span> Reset Filters
                  </button>
                </div>
              </div>
            </div>
            
            {/* Search Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 pt-6 border-t">
              <SearchFieldSmall 
                label="Bundle ID" 
                value={historySearch.bundleId} 
                onChange={(v: string) => setHistorySearch({...historySearch, bundleId: v})} 
              />
              <SearchFieldSmall 
                label="Start Date" 
                type="date"
                value={historySearch.startDate} 
                onChange={(v: string) => setHistorySearch({...historySearch, startDate: v})} 
              />
              <SearchFieldSmall 
                label="End Date" 
                type="date"
                value={historySearch.endDate} 
                onChange={(v: string) => setHistorySearch({...historySearch, endDate: v})} 
              />
              <div className="flex flex-col w-full">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Filter by Process</label>
                <select 
                  value={historySearch.process} 
                  onChange={e => setHistorySearch({...historySearch, process: e.target.value})}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value="ALL">ALL PROCESSES</option>
                  {PROCESS_FLOW.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="flex flex-col w-full">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Sewing Line</label>
                <select 
                  value={historySearch.sewingLine} 
                  onChange={e => setHistorySearch({...historySearch, sewingLine: e.target.value})}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value="ALL">ALL LINES</option>
                  {Array.from({ length: 15 }, (_, i) => `Line-${i + 1}`).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              <div className="flex flex-col w-full">
                <label className="text-[10px] font-black uppercase text-slate-400 mb-2">Finishing Line</label>
                <select 
                  value={historySearch.finishingLine} 
                  onChange={e => setHistorySearch({...historySearch, finishingLine: e.target.value})}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-black outline-none focus:border-indigo-500 transition-all shadow-sm"
                >
                  <option value="ALL">ALL LINES</option>
                  {Array.from({ length: 10 }, (_, i) => `Line-${i + 1}`).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100">
             <div className="overflow-x-auto">
               <table className="w-full text-left text-[11px] font-bold text-black">
                 <thead className="bg-slate-900 text-white uppercase text-[9px] font-black text-center">
                   <tr>
                     <th className="px-8 py-6 text-left">Scan Date/Time</th>
                     <th className="px-8 py-6 text-left">Bundle ID</th>
                     <th className="px-8 py-6 text-left">Style</th>
                     <th className="px-8 py-6 text-right">PO Qty</th>
                     <th className="px-8 py-6 text-center">Line</th>
                     <th className="px-8 py-6 text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y">
                   {paginatedHistory.map(o => (
                     <tr key={o.id} className="hover:bg-slate-50">
                       <td className="px-8 py-5 text-left tabular-nums text-slate-500">{new Date(o.created_at).toLocaleString()}</td>
                       <td className="px-8 py-5 text-left font-black">{o.bundle_id}</td>
                       <td className="px-8 py-5 text-left">{o.style}</td>
                       <td className="px-8 py-5 text-right font-black tabular-nums">{o.po_quantity?.toLocaleString()}</td>
                       <td className="px-8 py-5 text-center">
                         <div className="flex flex-col gap-1">
                           {o.sewing_line && <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-black uppercase">Sew: {o.sewing_line}</span>}
                           {o.finishing_line && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-black uppercase">Fin: {o.finishing_line}</span>}
                           {!o.sewing_line && !o.finishing_line && <span className="text-slate-400">-</span>}
                         </div>
                       </td>
                       <td className="px-8 py-5 text-right">
                         {historySearch.process !== 'ALL' ? (
                           <button 
                             onClick={() => handleDeleteRecord(o.bundle_id, historySearch.process)}
                             className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                             title={`Delete ${historySearch.process} record`}
                           >
                             <Trash2 size={16} />
                           </button>
                         ) : (
                           <span className="text-[9px] text-slate-400 uppercase">Filter process to delete</span>
                         )}
                       </td>
                     </tr>
                   ))}
                   {filteredHistory.length === 0 && (
                    <tr><td colSpan={6} className="py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No records found matching criteria</td></tr>
                   )}
                 </tbody>
               </table>
             </div>

             <Pagination 
               totalRows={filteredHistory.length}
               currentPage={historyPage}
               rowsPerPage={rowsPerPage}
               onPageChange={setHistoryPage}
             />
          </div>
        </div>
      )}
    </Layout>
    <Modal
      isOpen={modal.isOpen}
      onClose={() => setModal({ ...modal, isOpen: false })}
      title={modal.title}
      type={modal.type}
      confirmLabel={modal.confirmLabel}
      onConfirm={modal.onConfirm}
      showPasswordInput={modal.showPasswordInput}
    >
      {modal.message}
    </Modal>
    </>
  );
};

const DashboardCard = ({ icon: Icon, title, value, color, label, subMetrics }: any) => {
  const themes = { 
    blue: 'from-blue-600 to-blue-700 shadow-blue-200', 
    rose: 'from-rose-600 to-rose-700 shadow-rose-200', 
    amber: 'from-amber-600 to-amber-700 shadow-amber-200', 
    emerald: 'from-emerald-600 to-emerald-700 shadow-emerald-200',
    tan: 'from-[#B88E5E] to-[#967144] shadow-orange-100/20'
  };
  const theme = (themes as any)[color] || themes.blue;
  
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className={cn(
        "rounded-[2.5rem] p-8 bg-gradient-to-br text-white shadow-2xl relative overflow-hidden group border border-white/10",
        theme
      )}
    >
      <div className="absolute -right-6 -top-6 opacity-10 text-9xl font-black group-hover:scale-110 group-hover:-rotate-6 transition-transform duration-500">
        {label}
      </div>
      
      <div className="flex items-center space-x-4 mb-6 relative z-10">
        <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
          <Icon size={24} />
        </div>
        <p className="text-[11px] font-black uppercase tracking-widest text-white/80">{title}</p>
      </div>
      
      <div className="relative z-10">
        <p className="text-5xl font-black tracking-tighter mb-8 tabular-nums">
          {value.toLocaleString()}
        </p>
        
        <div className="space-y-4 border-t border-white/20 pt-6">
          {subMetrics?.map((m: any, i: number) => (
            <div key={i} className="flex justify-between items-center">
              <span className="text-[9px] font-black uppercase text-white/60 tracking-wider">{m.label}</span>
              <span className={cn(
                "text-[13px] font-black tabular-nums",
                m.highlight ? 'bg-white text-slate-900 px-3 py-1 rounded-full text-[10px]' : 'text-white'
              )}>
                {m.value.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const ScanField = ({ label, value, onChange, readOnly = false }: any) => (
  <div className="flex flex-col group">
    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest group-focus-within:text-indigo-600 transition-colors">
      {label}
    </label>
    <input 
      type="text" 
      value={value} 
      onChange={e => onChange(e.target.value)} 
      readOnly={readOnly}
      className={`bg-slate-50 border-4 ${readOnly ? 'border-slate-50 opacity-60 grayscale' : 'border-slate-50 focus:border-indigo-500 focus:bg-white shadow-sm'} rounded-2xl px-6 py-4 font-black text-slate-900 outline-none transition-all`} 
    />
  </div>
);

const SearchFieldSmall = ({ label, value, onChange, type = "text" }: any) => (
  <div className="flex flex-col w-full group">
    <label className="text-[10px] font-black uppercase text-slate-400 mb-2 group-focus-within:text-indigo-600 transition-colors">
      {label}
    </label>
    <div className="relative">
      <input 
        type={type} 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 text-xs font-bold text-black outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-sm pl-10" 
      />
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
    </div>
  </div>
);

const Pagination = ({ totalRows, currentPage, rowsPerPage, onPageChange }: any) => {
  const totalPages = Math.ceil(totalRows / rowsPerPage);
  if (totalPages <= 1) return null;

  // Calculate window of pages to show
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisiblePages - 1);
      
      if (end === totalPages) {
        start = Math.max(1, end - maxVisiblePages + 1);
      }
      
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between px-8 py-5 bg-white border-t border-slate-100 gap-4">
      <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest order-2 sm:order-1">
        Showing <span className="text-slate-900">{(currentPage - 1) * rowsPerPage + 1}</span> to <span className="text-slate-900">{Math.min(currentPage * rowsPerPage, totalRows)}</span> of <span className="text-slate-900">{totalRows}</span> records
      </div>
      <div className="flex items-center space-x-2 order-1 sm:order-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-xl hover:bg-slate-50 disabled:opacity-20 disabled:cursor-not-allowed transition-all border border-transparent hover:border-slate-100"
        >
          <ChevronLeft size={18} className="text-slate-600" />
        </button>
        
        <div className="flex items-center space-x-1">
          {pages[0] > 1 && (
            <>
              <button 
                onClick={() => onPageChange(1)}
                className="w-9 h-9 rounded-xl text-[10px] font-black transition-all border border-slate-100 text-slate-600 hover:border-indigo-500 hover:text-indigo-600"
              >
                1
              </button>
              {pages[0] > 2 && <span className="text-slate-300 px-1">...</span>}
            </>
          )}

          {pages.map(p => (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`w-9 h-9 rounded-xl text-[10px] font-black transition-all border ${
                currentPage === p 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xl shadow-indigo-100' 
                  : 'bg-white text-slate-600 border-slate-100 hover:border-indigo-500 hover:text-indigo-600'
              }`}
            >
              {p}
            </button>
          ))}

          {pages[pages.length - 1] < totalPages && (
            <>
              {pages[pages.length - 1] < totalPages - 1 && <span className="text-slate-300 px-1">...</span>}
              <button 
                onClick={() => onPageChange(totalPages)}
                className="w-9 h-9 rounded-xl text-[10px] font-black transition-all border border-slate-100 text-slate-600 hover:border-indigo-500 hover:text-indigo-600"
              >
                {totalPages}
              </button>
            </>
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-xl hover:bg-slate-50 disabled:opacity-20 disabled:cursor-not-allowed transition-all border border-transparent hover:border-slate-100"
        >
          <ChevronRight size={18} className="text-slate-600" />
        </button>
      </div>
    </div>
  );
};

export default App;
