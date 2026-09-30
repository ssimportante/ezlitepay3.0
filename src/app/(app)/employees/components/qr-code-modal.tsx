
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface QRCodeModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  employeeId: string;
  qrCodeUrl?: string; // Optional: if you have a way to generate and provide URL
}

export function QRCodeModal({ isOpen, onOpenChange, employeeName, employeeId, qrCodeUrl }: QRCodeModalProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const finalQrCodeUrl = qrCodeUrl || `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(employeeId)}`;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch(finalQrCodeUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch QR code image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${employeeName.replace(/\s+/g, '_')}_QR_Code.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(objectUrl); // Clean up the object URL
      toast({ title: "Download Started", description: "QR Code image download has started." });
    } catch (error) {
      console.error("Error downloading QR code:", error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "Could not download the QR code image. Please try again.",
      });
    } finally {
      setIsDownloading(false);
    }
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Employee QR Code</DialogTitle>
          <DialogDescription>
            This QR code can be used for attendance scanning.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center justify-center space-y-4 py-4">
          <div className="p-4 border rounded-lg shadow-md bg-white">
            <Image 
              src={finalQrCodeUrl} 
              alt={`${employeeName} QR Code`} 
              width={200} 
              height={200} 
              data-ai-hint="qr code"
            />
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg">{employeeName}</p>
            <p className="text-sm text-muted-foreground">ID: {employeeId}</p>
          </div>
        </div>
        <DialogFooter className="sm:justify-center">
          <Button onClick={handleDownload} className="bg-primary hover:bg-primary/90" disabled={isDownloading}>
            {isDownloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download QR Code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
