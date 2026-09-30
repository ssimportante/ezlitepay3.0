
"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyRound, Loader2, Save } from "lucide-react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const passwordFormSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required."),
    newPassword: z.string().min(6, "New password must be at least 6 characters."),
    confirmPassword: z.string().min(6, "Please confirm your new password."),
}).refine(data => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match.",
    path: ["confirmPassword"], // Set error on confirmPassword field
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;


export function ChangePasswordForm() {
    const { reauthenticateAndChangePassword } = useAuth();
    const [isSaving, setIsSaving] = useState(false);
    
    const { register, handleSubmit, formState: { errors }, reset } = useForm<PasswordFormValues>({
        resolver: zodResolver(passwordFormSchema),
    });

    const onSubmit: SubmitHandler<PasswordFormValues> = async (data) => {
        setIsSaving(true);
        try {
            await reauthenticateAndChangePassword(data.currentPassword, data.newPassword);
            reset(); // Clear form on success
        } catch (error) {
            // Auth context handles the toast for errors like wrong password
            console.error("Password change failed from form component:", error);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><KeyRound size={20} /> Change Password</CardTitle>
                <CardDescription>Update your account password. You will be logged out from other devices.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="currentPassword">Current Password</Label>
                        <Input
                            id="currentPassword"
                            type="password"
                            {...register("currentPassword")}
                        />
                        {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                            id="newPassword"
                            type="password"
                            {...register("newPassword")}
                        />
                         {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            {...register("confirmPassword")}
                        />
                         {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
                    </div>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Update Password
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
