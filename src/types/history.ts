
export interface RateHistory {
  id: string;
  rate: number;
  effectiveDate: Date;
}

export interface PositionHistory {
  id: string;
  position: string;
  effectiveDate: Date;
}

export interface EmployeeIdHistory {
  id: string;
  employeeId: string;
  effectiveDate: Date;
}

export interface EmployeeTypeHistory {
  id: string;
  employeeType: string;
  effectiveDate: Date;
}
