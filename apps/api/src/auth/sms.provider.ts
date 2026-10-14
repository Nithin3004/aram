import { Injectable, Logger } from '@nestjs/common';

/** OTP delivery, behind an interface so the SMS vendor can be swapped. */
export abstract class SmsProvider {
  /** True when the code is not really sent (preview) and may be shown on screen. */
  abstract readonly exposesCode: boolean;
  abstract sendOtp(phone: string, code: string): Promise<void>;
}

@Injectable()
export class ConsoleSmsProvider extends SmsProvider {
  readonly exposesCode = true;
  private log = new Logger('SMS');
  async sendOtp(phone: string, code: string) {
    this.log.log(`OTP for ${phone}: ${code}`);
  }
}

@Injectable()
export class Msg91SmsProvider extends SmsProvider {
  readonly exposesCode = false;
  async sendOtp(phone: string, code: string) {
    const res = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: process.env.MSG91_AUTH_KEY ?? '' },
      body: JSON.stringify({ template_id: process.env.MSG91_TEMPLATE_ID, mobile: '91' + phone, otp: code }),
    });
    if (!res.ok) throw new Error(`MSG91 failed: ${res.status}`);
  }
}

export const smsProviderFactory = {
  provide: SmsProvider,
  useFactory: () => (process.env.SMS_PROVIDER === 'msg91' ? new Msg91SmsProvider() : new ConsoleSmsProvider()),
};
