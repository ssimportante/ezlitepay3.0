"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Users, CalendarOff, Briefcase } from "lucide-react"; // Added Briefcase for Leave

import { PayrollHistoryReport } from "./components/payroll-history-report";
import { AttendanceReport } from "./components/attendance-report";
import { TardinessReport } from "./components/tardiness-report";
import { LeaveReport } from "./components/leave-report";

export default function ReportsPage() {
  return (
    <div className="p-4 md:p-6 space-y-6">
      <Tabs defaultValue="payroll-history" className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="payroll-history" className="flex items-center gap-2">
            <FileText size={16} /> Payroll History
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <Users size={16} /> Attendance
          </TabsTrigger>
          <TabsTrigger value="tardiness" className="flex items-center gap-2">
            <CalendarOff size={16} /> Tardiness
          </TabsTrigger>
          <TabsTrigger value="leave" className="flex items-center gap-2">
            <Briefcase size={16} /> Leave
          </TabsTrigger>
        </TabsList>

        <TabsContent value="payroll-history">
          <PayrollHistoryReport />
        </TabsContent>
        <TabsContent value="attendance">
          <AttendanceReport />
        </TabsContent>
        <TabsContent value="tardiness">
          <TardinessReport />
        </TabsContent>
        <TabsContent value="leave">
          <LeaveReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
