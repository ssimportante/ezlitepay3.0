
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, User, Upload, XCircle, Save } from "lucide-react";
import { isFirebaseStorageUrl, uploadDataUrlToStorage, deleteFileFromStorage, getFirebaseStoragePathFromUrl } from "@/lib/firebase/storage-service";

const MAX_FILE_SIZE_MB = 2;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function ProfileUpdateForm() {
    const { user, updateUserProfile, loading: authLoading } = useAuth();
    const { toast } = useToast();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
    const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (user?.displayName) {
            const nameParts = user.displayName.split(' ');
            setFirstName(nameParts[0] || "");
            setLastName(nameParts.slice(1).join(' ') || "");
            setProfilePicturePreview(user.photoURL || null);
        } else if (user) {
            setFirstName("");
            setLastName("");
            setProfilePicturePreview(user.photoURL || null);
        }
    }, [user]);

    const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                toast({ variant: "destructive", title: "File Too Large", description: `Profile picture must be smaller than ${MAX_FILE_SIZE_MB}MB.` });
                e.target.value = "";
                setProfilePictureFile(null);
                setProfilePicturePreview(user?.photoURL || null);
                return;
            }
            setProfilePictureFile(file);
            const reader = new FileReader();
            reader.onloadend = () => { setProfilePicturePreview(reader.result as string); };
            reader.readAsDataURL(file);
        }
    };

    const handleClearProfilePicture = () => {
        setProfilePictureFile(null);
        setProfilePicturePreview(null);
        const fileInput = document.getElementById('profilePicture') as HTMLInputElement;
        if (fileInput) fileInput.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        
        const newDisplayName = `${firstName.trim()} ${lastName.trim()}`.trim();
        if (!newDisplayName) {
            toast({ variant: "destructive", title: "Validation Error", description: "First name and last name cannot be empty."});
            return;
        }

        setIsSaving(true);
        
        const originalPhotoUrl = user.photoURL;
        let newPhotoUrlToSave: string | null | undefined = undefined; // undefined means "no change"
        let contentChanged = false;

        // Check if name changed
        if (newDisplayName !== user.displayName) {
            contentChanged = true;
        }

        try {
            // Handle new photo upload
            if (profilePictureFile && profilePicturePreview && profilePicturePreview.startsWith("data:")) {
                const photoPath = `userProfilePictures/${user.uid}/profile-${Date.now()}`;
                newPhotoUrlToSave = await uploadDataUrlToStorage(profilePicturePreview, photoPath);
                contentChanged = true;
            } 
            // Handle photo removal
            else if (profilePicturePreview === null && originalPhotoUrl) {
                newPhotoUrlToSave = null;
                contentChanged = true;
            }

            if (!contentChanged) {
                 toast({ title: "No Changes", description: "Your profile is already up to date." });
                 setIsSaving(false);
                 return;
            }

            await updateUserProfile({
                displayName: newDisplayName,
                photoURL: newPhotoUrlToSave !== undefined ? newPhotoUrlToSave : originalPhotoUrl
            });

            // Cleanup old photo from storage if a new one was uploaded or it was removed
            if (newPhotoUrlToSave !== undefined && originalPhotoUrl && isFirebaseStorageUrl(originalPhotoUrl)) {
                 const oldPath = getFirebaseStoragePathFromUrl(originalPhotoUrl);
                 if (oldPath) {
                     try { await deleteFileFromStorage(oldPath); }
                     catch(storageError) { console.warn("Could not delete old profile picture:", storageError); }
                 }
            }
            setProfilePictureFile(null); // Clear file input state after successful save
            toast({ title: "Profile Saved", description: "Your profile details have been updated." });

        } catch (error) {
            // The auth context already shows a toast on error
            console.error("Failed to update profile:", error);
        } finally {
            setIsSaving(false);
        }
    };

    if (authLoading) {
        return (
            <Card>
                <CardHeader><CardTitle>My Profile</CardTitle></CardHeader>
                <CardContent className="flex justify-center items-center h-24">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </CardContent>
            </Card>
        );
    }
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><User size={20}/> My Profile</CardTitle>
                <CardDescription>Personalize your account details.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="flex flex-col sm:flex-row gap-6 items-center">
                        <div className="space-y-1">
                            <Label>Profile Picture</Label>
                            <Avatar className="h-24 w-24">
                                <AvatarImage src={profilePicturePreview || undefined} alt="Profile Picture" data-ai-hint="user avatar" />
                                <AvatarFallback>{user?.displayName?.charAt(0) || user?.email?.charAt(0) || "U"}</AvatarFallback>
                            </Avatar>
                        </div>
                        <div className="flex-1 w-full space-y-2">
                             <Label htmlFor="profilePicture">Upload New Picture</Label>
                            <div className="flex items-center gap-2">
                                <Input id="profilePicture" type="file" accept="image/*" onChange={handleProfilePictureChange} />
                                <Button type="button" variant="ghost" size="icon" onClick={handleClearProfilePicture} title="Clear selected picture">
                                    <XCircle size={18} />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="Your First Name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Your Last Name"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" value={user?.email || ""} disabled readOnly />
                        <p className="text-xs text-muted-foreground">Email address cannot be changed.</p>
                    </div>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Profile
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
