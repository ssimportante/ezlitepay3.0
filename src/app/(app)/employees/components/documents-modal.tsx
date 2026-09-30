
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UploadCloud, FileText, Trash2, Eye, Download, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  addEmployeeDocument,
  getEmployeeDocuments,
  deleteEmployeeDocument as deleteEmployeeDocumentService,
  type StoredEmployeeDocument,
} from "@/lib/firebase/firestore-services/employee-service";
import { uploadFileToStorage, deleteFileFromStorage } from "@/lib/firebase/storage-service";


interface DocumentsModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string; // Use employeeId for Firestore operations
  employeeName: string;
}

const documentTypes = ["Resume", "Contract", "NDA", "Performance Review", "Incident Report", "Coaching Form", "Other"];

export function DocumentsModal({ isOpen, onOpenChange, employeeId, employeeName }: DocumentsModalProps) {
  const [uploadedDocuments, setUploadedDocuments] = useState<StoredEmployeeDocument[]>([]);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [selectedDocType, setSelectedDocType] = useState<string>(documentTypes[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchDocuments() {
      if (isOpen && employeeId) {
        setIsLoading(true);
        try {
          const docs = await getEmployeeDocuments(employeeId);
          setUploadedDocuments(docs);
        } catch (error) {
          console.error("Error fetching documents:", error);
          toast({ variant: "destructive", title: "Error", description: "Could not load documents." });
        } finally {
          setIsLoading(false);
        }
      }
    }
    fetchDocuments();
  }, [isOpen, employeeId, toast]);


  const handleFileUpload = async () => {
    if (!fileToUpload || !employeeId) return;
    setIsUploading(true);
    try {
      const filePath = `employeeDocuments/${employeeId}/${Date.now()}-${fileToUpload.name}`;
      const downloadURL = await uploadFileToStorage(fileToUpload, filePath);

      const newDocumentData: Omit<StoredEmployeeDocument, "id" | "createdAt"> = {
        name: fileToUpload.name,
        type: selectedDocType,
        uploadDate: new Date().toLocaleDateString(), // Or use serverTimestamp if preferred for sorting
        url: downloadURL,
        storagePath: filePath,
      };
      
      const newDocId = await addEmployeeDocument(employeeId, newDocumentData);
      setUploadedDocuments(prev => [...prev, { ...newDocumentData, id: newDocId, createdAt: new Date() }]); // Optimistic update with client date
      
      toast({ title: "Document Uploaded", description: `${fileToUpload.name} uploaded successfully.` });
      setFileToUpload(null);
      setSelectedDocType(documentTypes[0]);
      const fileInput = document.getElementById('document-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = "";

    } catch (error) {
      console.error("Error uploading document:", error);
      toast({ variant: "destructive", title: "Upload Failed", description: "Could not upload document." });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (doc: StoredEmployeeDocument) => {
    try {
      // Delete from Firebase Storage
      await deleteFileFromStorage(doc.storagePath);
      // Delete from Firestore
      await deleteEmployeeDocumentService(employeeId, doc.id);
      
      setUploadedDocuments(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: "Document Deleted", description: `${doc.name} has been deleted.`, variant: "destructive" });
    } catch (error) {
      console.error("Error deleting document:", error);
      toast({ variant: "destructive", title: "Delete Failed", description: `Could not delete ${doc.name}.` });
    }
  };

  const handleViewDocument = (doc: StoredEmployeeDocument) => {
    if (doc.url) {
      window.open(doc.url, '_blank');
    }
  };

  const handleDownloadDocument = (doc: StoredEmployeeDocument) => {
     if (doc.url) {
      // Create a temporary link element
      const link = document.createElement('a');
      link.href = doc.url;
      
      // Suggest a filename for the download
      // Browsers might ignore this for cross-origin resources if Content-Disposition is not set by the server
      // For Firebase Storage, this usually works.
      link.download = doc.name; 
      
      // Append to body to make it clickable, click it, and remove it
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      toast({ variant: "destructive", title: "Error", description: "Document URL not found." });
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{employeeName}'s Documents</DialogTitle>
          <DialogDescription>
            Manage, view, and download documents related to this employee.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4 max-h-[50vh] overflow-y-auto">
          {isLoading ? <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div> :
           uploadedDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No documents found for this employee.</p>
          ) : (
            <ul className="space-y-2">
              {uploadedDocuments.map(doc => (
                <li key={doc.id} className="flex items-center justify-between p-3 border rounded-md hover:bg-muted/50">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="overflow-hidden">
                      <p className="font-medium truncate" title={doc.name}>{doc.name}</p>
                      <p className="text-xs text-muted-foreground">{doc.type} - Uploaded: {doc.uploadDate}</p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => handleViewDocument(doc)} title="View Document" className="text-primary hover:text-primary/80">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDownloadDocument(doc)} title="Download Document" className="text-primary hover:text-primary/80">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteDocument(doc)} title="Delete Document" className="text-destructive hover:text-destructive/80">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        <div className="space-y-3 border-t pt-4">
          <p className="font-medium">Upload New Document</p>
          <div className="flex flex-col sm:flex-row gap-2">
             <select 
                value={selectedDocType} 
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="block w-full sm:w-1/3 rounded-md border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {documentTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            <Input 
              id="document-file-input"
              type="file" 
              onChange={(e) => setFileToUpload(e.target.files ? e.target.files[0] : null)} 
              className="flex-1"
            />
          </div>
          <Button onClick={handleFileUpload} disabled={!fileToUpload || isUploading} className="w-full bg-primary hover:bg-primary/90">
            {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
            Upload Document
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
