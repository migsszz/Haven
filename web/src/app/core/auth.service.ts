import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthResponse, User } from './models';
import { readStorage, writeStorage } from './storage';

const TOKEN_KEY = 'haven.token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly tokenSignal = signal<string | null>(readStorage<string | null>(TOKEN_KEY, null));
  private readonly userSignal = signal<User | null>(null);

  readonly token = this.tokenSignal.asReadonly();
  readonly user = this.userSignal.asReadonly();
  readonly isSignedIn = computed(() => this.userSignal() !== null);
  readonly isAdmin = computed(() => this.userSignal()?.isAdmin ?? false);

  /** Runs once at startup: turns a stored token back into a user, or drops it if it expired. */
  async restoreSession(): Promise<void> {
    if (!this.tokenSignal()) return;
    try {
      this.userSignal.set(await firstValueFrom(this.http.get<User>('/api/auth/me')));
    } catch {
      this.clear();
    }
  }

  async login(email: string, password: string): Promise<void> {
    this.accept(await firstValueFrom(this.http.post<AuthResponse>('/api/auth/login', { email, password })));
  }

  async register(name: string, email: string, password: string): Promise<void> {
    this.accept(await firstValueFrom(this.http.post<AuthResponse>('/api/auth/register', { name, email, password })));
  }

  logout(redirectTo = '/'): void {
    this.clear();
    this.router.navigateByUrl(redirectTo);
  }

  /** Called by the interceptor when the API rejects our token. */
  sessionExpired(): void {
    this.clear();
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url, expired: 1 } });
  }

  private accept(res: AuthResponse): void {
    this.tokenSignal.set(res.token);
    this.userSignal.set(res.user);
    writeStorage(TOKEN_KEY, res.token);
  }

  private clear(): void {
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    writeStorage(TOKEN_KEY, null);
  }
}
