
export interface OrderMaster {
  id: string;
  buyer: string;
  style: string;
  po: string;
  color: string;
  country: string;
  size: string;
  po_qty: number;
  created_at: string;
}

export interface QRMaster {
  qr_id: string;
  order_id: string;
  bundle_qty: number;
  created_at: string;
}

export interface ScanningData {
  id: string;
  qr_id: string;
  process: string;
  qty: number;
  status: string;
  line: string;
  scanned_by: string;
  scan_time: string;
  // Metadata fields to facilitate production tracking lookups
  style?: string;
  buyer?: string;
  po?: string;
  color?: string;
  size?: string;
  po_qty?: number;
}

export interface QRDetail extends QRMaster {
  buyer: string;
  style: string;
  po: string;
  color: string;
  country: string;
  size: string;
  po_qty: number;
}

export enum ProductionProcess {
  CUTTING_INPUT = 'Cutting Input',
  CUTTING_OUTPUT = 'Cutting Output',
  SEWING_INPUT = 'Sewing Input',
  SEWING_OUTPUT = 'Sewing Output',
  SEND_TO_WASH = 'Send to Wash',
  WASH_INPUT = 'Wash Input',
  WASH_OUTPUT = 'Wash Output',
  FINISHING_INPUT = 'Finishing Input',
  FINISHING_OUTPUT = 'Finishing Output'
}

export enum ProductionStatus {
  COMPLETED = 'Completed',
  PENDING = 'Pending',
  REJECTED = 'Rejected'
}
