
export interface Schedule {
  id: string;
  employeeId: string;
  employeeName: string;
  date: Date;
  timeIn: string; // HH:mm
  timeOut: string; // HH:mm
  lunchStart: string; // HH:mm
  lunchEnd: string; // HH:mm
  notes: string;
}
