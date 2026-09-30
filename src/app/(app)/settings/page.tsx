
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building, ImageIcon, Loader2, PlusCircle, Settings2, Sparkles, Trash2, XCircle, UserCog } from "lucide-react"; 
import NextImage from "next/image";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { getCompanySettings, updateCompanySettings, type CompanySettings, initializeCompanySettingsIfNeeded } from "@/lib/firebase/firestore-services/company-service";
import { getCustomizationSettings, updateCustomizationSettings, type CustomizationSettings } from "@/lib/firebase/firestore-services/customization-service";
import { uploadDataUrlToStorage, deleteFileFromStorage, getFirebaseStoragePathFromUrl, isFirebaseStorageUrl } from "@/lib/firebase/storage-service";
import { ProfileUpdateForm } from "./components/profile-update-form";
import { ChangePasswordForm } from "./components/change-password-form";


const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;


function CustomizationSection({ title, fieldName, settings, onUpdate, isLoading }: {
    title: string;
    fieldName: keyof CustomizationSettings;
    settings: CustomizationSettings | null;
    onUpdate: (fieldName: keyof CustomizationSettings, newValues: string[]) => Promise<void>;
    isLoading: boolean;
}) {
    const [inputValue, setInputValue] = useState("");
    const currentValues = settings?.[fieldName] || [];

    const handleAdd = () => {
        if (inputValue && !currentValues.includes(inputValue)) {
            const newValues = [...currentValues, inputValue];
            onUpdate(fieldName, newValues);
            setInputValue("");
        }
    };

    const handleDelete = (valueToDelete: string) => {
        const newValues = currentValues.filter(v => v !== valueToDelete);
        onUpdate(fieldName, newValues);
    };

    return (
        <Card className="shadow-sm">
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>Add or remove options for this field.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex gap-2 mb-4">
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder={`New ${title.slice(0, -1)}`}
                        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                    <Button onClick={handleAdd} disabled={isLoading}>
                        <PlusCircle size={16} className="mr-2"/> Add
                    </Button>
                </div>
                {isLoading && currentValues.length === 0 ? <Loader2 className="animate-spin h-5 w-5 mx-auto"/> :
                 currentValues.length > 0 ? (
                    <ul className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-2">
                        {currentValues.map((value) => (
                            <li key={value} className="flex items-center justify-between text-sm p-1.5 rounded-md hover:bg-muted/50">
                                <span>{value}</span>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive/80" onClick={() => handleDelete(value)} disabled={isLoading}>
                                    <Trash2 size={14}/>
                                </Button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-center text-muted-foreground py-4">No custom options added yet.</p>
                )}
            </CardContent>
        </Card>
    );
}

const defaultCompanySettings: CompanySettings = {
  businessName: "EZLitePay Solutions Inc.",
  businessAddress: "123 Business Rd, Suite 456, Tech City, PH",
  payrollEmail: "payroll@ezlitepay.com",
  companyLogoUrl: "https://i.ibb.co/QjnMdhfN/App-Logo-v1.png",
  defaultCurrency: "php",
  emailNotifs: true,
  darkMode: false,
};

export default function SettingsPage() {
  const { toast } = useToast();

  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [companyLogoFile, setCompanyLogoFile] = useState<File | null>(null);
  const [companyLogoPreview, setCompanyLogoPreview] = useState<string | null>(defaultCompanySettings.companyLogoUrl || null);
  const [originalCompanyLogoUrlFromState, setOriginalCompanyLogoUrlFromState] = useState<string | null>(null);

  const [isSavingCompanyInfo, setIsSavingCompanyInfo] = useState(false);
  const [isLoadingCompanyInfo, setIsLoadingCompanyInfo] = useState(true);
  const [isSavingPreferences, setIsSavingPreferences] = useState(false);
  
  const [customizationSettings, setCustomizationSettings] = useState<CustomizationSettings | null>(null);
  const [isLoadingCustomization, setIsLoadingCustomization] = useState(true);
  const [isSavingCustomization, setIsSavingCustomization] = useState(false);

  useEffect(() => {
    async function fetchInitialData() {
      setIsLoadingCompanyInfo(true);
      setIsLoadingCustomization(true);
      try {
        await initializeCompanySettingsIfNeeded(defaultCompanySettings);
        const [settings, customSettings] = await Promise.all([
          getCompanySettings(),
          getCustomizationSettings()
        ]);
        
        if (settings) {
          setCompanySettings(settings);
          setCompanyLogoPreview(settings.companyLogoUrl || null);
          setOriginalCompanyLogoUrlFromState(settings.companyLogoUrl || null);
        } else {
           setCompanySettings(defaultCompanySettings);
           setCompanyLogoPreview(defaultCompanySettings.companyLogoUrl || null);
           setOriginalCompanyLogoUrlFromState(defaultCompanySettings.companyLogoUrl || null);
           toast({variant: "default", title: "Default Settings Loaded", description: "Please configure company settings."});
        }
        setCustomizationSettings(customSettings);
      } catch (error: any) {
        console.error("Load Error:", error);
        toast({ variant: "destructive", title: "Load Error", description: `Could not load settings: ${error.message || String(error)}` });
      } finally {
        setIsLoadingCompanyInfo(false);
        setIsLoadingCustomization(false);
      }
    }
    fetchInitialData();
  }, [toast]);


  const handleCompanyLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast({ variant: "destructive", title: "File Too Large", description: `Company logo must be smaller than ${MAX_FILE_SIZE_MB}MB.` });
        e.target.value = ""; 
        setCompanyLogoFile(null);
        setCompanyLogoPreview(companySettings.companyLogoUrl || originalCompanyLogoUrlFromState); 
        return;
      }
      setCompanyLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setCompanyLogoPreview(reader.result as string); };
      reader.readAsDataURL(file);
    } else {
      setCompanyLogoFile(null);
      setCompanyLogoPreview(companySettings.companyLogoUrl || originalCompanyLogoUrlFromState); 
    }
  };

  const handleClearCompanyLogo = () => {
    setCompanyLogoFile(null);
    setCompanyLogoPreview(null);
    const fileInput = document.getElementById('companyLogo') as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };


const handleSaveCompanyInfo = async () => {
    setIsSavingCompanyInfo(true);
    
    let newLogoFirebaseUrl: string | null | undefined = undefined;
    const originalDbSettings = await getCompanySettings(); 
    const currentLogoInDb = originalDbSettings?.companyLogoUrl || null;

    try {
        if (companyLogoFile && companyLogoPreview && companyLogoPreview.startsWith("data:")) {
            const logoPath = `companyLogos/logo-${Date.now()}-${companyLogoFile.name}`;
            newLogoFirebaseUrl = await uploadDataUrlToStorage(companyLogoPreview, logoPath);

            if (currentLogoInDb && isFirebaseStorageUrl(currentLogoInDb) && currentLogoInDb !== newLogoFirebaseUrl) {
                const oldPath = getFirebaseStoragePathFromUrl(currentLogoInDb);
                if (oldPath) {
                    try { await deleteFileFromStorage(oldPath); }
                    catch (e) { console.warn("[SettingsPage] Non-fatal: Failed to delete old company logo during replacement:", e); }
                }
            }
        } else if (companyLogoPreview === null && companyLogoFile === null && currentLogoInDb !== null) {
            newLogoFirebaseUrl = null;
            if (currentLogoInDb && isFirebaseStorageUrl(currentLogoInDb)) {
                const oldPath = getFirebaseStoragePathFromUrl(currentLogoInDb);
                if (oldPath) {
                    try { await deleteFileFromStorage(oldPath); }
                    catch (e) { console.warn("[SettingsPage] Non-fatal: Failed to delete old company logo on clear:", e); }
                }
            }
        } else if (companyLogoPreview && !companyLogoPreview.startsWith("data:") && companyLogoPreview !== currentLogoInDb) {
            newLogoFirebaseUrl = companyLogoPreview;
             if (currentLogoInDb && isFirebaseStorageUrl(currentLogoInDb)) {
                const oldPath = getFirebaseStoragePathFromUrl(currentLogoInDb);
                 if (oldPath) {
                     try { await deleteFileFromStorage(oldPath); }
                     catch (e) { console.warn("[SettingsPage] Non-fatal: Failed to delete old company logo when switching to external:", e); }
                 }
            }
        }

        const actualChanges: Partial<CompanySettings> = {};
        let contentChanged = false;

        if (companySettings.businessName !== (originalDbSettings?.businessName || "")) {
            actualChanges.businessName = companySettings.businessName;
            contentChanged = true;
        }
        if (companySettings.businessAddress !== (originalDbSettings?.businessAddress || "")) {
            actualChanges.businessAddress = companySettings.businessAddress;
            contentChanged = true;
        }
        if (companySettings.payrollEmail !== (originalDbSettings?.payrollEmail || "")) {
            actualChanges.payrollEmail = companySettings.payrollEmail;
            contentChanged = true;
        }
        if (newLogoFirebaseUrl !== undefined && newLogoFirebaseUrl !== currentLogoInDb) {
            actualChanges.companyLogoUrl = newLogoFirebaseUrl;
            contentChanged = true;
        }

        if (!contentChanged) {
            toast({ title: "No Changes", description: "Company information is already up to date." });
        } else {
            await updateCompanySettings(actualChanges);
            const updatedSettingsFromDb = await getCompanySettings();
            if (updatedSettingsFromDb) {
              setCompanySettings(updatedSettingsFromDb);
              setCompanyLogoPreview(updatedSettingsFromDb.companyLogoUrl || null);
              setOriginalCompanyLogoUrlFromState(updatedSettingsFromDb.companyLogoUrl || null);
            }
            toast({ title: "Company Info Saved", description: "Company details have been updated." });
        }

    } catch (error: any) {
        console.error("Save Failed:", error);
        toast({
            variant: "destructive",
            title: "Save Failed",
            description: `Could not save company info. ${error.message || String(error)}`,
        });
    } finally {
        setCompanyLogoFile(null);
        setIsSavingCompanyInfo(false);
    }
};


  const handleSettingChange = (key: keyof CompanySettings, value: any) => {
    setCompanySettings(prev => ({ ...prev, [key]: value }));
  };

const handleSavePreferences = async () => {
    setIsSavingPreferences(true);
    try {
      const originalDbSettings = await getCompanySettings();
      const preferencesToUpdate: Partial<CompanySettings> = {};
      let hasChanges = false;

      const currentDefaultCurrencyInDb = originalDbSettings?.defaultCurrency ?? defaultCompanySettings.defaultCurrency;
      if (companySettings.defaultCurrency !== currentDefaultCurrencyInDb) {
        preferencesToUpdate.defaultCurrency = companySettings.defaultCurrency;
        hasChanges = true;
      }
      
      const currentEmailNotifsInDb = originalDbSettings?.emailNotifs === undefined ? defaultCompanySettings.emailNotifs : originalDbSettings.emailNotifs;
      if (companySettings.emailNotifs !== currentEmailNotifsInDb) {
        preferencesToUpdate.emailNotifs = companySettings.emailNotifs;
        hasChanges = true;
      }

      const currentDarkModeInDb = originalDbSettings?.darkMode === undefined ? defaultCompanySettings.darkMode : originalDbSettings.darkMode;
      if (companySettings.darkMode !== currentDarkModeInDb) {
        preferencesToUpdate.darkMode = companySettings.darkMode;
        hasChanges = true;
      }

      if (!hasChanges) {
        toast({ title: "No Changes", description: "Preferences are already up to date." });
      } else {
        await updateCompanySettings(preferencesToUpdate);
        const updatedSettingsFromDb = await getCompanySettings(); 
        if (updatedSettingsFromDb) {
            setCompanySettings(updatedSettingsFromDb);
            setOriginalCompanyLogoUrlFromState(updatedSettingsFromDb.companyLogoUrl || null); 
        }
        toast({ title: "Preferences Saved", description: "Your preferences have been updated." });
      }
    } catch (error: any) {
      console.error("Save Error:", error);
      const errorMessage = error.message || "Could not save preferences.";
      toast({ variant: "destructive", title: "Save Error", description: errorMessage });
    } finally {
      setIsSavingPreferences(false);
    }
  };
  
    const handleUpdateCustomization = async (fieldName: keyof CustomizationSettings, newValues: string[]) => {
        setIsSavingCustomization(true);
        try {
            await updateCustomizationSettings({ [fieldName]: newValues });
            setCustomizationSettings(prev => ({ ...(prev || { employeeTypes: [], departments: [], positions: [], documentTypes: [], employeeStatuses: [] }), [fieldName]: newValues }));
            toast({ title: "Customization Updated", description: `${fieldName.replace(/([A-Z])/g, ' $1')} options have been saved.`});
        } catch (error: any) {
            console.error("Update Failed:", error);
            toast({ variant: "destructive", title: "Update Failed", description: `Could not update ${fieldName.replace(/([A-Z])/g, ' $1')}.`});
        } finally {
            setIsSavingCustomization(false);
        }
    };

  return (
    <div className="p-6">
      <Card className="shadow-md mb-6">
        <CardHeader>
          <CardTitle className="text-2xl flex items-center gap-2"><Settings2 /> Settings</CardTitle>
          <CardDescription>Manage your company settings and application preferences.</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="general" className="w-full space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="user-management" className="flex items-center gap-2"><UserCog size={16}/> User Management</TabsTrigger>
          <TabsTrigger value="customization">Customization</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Building size={20}/> Company Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isLoadingCompanyInfo ? <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> :
                (<>
                <div><Label htmlFor="companyLogo">Company Logo</Label>
                  <div className="flex items-center gap-2 mt-1">
                      {companyLogoPreview ? <NextImage src={companyLogoPreview} alt="Company Logo Preview" width={64} height={64} className="rounded border object-contain" data-ai-hint="company logo"/> : <div className="h-16 w-16 rounded border bg-muted flex items-center justify-center"><ImageIcon size={24} className="text-muted-foreground"/></div>}
                      <Input id="companyLogo" type="file" accept="image/*" onChange={handleCompanyLogoChange} className="max-w-xs"/>
                       <Button variant="ghost" size="icon" onClick={handleClearCompanyLogo} title="Clear selected logo" className="text-muted-foreground hover:text-destructive">
                          <XCircle size={18} />
                      </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG. Recommended: 200x200px. Max {MAX_FILE_SIZE_MB}MB.</p>
                </div>
                <div><Label htmlFor="businessName">Business Name</Label><Input id="businessName" value={companySettings.businessName || ""} onChange={e => handleSettingChange('businessName', e.target.value)} placeholder="Your Company LLC" /></div>
                <div><Label htmlFor="businessAddress">Business Address</Label><Textarea id="businessAddress" value={companySettings.businessAddress || ""} onChange={e => handleSettingChange('businessAddress', e.target.value)} placeholder="123 Business Rd, Suite 456" /></div>
                <div><Label htmlFor="payrollEmail">Payroll Email Address</Label><Input id="payrollEmail" type="email" value={companySettings.payrollEmail || ""} onChange={e => handleSettingChange('payrollEmail', e.target.value)} placeholder="payroll@yourcompany.com" /></div>
                <div className="flex gap-2">
                  <Button className="bg-primary hover:bg-primary/90" onClick={handleSaveCompanyInfo} disabled={isSavingCompanyInfo}>
                    {isSavingCompanyInfo && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Company Info
                  </Button>
                 
                </div>
                </>)}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardHeader><CardTitle className="text-lg">Other Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {isLoadingCompanyInfo ? <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> :
                (<>
                <div><Label htmlFor="currency">Default Currency</Label>
                  <Select value={companySettings.defaultCurrency || "php"} onValueChange={(value) => handleSettingChange('defaultCurrency', value)}>
                      <SelectTrigger id="currency"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="php">Philippine Peso (PHP)</SelectItem><SelectItem value="usd">US Dollar (USD)</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between"><Label htmlFor="emailNotifs" className="flex-grow">Email Notifications</Label><Switch id="emailNotifs" checked={companySettings.emailNotifs || false} onCheckedChange={(checked) => handleSettingChange('emailNotifs', checked)} /></div>
                <p className="text-xs text-muted-foreground mt-1">Receive important updates via email.</p>
                <div className="flex items-center justify-between"><Label htmlFor="darkMode" className="flex-grow">Dark Mode (UI Placeholder)</Label><Switch id="darkMode" checked={companySettings.darkMode || false} onCheckedChange={(checked) => handleSettingChange('darkMode', checked)} /></div>
                 <p className="text-xs text-muted-foreground -mt-2">Note: Actual theme switching needs full implementation.</p>
                 <Button className="bg-primary hover:bg-primary/90" onClick={handleSavePreferences} disabled={isSavingPreferences}>
                   {isSavingPreferences && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                   Save Preferences
                  </Button>
                </>)}
              </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="user-management" className="space-y-6">
          <ProfileUpdateForm />
          <ChangePasswordForm />
        </TabsContent>
        
        <TabsContent value="customization" className="space-y-6">
              <Card>
                  <CardHeader>
                      <CardTitle className="text-xl flex items-center gap-2"><Sparkles size={20}/> Dropdown Customization</CardTitle>
                      <CardDescription>Manage the options available in various dropdown menus throughout the application.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <CustomizationSection title="Employee Types" fieldName="employeeTypes" settings={customizationSettings} onUpdate={handleUpdateCustomization} isLoading={isSavingCustomization || isLoadingCustomization} />
                      <CustomizationSection title="Departments" fieldName="departments" settings={customizationSettings} onUpdate={handleUpdateCustomization} isLoading={isSavingCustomization || isLoadingCustomization} />
                      <CustomizationSection title="Positions" fieldName="positions" settings={customizationSettings} onUpdate={handleUpdateCustomization} isLoading={isSavingCustomization || isLoadingCustomization} />
                      <CustomizationSection title="Document Types" fieldName="documentTypes" settings={customizationSettings} onUpdate={handleUpdateCustomization} isLoading={isSavingCustomization || isLoadingCustomization} />
                      <CustomizationSection title="Employee Statuses" fieldName="employeeStatuses" settings={customizationSettings} onUpdate={handleUpdateCustomization} isLoading={isSavingCustomization || isLoadingCustomization} />
                  </CardContent>
              </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
