import { Body, Controller, Get, Ip, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { languageSchema, loginSchema, verifyOtpSchema } from '@aram/shared';
import { AuthUser, CurrentUser, Public } from '../common/auth-user';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body(new ZodPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Ip() ip: string) {
    return this.auth.login(body, ip);
  }

  @Public()
  @Post('verify-otp')
  verify(@Body(new ZodPipe(verifyOtpSchema)) body: z.infer<typeof verifyOtpSchema>, @Ip() ip: string) {
    return this.auth.verifyOtp(body, ip);
  }

  @Public()
  @Post('resend-otp')
  resend(@Body(new ZodPipe(z.object({ challengeId: z.string().min(1) }))) body: { challengeId: string }) {
    return this.auth.resendOtp(body.challengeId);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Patch('language')
  language(@CurrentUser() user: AuthUser, @Body(new ZodPipe(languageSchema)) body: { language: string }) {
    return this.auth.setLanguage(user.id, body.language);
  }
}
