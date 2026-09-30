
'use server';
/**
 * @fileOverview A flow to generate the content for a payslip email.
 *
 * - generatePayslipEmail - A function that creates the subject and body for a payslip email.
 * - EmailPayslipInput - The input type for the generatePayslipEmail function.
 * - EmailPayslipOutput - The return type for the generatePayslipEmail function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { format } from 'date-fns';
import type { Payslip } from '@/app/(app)/payroll/page';

const EmailPayslipInputSchema = z.object({
  employeeName: z.string().describe('The full name of the employee receiving the payslip.'),
  payPeriod: z.string().describe('The pay period for the payslip (e.g., "August 01, 2024 - August 15, 2024").'),
  companyName: z.string().describe('The name of the company issuing the payslip.'),
  netPay: z.number().describe('The final net pay amount for the employee.'),
  payDate: z.date().describe('The date the payment is issued.'),
});
export type EmailPayslipInput = z.infer<typeof EmailPayslipInputSchema>;

// This new schema is specifically for the data AFTER formatting, which will be passed to the prompt.
const EmailPayslipPromptInputSchema = EmailPayslipInputSchema.extend({
  payDate: z.string().describe('The formatted date the payment is issued (e.g., "August 20, 2024").'),
  netPay: z.string().describe('The formatted final net pay amount for the employee (e.g., "₱10,000.00").'),
});


const EmailPayslipOutputSchema = z.object({
  subject: z.string().describe('A clear and professional subject line for the email.'),
  body: z.string().describe('The full, formatted body of the email, written in a professional but friendly tone. It should inform the employee about their attached payslip and summarize key details. Use newline characters for line breaks.'),
});
export type EmailPayslipOutput = z.infer<typeof EmailPayslipOutputSchema>;


export async function generatePayslipEmail(
  input: EmailPayslipInput
): Promise<EmailPayslipOutput> {
  return emailPayslipFlow(input);
}


const prompt = ai.definePrompt({
  name: 'emailPayslipPrompt',
  input: { schema: EmailPayslipPromptInputSchema }, // Use the new schema that expects strings
  output: { schema: EmailPayslipOutputSchema },
  prompt: `You are an HR assistant for a company called {{{companyName}}}. Your task is to generate a professional and friendly email to an employee regarding their payslip.

The employee's name is {{{employeeName}}}.
The payslip is for the pay period: {{{payPeriod}}}.
The net pay is {{netPay}}.
The pay date is {{payDate}}.

Generate a suitable subject line and email body. The body should be concise, congratulate the employee on their hard work, mention the key details (pay period and net pay), and state that their detailed payslip is attached.

Do not use placeholders like "[Employee Name]" in the output; use the actual values provided. The tone should be positive and professional.
`,
});

const emailPayslipFlow = ai.defineFlow(
  {
    name: 'emailPayslipFlow',
    inputSchema: EmailPayslipInputSchema,
    outputSchema: EmailPayslipOutputSchema,
  },
  async (input) => {
    // Format the date and currency for the prompt. This object now matches EmailPayslipPromptInputSchema.
    const formattedInput = {
      ...input,
      payDate: format(input.payDate, 'MMMM dd, yyyy'),
      netPay: new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
      }).format(input.netPay),
    };

    const { output } = await prompt(formattedInput);
    
    if (!output) {
      throw new Error('Failed to generate email content from the AI model.');
    }
    
    // Add a standard footer to the generated body
    const finalBody = `${output.body}\n\nBest regards,\n${input.companyName} Payroll Team`;
    
    return {
        subject: output.subject,
        body: finalBody
    };
  }
);
