
import { Timestamp } from "firebase/firestore";

export type LeaveType = 'Paid' | 'Unpaid' | 'Sick' | 'Emergency' | 'Vacation' | 'Personal';
export type LeaveRequestStatus = 'Pending' | 'Approved' | 'Rejected';

export interface LeaveRequest {
  id: string;
  uid: string; // The auth UID of the user who created the request
  employeeId: string;
  employeeName: string;
  startDate: Date;
  endDate: Date;
  leaveType: LeaveType;
  reason: string;
  status: LeaveRequestStatus;
  formUrl: string;
  createdAt: Date;
}

export interface LeaveRequestData {
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  type: 'Paid' | 'Unpaid' | 'Sick';
  reason: string;
}

export interface LeaveBalance {
  employeeId: string;
  paidLeave: number;
  sickLeave: number;
  emergencyLeave: number;
}
