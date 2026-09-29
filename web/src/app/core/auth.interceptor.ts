import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authed).pipe(
    catchError((err: unknown) => {
      // A 401 on a request that carried a token means the session ended; a 401 from
      // /login itself is just a wrong password and is handled by the form.
      if (err instanceof HttpErrorResponse && err.status === 401 && token && !req.url.startsWith('/api/auth/')) {
        auth.sessionExpired();
      }
      return throwError(() => err);
    }),
  );
};
