"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { QrCode, CameraOff, User, Clock, AlertCircle, Loader2, Video, Coffee, Utensils, LogOut, LogIn, Briefcase, RefreshCw, ShieldAlert, BadgeInfo, Award, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getEmployeeById, getEmployeesService } from '@/lib/firebase/firestore-services/employee-service';
import type { Employee } from '@/app/(app)/employees/components/employee-types';
import { addTimeLogEventService, getTimeLogEventsService, TimeLogEvent } from '@/lib/firebase/firestore-services/time-log-service';
import { getSchedulesService, addScheduleService } from '@/lib/firebase/firestore-services/schedule-service';
import type { Schedule } from '@/types/schedule';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import jsQR from 'jsqr';
import { format, differenceInMilliseconds, startOfDay, endOfDay, setHours, setMinutes, setSeconds, setMilliseconds, differenceInMinutes, getHours } from 'date-fns';
import { getCompanySettings, type CompanySettings } from '@/lib/firebase/firestore-services/company-service';
import { EZLitePayLogoIcon } from '@/components/icons/logo-icon';


type KioskState = 'idle' | 'scanning' | 'confirm_clock_in' | 'scanned_info_display';
type NextAction = "Clock In" | "Clock Out" | "Start Break" | "End Break" | "Start Lunch" | "End Lunch";

// --- Configuration ---
const KIOSK_AUTHORIZED_USER_EMAIL = 'kiosk@beanespress.com';
const EMPLOYEE_CACHE_KEY = 'kiosk-employee-cache';
const SCHEDULE_CACHE_KEY = 'kiosk-schedule-cache';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours


// Helper to format duration in milliseconds to a human-readable string like HH:MM:SS
function formatDurationFromMs(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const getDisplayStatus = (status: TimeLogEvent['status'] | null | undefined): string => {
    if (!status) return "Not Clocked In";
    switch (status) {
        case "Clock In":
            return "Clocked In";
        case "Start Break":
            return "On Break";
        case "Start Lunch":
            return "On Lunch";
        case "End Break":
            return "Clocked In";
        case "End Lunch":
            return "Clocked In";
        case "Clock Out":
            return "Clocked Out";
        default:
            return "Not Clocked In";
    }
};


export default function KioskPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number>();
  
  const [currentTime, setCurrentTime] = useState(new Date());
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [kioskState, setKioskState] = useState<KioskState>('idle');
  const [scannedEmployee, setScannedEmployee] = useState<Employee | null>(null);
  const [lastLog, setLastLog] = useState<TimeLogEvent | null>(null);
  const [nextActions, setNextActions] = useState<NextAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusDuration, setStatusDuration] = useState("00:00:00");
  const durationIntervalId = useRef<NodeJS.Timeout>();

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>();
  const [clockInMessage, setClockInMessage] = useState<string | null>(null);

  // Network status handler
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    setIsOnline(navigator.onLine);
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Check for authorization once user context is loaded
  useEffect(() => {
    if (!authLoading) {
      if (user && user.email === KIOSK_AUTHORIZED_USER_EMAIL) {
        setIsAuthorized(true);
      } else if (user) { 
        setIsAuthorized(false);
        toast({
            variant: 'destructive',
            title: 'Unauthorized Access',
            description: 'This account is not authorized for the Kiosk. Redirecting...'
        });
        setTimeout(() => router.push('/dashboard'), 2000);
      } else {
        setIsAuthorized(false);
      }
    }
  }, [user, authLoading, router, toast]);
  

  // Fetch company settings and update employee/schedule cache on mount if online
  useEffect(() => {
    async function initializeKiosk() {
        if (isAuthorized) {
            getCompanySettings().then(setCompanySettings);
            
            if (isOnline) {
                try {
                    const [employees, schedules] = await Promise.all([
                        getEmployeesService(),
                        getSchedulesService({ startDate: startOfDay(new Date()), endDate: endOfDay(new Date()) })
                    ]);

                    const employeeCache = {
                        timestamp: new Date().getTime(),
                        employees: employees
                    };
                    localStorage.setItem(EMPLOYEE_CACHE_KEY, JSON.stringify(employeeCache));
                    console.log('[Kiosk] Employee cache updated.');

                    const scheduleCache = {
                        timestamp: new Date().getTime(),
                        schedules: schedules
                    };
                    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(scheduleCache));
                    console.log('[Kiosk] Today\'s schedule cache updated.');

                } catch (error) {
                    console.error('[Kiosk] Failed to update caches:', error);
                }
            }
        }
    }
    initializeKiosk();
  }, [isAuthorized, isOnline]);
  
  // Live clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Duration counter effect
  useEffect(() => {
    if (durationIntervalId.current) {
      clearInterval(durationIntervalId.current);
    }
    
    if ((kioskState === 'scanned_info_display' || kioskState === 'confirm_clock_in') && lastLog && lastLog.status !== 'Clock Out') {
        const calculateAndUpdateDuration = () => {
            if (lastLog && lastLog.dateTime) {
                const durationMs = differenceInMilliseconds(new Date(), lastLog.dateTime);
                setStatusDuration(formatDurationFromMs(durationMs));
            }
        };
        calculateAndUpdateDuration();
        durationIntervalId.current = setInterval(calculateAndUpdateDuration, 1000);
    } else {
        setStatusDuration("00:00:00");
    }

    return () => {
        if (durationIntervalId.current) {
            clearInterval(durationIntervalId.current);
        }
    };
}, [kioskState, lastLog]);


  const stopScan = useCallback(() => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = undefined;
    }
    if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
    }
  }, []);
  
  const resetKiosk = useCallback(() => {
    stopScan();
    setKioskState('idle');
    setScannedEmployee(null);
    setLastLog(null);
    setNextActions([]);
    setIsProcessing(false);
    setClockInMessage(null);
  }, [stopScan]);

  const getEmployeeFromCache = (employeeId: string): Employee | null => {
      const cachedItem = localStorage.getItem(EMPLOYEE_CACHE_KEY);
      if (!cachedItem) return null;
      try {
          const cache = JSON.parse(cachedItem);
          if (new Date().getTime() - cache.timestamp > CACHE_EXPIRY_MS) {
              console.warn('[Kiosk] Employee cache is expired.');
              return null;
          }
          return cache.employees.find((emp: Employee) => emp.employeeId === employeeId) || null;
      } catch (e) {
          console.error('[Kiosk] Failed to parse employee cache.', e);
          return null;
      }
  };

  const getSchedulesFromCache = (): Schedule[] => {
      const cachedItem = localStorage.getItem(SCHEDULE_CACHE_KEY);
      if (!cachedItem) return [];
      try {
          const cache = JSON.parse(cachedItem);
           if (new Date().getTime() - cache.timestamp > CACHE_EXPIRY_MS) {
              console.warn('[Kiosk] Schedule cache is expired.');
              return [];
          }
          // The schedules in cache are JSON strings, they need dates rehydrated
          return cache.schedules.map((s: any) => ({ ...s, date: new Date(s.date) }));
      } catch (e) {
          console.error('[Kiosk] Failed to parse schedule cache.', e);
          return [];
      }
  };


  const handleQrCodeScanned = useCallback(async (employeeId: string) => {
    setIsProcessing(true);
    stopScan();
    setKioskState('idle'); // Stop scanning immediately
    const now = new Date();

    try {
        let employee: Employee | null = null;
        if (isOnline) {
            employee = await getEmployeeById(employeeId);
        } else {
            employee = getEmployeeFromCache(employeeId);
        }

        if (!employee) {
            toast({ variant: 'destructive', title: 'Invalid QR Code', description: isOnline ? 'Employee not found.' : 'Employee not found in local cache. Please connect to the internet to sync.' });
            setTimeout(resetKiosk, isOnline ? 2000 : 4000);
            return;
        }

        setScannedEmployee(employee);
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);
        
        let sessionLogs: TimeLogEvent[];
        let todaySchedules: Schedule[];

        if (isOnline) {
            [sessionLogs, todaySchedules] = await Promise.all([
                getTimeLogEventsService({ employeeId: employee.employeeId, startDate: todayStart, endDate: todayEnd }),
                getSchedulesService({ employeeId: employee.employeeId, startDate: todayStart, endDate: todayEnd })
            ]);
        } else {
            // Firestore will use its local cache for logs if it has them.
            sessionLogs = await getTimeLogEventsService({ employeeId: employee.employeeId, startDate: todayStart, endDate: todayEnd });
            // For schedules, we must rely on our localStorage cache when offline.
            const allCachedSchedules = getSchedulesFromCache();
            todaySchedules = allCachedSchedules.filter(s => s.employeeId === employee.employeeId);
        }

        const lastEvent = sessionLogs.length > 0 ? sessionLogs[0] : null; // Already sorted desc by service
        setLastLog(lastEvent);

        if (!lastEvent || lastEvent.status === 'Clock Out') {
            if (employee.employeeType.toLowerCase() === 'part-time') {
                setKioskState('confirm_clock_in');
                return;
            }

            const schedule = todaySchedules.length > 0 ? todaySchedules[0] : null;
            
            if (!schedule) {
                toast({
                    variant: 'destructive',
                    title: 'No Schedule Found',
                    description: `You do not have a schedule for today. Please see the manager on shift.`,
                    duration: 5000,
                });
                setTimeout(resetKiosk, 5000);
                return;
            }

            if (schedule.timeIn) {
              const [hoursStr, minutesStr] = schedule.timeIn.split(':');
              const scheduledTimeIn = setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(now), parseInt(hoursStr)), parseInt(minutesStr)), 0), 0);
              const timeDifferenceMinutes = differenceInMinutes(now, scheduledTimeIn);
              if (timeDifferenceMinutes > 0) setClockInMessage(`Hi ${employee.firstName}, you are clocking in late today.`);
              else if (timeDifferenceMinutes < -30) setClockInMessage(`Hi ${employee.firstName}, you are clocking in early today!`);
              else setClockInMessage(null);
            }
            setKioskState('confirm_clock_in');
        } else {
            let possibleActions: NextAction[] = [];
            const breakCount = sessionLogs.filter(log => log.status === 'Start Break').length;
            const lunchCount = sessionLogs.filter(log => log.status === 'Start Lunch').length;

            if (lastEvent.status === 'Clock In' || lastEvent.status === 'End Break' || lastEvent.status === 'End Lunch') {
                if (breakCount < 2) possibleActions.push('Start Break');
                if (lunchCount < 1) possibleActions.push('Start Lunch');
                possibleActions.push('Clock Out');
            } else if (lastEvent.status === 'Start Break') {
                possibleActions.push('End Break');
                possibleActions.push('Clock Out');
            } else if (lastEvent.status === 'Start Lunch') {
                possibleActions.push('End Lunch');
                possibleActions.push('Clock Out');
            }
            
            setNextActions(possibleActions);
            setKioskState('scanned_info_display');
        }
    } catch (error) {
        console.error('Error processing QR code:', error);
        toast({ variant: 'destructive', title: 'Error', description: isOnline ? 'Could not process QR code data.' : 'An error occurred. Check connection.' });
        resetKiosk();
    } finally {
       setIsProcessing(false);
    }
  }, [toast, resetKiosk, stopScan, isOnline]);


  // Main camera and scanner effect
  useEffect(() => {
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    
    if (kioskState !== 'scanning' || !video) {
        return;
    }
    
    const tick = () => {
        if (kioskState !== 'scanning' || !video || !canvasRef.current || video.readyState !== 4) {
             if (animationFrameId.current) {
                animationFrameId.current = requestAnimationFrame(tick);
             }
            return;
        }
        
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        
        if (context) {
            const CANVAS_WIDTH = 400;
            const CANVAS_HEIGHT = 400;
            canvas.height = CANVAS_HEIGHT;
            canvas.width = CANVAS_WIDTH;
            context.drawImage(video, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            const imageData = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            
            try {
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert',
                });

                if (code && code.data) {
                    handleQrCodeScanned(code.data);
                    return; // Stop the loop on successful scan
                }
            } catch (e) {
                console.error("QR Code parsing error:", e);
            }
        }
        animationFrameId.current = requestAnimationFrame(tick);
    }

    const startVideoStream = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const availableVideoDevices = devices.filter(d => d.kind === 'videoinput');
            setVideoDevices(availableVideoDevices);

            const videoConstraints: MediaTrackConstraints = {};
            if (currentDeviceId) {
                videoConstraints.deviceId = { exact: currentDeviceId };
            } else {
                videoConstraints.facingMode = "environment"; // Default to back camera
            }
            
            stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
            
            if(!currentDeviceId) {
                const currentTrack = stream.getVideoTracks()[0];
                const settings = currentTrack.getSettings();
                if(settings.deviceId) {
                    setCurrentDeviceId(settings.deviceId);
                }
            }

            setHasCameraPermission(true);

            if (video) {
                video.srcObject = stream;
                video.oncanplay = () => {
                    video.play().catch(e => console.error("Video play error:", e));
                    if (!animationFrameId.current) {
                        animationFrameId.current = requestAnimationFrame(tick);
                    }
                };
            }
        } catch (err) {
            console.error("Camera access error:", err);
            setHasCameraPermission(false);
            setKioskState('idle');
            toast({
                variant: 'destructive',
                title: 'Camera Access Denied',
                description: 'Please enable camera permissions in your browser settings to use the scanner.',
            });
        }
    };
    
    startVideoStream();

    // Cleanup function
    return () => {
        stopScan();
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        if (video) {
            video.srcObject = null;
            video.oncanplay = null;
        }
    };
  }, [kioskState, currentDeviceId, handleQrCodeScanned, stopScan, toast]);

  const startScan = useCallback(() => {
    if(!isAuthorized) return;
    setScannedEmployee(null);
    setLastLog(null);
    setNextActions([]);
    setKioskState('scanning');
  }, [isAuthorized]);

  const switchCamera = useCallback(() => {
    if (videoDevices.length > 1) {
        const currentIndex = videoDevices.findIndex(device => device.deviceId === currentDeviceId);
        const nextIndex = (currentIndex + 1) % videoDevices.length;
        setCurrentDeviceId(videoDevices[nextIndex].deviceId);
    }
  }, [videoDevices, currentDeviceId]);

  const handleAction = async (action: NextAction, employee: Employee | null = scannedEmployee) => {
    if (!employee) return;
    
    setIsProcessing(true);

    try {
      // This function call will now be queued by Firestore if offline.
      await addTimeLogEventService({
        employeeId: employee.employeeId,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        dateTime: new Date(),
        status: action,
      });

      toast({
        title: 'Success',
        description: `${employee.firstName} successfully performed: ${action} at ${format(new Date(), 'hh:mm a')}`,
      });
      
      setTimeout(resetKiosk, 2000); 
      
    } catch (error) {
      console.error('Error performing action:', error);
      toast({ variant: 'destructive', title: 'Action Failed', description: isOnline ? `Could not perform ${action}.` : `Action queued. Will sync when online.` });
      // We don't reset immediately on offline error, as the action is queued.
      if (isOnline) {
          setIsProcessing(false);
      } else {
          setTimeout(resetKiosk, 2000);
      }
    } 
  };
  
  if (authLoading && !user) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-background">
              <Loader2 className="h-16 w-16 animate-spin text-primary" />
          </div>
      );
  }

  if (!isAuthorized) {
      return (
          <div className="flex h-screen w-full items-center justify-center bg-background p-4">
              <Alert variant="destructive" className="max-w-md">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Unauthorized</AlertTitle>
                  <AlertDescription>
                      You do not have permission to access this Kiosk page. Redirecting...
                  </AlertDescription>
              </Alert>
          </div>
      );
  }

  return (
     <div className="flex flex-col min-h-screen bg-muted p-4 sm:p-6 md:p-8">
      {/* Header */}
      <header className="flex justify-between items-center w-full pb-6 shrink-0">
        <div className="flex items-center gap-4">
          <EZLitePayLogoIcon src={companySettings?.companyLogoUrl} className="h-20 w-20 sm:h-24 sm:w-24" data-ai-hint="company logo" />
          <h1 className="text-xl sm:text-3xl md:text-4xl font-bold text-foreground uppercase tracking-tight">{companySettings?.businessName || "Company Name"}</h1>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            {!isOnline && <WifiOff className="h-5 w-5 text-destructive" />}
            <p className="text-base sm:text-xl md:text-2xl font-semibold text-foreground">{format(currentTime, "MMMM d, yyyy")}</p>
          </div>
          <p className="text-sm sm:text-lg md:text-xl text-muted-foreground">{format(currentTime, "h:mm:ss a")}</p>
        </div>
      </header>

      <hr className="border-border -mx-4 sm:-mx-6 md:-mx-8" />

      {/* Main Content */}
      <div className="w-full max-w-4xl mx-auto flex-1 flex flex-col justify-center">
        <div className="bg-background p-8 rounded-2xl shadow-lg">
            <main className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center justify-center">
              {/* Left Side: Employee Info */}
              <div className="flex flex-col items-center text-center justify-center h-full">
                {scannedEmployee ? (
                  <Avatar className="h-40 w-40 sm:h-48 sm:w-48 border-4 border-muted shadow-lg">
                    <AvatarImage src={scannedEmployee.profilePicture || ''} alt={scannedEmployee.firstName} data-ai-hint="employee avatar" />
                    <AvatarFallback className="text-6xl bg-primary/20">{scannedEmployee.firstName?.[0]}{scannedEmployee.lastName?.[0]}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="h-40 w-40 sm:h-48 sm:w-48 border-4 border-dashed border-muted bg-muted/50 rounded-full flex items-center justify-center shadow-inner">
                    <User size={80} className="text-muted-foreground" />
                  </div>
                )}
                <h2 className="text-2xl lg:text-4xl font-bold mt-4">{scannedEmployee ? `${scannedEmployee.firstName} ${scannedEmployee.lastName}` : "Employee Name"}</h2>
                <p className="text-muted-foreground text-md lg:text-xl">{scannedEmployee ? scannedEmployee.position : "Position"}</p>
              </div>

              {/* Right Side: Scanner */}
              <div className="w-full h-full flex items-center justify-center">
                <div 
                  onClick={kioskState === 'idle' ? startScan : undefined} 
                  className={`relative aspect-square w-full max-w-sm rounded-2xl flex flex-col items-center justify-center transition-all duration-300 shadow-xl overflow-hidden
                    ${kioskState === 'scanning' ? 'bg-black' : 'bg-card border-2 border-dashed'}
                    ${kioskState === 'idle' && 'cursor-pointer hover:border-primary'}`
                  }
                >
                  {kioskState === 'idle' && (
                    <div className="text-center text-muted-foreground">
                      <QrCode size={80} className="mx-auto" />
                      <p className="mt-4 text-xl font-semibold">Tap To Scan QR</p>
                    </div>
                  )}
                  
                  {kioskState === 'scanning' && (
                     <div className="absolute inset-0">
                        <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                        <canvas ref={canvasRef} className="hidden" />
                         {isProcessing && (
                          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white">
                            <Loader2 className="h-12 w-12 animate-spin mb-4" />
                            <p className="text-lg font-semibold">Processing...</p>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-2/3 h-2/3 border-4 border-dashed border-white/50 rounded-2xl"/>
                        </div>

                        {videoDevices.length > 1 && (
                          <Button onClick={switchCamera} variant="outline" size="icon" className="absolute bottom-4 right-4 bg-black/50 text-white border-white/50 hover:bg-black/75">
                              <RefreshCw className="h-5 w-5" />
                              <span className="sr-only">Switch Camera</span>
                          </Button>
                        )}

                         {hasCameraPermission === false && (
                            <div className="absolute inset-0 bg-destructive/90 flex flex-col items-center justify-center text-destructive-foreground p-4">
                                <CameraOff size={48} className="mb-4" />
                                <h3 className="text-xl font-bold">Camera Error</h3>
                                <p className="text-center">Camera access was denied. Please enable it in your browser settings to use the scanner.</p>
                                <Button variant="secondary" className="mt-4" onClick={resetKiosk}>Go Back</Button>
                            </div>
                        )}
                      </div>
                  )}

                  {(kioskState === 'scanned_info_display' || kioskState === 'confirm_clock_in') && (
                     <div className="flex flex-col items-center justify-center text-center p-4">
                        <h3 className="text-2xl font-bold text-primary">Scan Successful!</h3>
                        <p className="text-muted-foreground">Please confirm the action below.</p>
                        {clockInMessage && (
                           <div className={`mt-2 flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-semibold
                            ${clockInMessage.includes('late') ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                              {clockInMessage.includes('late') ? <BadgeInfo size={16} /> : <Award size={16} />}
                              {clockInMessage}
                          </div>
                        )}
                        {isProcessing && <Loader2 className="h-12 w-12 animate-spin my-4 text-primary" />}
                    </div>
                  )}
                </div>
              </div>
            </main>
        </div>
      </div>

      <footer className="mt-auto pt-6 shrink-0">
         <div className="w-full max-w-4xl mx-auto border-2 border-muted rounded-2xl p-6 flex flex-col sm:flex-row items-stretch justify-between gap-6 shadow-lg bg-card text-card-foreground">
             <div className="flex-1 flex flex-col items-center sm:items-start justify-center text-center sm:text-left">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">STATUS</p>
                  <p className="text-3xl lg:text-4xl font-bold">{getDisplayStatus(lastLog?.status)}</p>
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-muted-foreground">DURATION</p>
                  <p className="text-3xl lg:text-4xl font-bold tracking-wider">{statusDuration}</p>
                </div>
             </div>
             
             <div className="flex-1 flex flex-col items-center justify-center gap-3">
              {kioskState === 'idle' && (
                  <p className="text-muted-foreground">Scan a QR code to see actions</p>
              )}

              {kioskState === 'confirm_clock_in' && !isProcessing && (
                <>
                  <p className="text-center font-semibold mb-2">Is this you?</p>
                  <div className="flex items-center gap-4">
                    <Button size="lg" onClick={() => handleAction("Clock In")} className="bg-green-500 hover:bg-green-600 text-white rounded-full px-8 py-3 text-lg font-semibold shadow-md">Yes</Button>
                    <Button size="lg" variant="outline" onClick={resetKiosk} className="rounded-full px-8 py-3 text-lg font-semibold shadow-md">No</Button>
                  </div>
                </>
              )}

              {kioskState === 'scanned_info_display' && !isProcessing && (
                <div className="flex flex-col items-center justify-center w-full space-y-3">
                    {nextActions.map(action => {
                        let Icon = Clock;
                        let bgColor = "bg-primary hover:bg-primary/90";
                        if(action.includes("Break")) { Icon = Coffee; bgColor = "bg-yellow-500 hover:bg-yellow-600"; }
                        if(action.includes("Lunch")) { Icon = Utensils; bgColor = "bg-orange-500 hover:bg-orange-600"; }
                        if(action.includes("Clock Out")) { Icon = LogOut; bgColor = "bg-red-500 hover:bg-red-600"; }
                        if(action.includes("Clock In")) { Icon = LogIn; bgColor = "bg-green-500 hover:bg-green-600"; }
                        
                        return (
                          <Button key={action} size="lg" onClick={() => handleAction(action)} disabled={isProcessing} className={`${bgColor} text-white rounded-lg px-6 py-3 text-base font-semibold shadow-md w-full max-w-xs`}>
                            <Icon className="mr-2 h-5 w-5" />
                            {action}
                          </Button>
                        )
                    })}
                    <Button variant="link" onClick={resetKiosk} className="text-sm text-muted-foreground flex items-center gap-1 h-auto p-1 mt-2">
                        <RefreshCw size={14}/> Not You? Scan Again
                    </Button>
                </div>
              )}

              {isProcessing && kioskState !== 'scanning' && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Processing...</span>
                  </div>
              )}
            </div>
         </div>
         <p className="text-center text-xs text-muted-foreground mt-4">EZLitePay Kiosk Mode © {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
