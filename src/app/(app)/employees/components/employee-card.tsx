
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Edit, Trash2, Archive, Folder, Phone, Home, Briefcase, CalendarDays, TrendingUp, UserSquare, CalendarCheck2, History, QrCode, UserMinus, UserCheck, CalendarClock, GraduationCap, FileText } from "lucide-react";
import { DocumentsModal } from "./documents-modal";
import type { Employee } from "./employee-types";
import { format, differenceInMonths, isValid } from "date-fns";
import { QRCodeModal } from "./qr-code-modal";


interface EmployeeCardProps {
  employee: Employee;
  onViewDetails: (employee: Employee) => void;
  onEdit: (employee: Employee) => void;
  onArchive?: (employeeId: string) => void;
  onDelete?: (employeeId: string) => void;
  onSetInactive?: (employee: Employee) => void;
  onReactivate?: (employeeId: string) => void;
}

export function EmployeeCard({ employee, onViewDetails, onEdit, onArchive, onDelete, onSetInactive, onReactivate }: EmployeeCardProps) {
  const [isDocsModalOpen, setIsDocsModalOpen] = useState(false);
  const [isQRCodeModalOpen, setIsQRCodeModalOpen] = useState(false);
  const [tenureMonths, setTenureMonths] = useState<number | null>(null);

  useEffect(() => {
    if (employee.dateHired && isValid(employee.dateHired)) {
        setTenureMonths(differenceInMonths(new Date(), employee.dateHired));
    } else {
        setTenureMonths(null);
    }
  }, [employee.dateHired]);


  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "active": return "default";
      case "archived": return "secondary";
      case "resigned": return "secondary";
      case "end-of-contract": return "secondary";
      case "terminated": return "destructive";
      case "inactive": return "outline";
      case "on leave": return "outline";
      default: return "outline";
    }
  };

  const birthDate = employee.birthDate && isValid(employee.birthDate) ? employee.birthDate : null;
  const dateHired = employee.dateHired && isValid(employee.dateHired) ? employee.dateHired : null;
  const dateInactive = employee.dateInactive && isValid(employee.dateInactive) ? employee.dateInactive : null;
  const dateReactivated = employee.dateReactivated && isValid(employee.dateReactivated) ? employee.dateReactivated : null;

  return (
    <>
      <Card className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
        <CardHeader className="relative">
          <div className="absolute top-2 right-2 flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onViewDetails(employee)}>
              <Eye size={16} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(employee)}>
              <Edit size={16} />
            </Button>
            {employee.status.toLowerCase() === "active" && onSetInactive && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-yellow-600 hover:text-yellow-500" onClick={() => onSetInactive(employee)} title="Mark as Inactive">
                <UserMinus size={16} />
              </Button>
            )}
             {employee.status.toLowerCase() === "inactive" && onReactivate && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-500" onClick={() => onReactivate(employee.id)} title="Reactivate Employee">
                <UserCheck size={16} />
              </Button>
            )}
            {employee.status !== "archived" && onArchive && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onArchive(employee.id)}>
                <Archive size={16} />
              </Button>
            )}
            {employee.status === "archived" && onDelete && (
               <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" onClick={() => onDelete(employee.id)}>
                <Trash2 size={16} />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-primary">
              <AvatarImage src={employee.profilePicture || `https://placehold.co/64x64.png?text=${employee.firstName?.[0]}${employee.lastName?.[0]}`} alt={`${employee.firstName} ${employee.lastName}`} data-ai-hint="employee avatar" />
              <AvatarFallback>{employee.firstName?.[0]}{employee.lastName?.[0]}</AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-xl">{employee.firstName} {employee.lastName}</CardTitle>
              <CardDescription>{employee.position || "N/A"}</CardDescription>
              <CardDescription className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <FileText size={12} /> {employee.employeeId}
              </CardDescription>
            </div>
          </div>
          <Badge variant={getStatusVariant(employee.status)} className="mt-2 capitalize w-fit">{employee.status}</Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground flex-grow">
          {(employee.employeeType === 'Regular' || employee.employeeType === 'Fixed-term') && employee.leaveCredits !== undefined && (
            <div className="flex items-center gap-2">
              <CalendarCheck2 size={14} />
              <span>Leave Credits: {employee.leaveCredits != null ? employee.leaveCredits : 'N/A'}</span>
            </div>
          )}
           {employee.employeeType && (
            <div className="flex items-center gap-2">
              <Briefcase size={14} />
              <span>Type: {employee.employeeType}</span>
            </div>
          )}
          {employee.gender && (
             <div className="flex items-center gap-2">
              <UserSquare size={14} />
              <span>Gender: {employee.gender}</span>
            </div>
          )}
          {employee.degree && (
            <div className="flex items-center gap-2">
              <GraduationCap size={14} />
              <span>Degree: {employee.degree}</span>
            </div>
          )}
          {birthDate && (
            <div className="flex items-center gap-2">
              <CalendarDays size={14} />
              <span>Birth Date: {format(birthDate, "MMMM dd, yyyy")}</span>
            </div>
          )}
          {dateHired && (
            <div className="flex items-center gap-2">
              <Briefcase size={14} />
              <span>Start Date: {format(dateHired, "MMMM dd, yyyy")}</span>
            </div>
          )}
           {employee.status.toLowerCase() === "inactive" && dateInactive && (
            <div className="flex items-center gap-2 text-yellow-600">
              <CalendarClock size={14} />
              <span>Inactive Since: {format(dateInactive, "MMMM dd, yyyy")}</span>
            </div>
          )}
           {employee.status === "active" && dateReactivated && (
            <div className="flex items-center gap-2 text-green-600">
              <CalendarCheck2 size={14} />
              <span>Reactivated On: {format(dateReactivated, "MMMM dd, yyyy")}</span>
            </div>
          )}
          {tenureMonths !== null && (
            <div className="flex items-center gap-2">
              <TrendingUp size={14} />
              <span>
                Tenure: {Math.floor(tenureMonths / 12)} year{Math.floor(tenureMonths / 12) !== 1 ? 's' : ''} and {tenureMonths % 12} month{tenureMonths % 12 !== 1 ? 's' : ''}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Phone size={14} />
            <span>{employee.mobileNumber || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Home size={14} />
            <span className="truncate">{employee.address || "N/A"}</span>
          </div>
        </CardContent>
        <CardFooter className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setIsDocsModalOpen(true)} className="w-full">
            <Folder size={16} className="mr-2" /> Documents
          </Button>
           <Button variant="outline" onClick={() => setIsQRCodeModalOpen(true)} className="w-full">
            <QrCode size={16} className="mr-2" /> QR Code
          </Button>
        </CardFooter>
      </Card>

      <DocumentsModal
        isOpen={isDocsModalOpen}
        onOpenChange={setIsDocsModalOpen}
        employeeId={employee.id}
        employeeName={`${employee.firstName} ${employee.lastName}`}
      />
      <QRCodeModal
        isOpen={isQRCodeModalOpen}
        onOpenChange={setIsQRCodeModalOpen}
        employeeId={employee.employeeId}
        employeeName={`${employee.firstName} ${employee.lastName}`}
      />
    </>
  );
}

    