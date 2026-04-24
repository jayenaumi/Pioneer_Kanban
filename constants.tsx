
import React from 'react';

export const COLORS = {
  primary: '#2563eb',
  secondary: '#64748b',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
};

// Strict sequence: Cutting Input -> Cutting Output -> Sewing Input -> Sewing Output -> Send to Wash -> Wash Input -> Wash Output -> Finishing Input -> Finishing Output
export const PROCESS_FLOW = [
  'Cutting Input',
  'Cutting Output',
  'Sewing Input',
  'Sewing Output',
  'Send to Wash',
  'Wash Input',
  'Wash Output',
  'Finishing Input',
  'Finishing Output'
];

export const BUNDLE_QTY_FIXED = 20;

export const MOCK_ORDERS = []; 
export const MOCK_QR_DATA = []; 
