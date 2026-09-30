// src/app/(app)/logs/page.tsx
"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw, Activity, CalendarIcon, User, Filter as FilterIcon } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getAuditLogs, type AuditLog, type LogActionType } from "@/lib/firebase/firestore-services/log-service";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getEmployeesService } from "@/lib/firebase/firestore-services/employee-service";
import type { Employee } from "@/app/(app)/employees/components/employee-types";

const logActionTypes: LogActionType[] = [
    "Employee", "Schedule", "TimeLog", "Payroll", "LeaveRequest", "CompanySettings", "Customization"
];

export default function LogsPage() {
    const { toast } = useToast();
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [users, setUsers] = useState<string[]>([]);
    
    const [dateRangeFilter, setDateRangeFilter] = useState<DateRange | undefined>();
    const [userFilter, setUserFilter] = useState<string>("all");
    const [typeFilter, setTypeFilter] = useState<LogActionType | "all">("all");

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedLogs = await getAuditLogs({});
            setLogs(fetchedLogs);
            
            const uniqueUsers = [...new Set(fetchedLogs.map(log => log.user))];
            setUsers(uniqueUsers);

        } catch (error) {
            console.error("Error fetching audit logs:", error);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load audit logs.",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);
    
    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesUser = userFilter === "all" || log.user === userFilter;
            const matchesType = typeFilter === "all" || log.actionType === typeFilter;
            
            let matchesDate = true;
            if (dateRangeFilter?.from) {
                if (log.timestamp < dateRangeFilter.from) matchesDate = false;
            }
            if (dateRangeFilter?.to) {
                // To include the selected end date, we check if the log is before the start of the next day.
                const toDate = new Date(dateRangeFilter.to);
                toDate.setDate(toDate.getDate() + 1);
                if (log.timestamp >= toDate) matchesDate = false;
            }

            return matchesUser && matchesType && matchesDate;
        });
    }, [logs, dateRangeFilter, userFilter, typeFilter]);

    const clearFilters = () => {
        setDateRangeFilter(undefined);
        setUserFilter("all");
        setTypeFilter("all");
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="text-xl flex items-center gap-2"><Activity /> Audit Logs</CardTitle>
                    <CardDescription>Track all important changes and activities within the system.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border rounded-md bg-muted/30 items-center">
                        {/* Date Range Filter */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn("w-full md:w-[280px] justify-start text-left font-normal", !dateRangeFilter && "text-muted-foreground")}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {dateRangeFilter?.from ? (
                                        dateRangeFilter.to ? (
                                            `${format(dateRangeFilter.from, "LLL dd, y")} - ${format(dateRangeFilter.to, "LLL dd, y")}`
                                        ) : (
                                            format(dateRangeFilter.from, "LLL dd, y")
                                        )
                                    ) : (
                                        <span>Filter by date range</span>
                                    )}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar mode="range" selected={dateRangeFilter} onSelect={setDateRangeFilter} initialFocus />
                            </PopoverContent>
                        </Popover>
                        {/* User Filter */}
                        <Select value={userFilter} onValueChange={setUserFilter}>
                            <SelectTrigger className="w-full md:w-[200px]">
                                <SelectValue placeholder="Filter by user" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Users</SelectItem>
                                {users.map(user => <SelectItem key={user} value={user}>{user}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {/* Type Filter */}
                        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                            <SelectTrigger className="w-full md:w-[200px]">
                                <SelectValue placeholder="Filter by type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                {logActionTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Button variant="outline" onClick={clearFilters} className="w-full md:w-auto">
                            Clear Filters
                        </Button>
                        <Button onClick={() => fetchLogs()} variant="ghost" size="icon" title="Refresh Logs">
                            <RefreshCw className="h-5 w-5"/>
                        </Button>
                    </div>

                    {isLoading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                    ) : (
                        <ScrollArea className="border rounded-md max-h-[60vh]">
                            <Table>
                                <TableHeader className="sticky top-0 bg-background z-10">
                                    <TableRow>
                                        <TableHead className="w-[200px]">Timestamp</TableHead>
                                        <TableHead className="w-[150px]">User</TableHead>
                                        <TableHead className="w-[150px]">Action Type</TableHead>
                                        <TableHead>Description</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredLogs.length > 0 ? filteredLogs.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="text-xs">{format(log.timestamp, "MMM dd, yyyy, hh:mm:ss a")}</TableCell>
                                            <TableCell>{log.user}</TableCell>
                                            <TableCell>
                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">{log.actionType}</span>
                                            </TableCell>
                                            <TableCell className="text-sm">{log.description}</TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                                                No logs found matching the criteria.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </ScrollArea>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
