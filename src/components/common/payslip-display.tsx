

"use client";

import React from "react";
import type { SVGProps } from "react";
import { EZLitePayLogoIcon } from "@/components/icons/logo-icon";
import { formatCurrencyPhp } from "@/lib/utils";
import Image from "next/image";

// Use 'any' temporarily to break circular dependency with payroll/page.tsx
type TempPayslipData = any;

interface PayslipDisplayProps {
  payslip: TempPayslipData;
  companyLogo?: string | null | React.ComponentType<any>;
}


export const PayslipDisplay = React.forwardRef<HTMLDivElement, PayslipDisplayProps>(({ payslip, companyLogo }, ref) => {
  const LogoComponent = typeof companyLogo === 'function' ? companyLogo : null;
  const rawLogo = payslip.companyLogoUrl || companyLogo;
  const logoToUse = (typeof rawLogo === 'string' && rawLogo.startsWith('http')) 
    ? `/api/proxy-image?url=${encodeURIComponent(rawLogo)}` 
    : rawLogo;

  const earningsDetails: { label: string; amount: number }[] = [
    { label: "Standard Pay", amount: payslip.earnings.standardPay },
    { label: "Overtime Pay", amount: payslip.earnings.overtimePay },
  ];
  if (payslip.earnings.regularHolidayPay && payslip.earnings.regularHolidayPay > 0) {
    earningsDetails.push({ label: "Regular Holiday Pay", amount: payslip.earnings.regularHolidayPay });
  }
  if (payslip.earnings.specialHolidayPay && payslip.earnings.specialHolidayPay > 0) {
    earningsDetails.push({ label: "Special Holiday Pay", amount: payslip.earnings.specialHolidayPay });
  }
  if (payslip.earnings.regularHolidayOvertimePay && payslip.earnings.regularHolidayOvertimePay > 0) {
    earningsDetails.push({ label: "Regular Holiday OT Pay", amount: payslip.earnings.regularHolidayOvertimePay });
  }
   if (payslip.earnings.specialHolidayOvertimePay && payslip.earnings.specialHolidayOvertimePay > 0) {
    earningsDetails.push({ label: "Special Holiday OT Pay", amount: payslip.earnings.specialHolidayOvertimePay });
  }
  if (payslip.earnings.bonus && payslip.earnings.bonus > 0) {
    earningsDetails.push({ label: "Bonus", amount: payslip.earnings.bonus });
  }
  if (payslip.earnings.thirteenthMonthAmount && payslip.earnings.thirteenthMonthAmount > 0) {
    const isRegularOrFixed = payslip.employeeType === 'Regular' || payslip.employeeType === 'Fixed-term';
    const label = isRegularOrFixed ? "13th Month Pay" : "Year End Bonus";
    earningsDetails.push({ label, amount: payslip.earnings.thirteenthMonthAmount });
  }
  if (payslip.earnings.otherCompensations && payslip.earnings.otherCompensations > 0) {
    earningsDetails.push({ label: "Other Compensation", amount: payslip.earnings.otherCompensations });
  }

  return (
    <div ref={ref} id="payslip-content" className="bg-white p-8 font-sans text-sm text-gray-800 w-full">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 pb-4 border-b border-gray-200 w-full">
        <div className="h-24 w-24 relative mr-4 shrink-0" data-ai-hint="company logo container">
          {LogoComponent ? (
            <LogoComponent className="w-full h-full object-contain" data-ai-hint="company logo"/>
          ) : logoToUse && typeof logoToUse === 'string' ? (
            <img
              src={logoToUse}
              alt="Company Logo"
              crossOrigin="anonymous"
              className="w-full h-full object-contain"
              data-ai-hint="company logo"
            />
          ) : (
            <div className="h-full w-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs rounded-md" data-ai-hint="logo placeholder">
                Logo
            </div>
          )}
        </div>
        <div className="text-right flex-grow min-w-0">
          <h1 className="text-3xl font-bold text-green-700 mb-1 tracking-normal">PAYSLIP</h1>
          <p className="text-gray-500 text-sm tracking-normal">Pay Period: {payslip.payPeriod}</p>
          <p className="text-gray-500 text-xs mt-1 tracking-normal">Date Issued: {payslip.dateIssued}</p>
        </div>
      </div>

      {/* Company Information */}
       <div className="mb-6 pb-6 border-b border-gray-200">
        <h2 className="font-semibold text-green-700 text-base mb-2">Company Information</h2>
        <div className="break-words tracking-normal">
            <p className="font-bold text-gray-800">{payslip.companyName}</p>
            <p className="text-gray-600">{payslip.companyAddress}</p>
            <p className="text-gray-600">{payslip.companyContact}</p>
        </div>
      </div>


      {/* Employee Information */}
      <div className="mb-6 pb-6 border-b border-gray-200">
        <h2 className="font-semibold text-green-700 text-base mb-3">Employee Information</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <p><span className="text-gray-500">Name: </span><span className="font-medium text-gray-800">{payslip.employeeName}</span></p>
            <p><span className="text-gray-500">TIN: </span><span className="font-medium text-gray-800">{payslip.tin || "N/A"}</span></p>
            <p><span className="text-gray-500">ID: </span><span className="font-medium text-gray-800">{payslip.employeeId}</span></p>
            <p><span className="text-gray-500">SSS: </span><span className="font-medium text-gray-800">{payslip.sss || "N/A"}</span></p>
            <p><span className="text-gray-500">Position: </span><span className="font-medium text-gray-800">{payslip.employeePosition || "N/A"}</span></p>
            <p><span className="text-gray-500">PhilHealth: </span><span className="font-medium text-gray-800">{payslip.philhealth || "N/A"}</span></p>
            <p><span className="text-gray-500">Type: </span><span className="font-medium text-gray-800">{payslip.employeeType || "N/A"}</span></p>
            <p><span className="text-gray-500">Pag-IBIG: </span><span className="font-medium text-gray-800">{payslip.pagibig || "N/A"}</span></p>
        </div>
      </div>

      {/* Earnings & Deductions */}
      <div className="grid grid-cols-2 gap-x-8 mb-6">
        <div>
          <h2 className="text-base font-semibold mb-2 text-gray-800">Earnings</h2>
          <div className="space-y-1.5">
            {earningsDetails.map((item, index) => (
              <div key={index} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.label}</span>
                <span className="text-gray-800">{formatCurrencyPhp(item.amount)}</span>
              </div>
            ))}
          </div>
          <hr className="my-2 border-gray-200"/>
          <div className="flex justify-between font-bold text-sm text-gray-800">
            <span>Total Earnings</span>
            <span>{formatCurrencyPhp(payslip.totalEarnings)}</span>
          </div>
        </div>
        <div>
          <h2 className="text-base font-semibold mb-2 text-gray-800">Deductions</h2>
          <div className="space-y-1.5">
            {payslip.deductionsList && payslip.deductionsList.length > 0 ? (
              payslip.deductionsList.map((item: any, index: number) => (
                  <div key={index} className="flex justify-between text-sm">
                      <span className="text-gray-600">{item.description}</span>
                      <span className="text-gray-800">{formatCurrencyPhp(item.amount)}</span>
                  </div>
              ))
            ) : (
              <div className="flex justify-between text-sm">
                  <span className="text-gray-600">No itemized deductions</span>
                  <span className="text-gray-800">{formatCurrencyPhp(0)}</span>
              </div>
            )}
          </div>
          <hr className="my-2 border-gray-200"/>
          <div className="flex justify-between font-bold text-sm text-gray-800">
            <span>Total Deductions</span>
            <span>{formatCurrencyPhp(payslip.totalDeductions)}</span>
          </div>
        </div>
      </div>

      {/* Net Pay */}
      <div className="flex justify-between items-center my-6 bg-green-50 p-4 rounded-lg">
        <h2 className="text-lg font-bold text-green-800">Net Pay</h2>
        <span className="text-xl font-bold text-green-800">{formatCurrencyPhp(payslip.netPay)}</span>
      </div>

      {/* YTD Summary */}
      <div className="mt-8">
        <h2 className="text-base font-semibold mb-3 text-gray-800">Year-to-Date Summary ({payslip.ytdSummary.year})</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50">
            <p className="text-xs text-gray-500">YTD Earnings</p>
            <p className="font-semibold text-sm mt-1 text-gray-800">{formatCurrencyPhp(payslip.ytdSummary.earnings)}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50">
            <p className="text-xs text-gray-500">YTD Deductions</p>
            <p className="font-semibold text-sm mt-1 text-gray-800">{formatCurrencyPhp(payslip.ytdSummary.deductions)}</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-3 text-center bg-gray-50">
            <p className="text-xs text-gray-500">YTD Net Pay</p>
            <p className="font-semibold text-sm mt-1 text-gray-800">{formatCurrencyPhp(payslip.ytdSummary.netPay)}</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 mt-10 pt-4 border-t border-gray-200">
        <p>This is a computer-generated document.</p>
        <p className="mt-1">{payslip.companyName || ''}{payslip.companyEstYear ? ` • EST. ${payslip.companyEstYear}` : ''}</p>
      </div>
    </div>
  );
});
PayslipDisplay.displayName = "PayslipDisplay";
