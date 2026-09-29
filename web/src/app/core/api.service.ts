import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiErrorBody, Order, OrderStatus, Product } from './models';

export interface ProductInput {
  slug: string;
  name: string;
  description: string;
  categorySlug: string;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
}

export interface OrderInput {
  items: { productId: number; quantity: number }[];
  shippingName: string;
  shippingAddress: string;
}

/** Writes and one-off reads. Pages that just display data use httpResource directly. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  placeOrder(input: OrderInput): Promise<Order> {
    return firstValueFrom(this.http.post<Order>('/api/orders', input));
  }

  cancelOrder(id: number): Promise<Order> {
    return firstValueFrom(this.http.post<Order>(`/api/orders/${id}/cancel`, {}));
  }

  createProduct(input: ProductInput): Promise<Product> {
    return firstValueFrom(this.http.post<Product>('/api/admin/products', input));
  }

  updateProduct(id: number, changes: Partial<ProductInput>): Promise<Product> {
    return firstValueFrom(this.http.patch<Product>(`/api/admin/products/${id}`, changes));
  }

  updateOrderStatus(id: number, status: OrderStatus): Promise<Order> {
    return firstValueFrom(this.http.patch<Order>(`/api/admin/orders/${id}`, { status }));
  }
}

/** The API's error body, or a generic one for network failures. */
export function apiError(err: unknown): ApiErrorBody {
  if (err instanceof HttpErrorResponse) {
    if (err.error && typeof err.error === 'object' && 'error' in err.error) {
      return err.error as ApiErrorBody;
    }
    if (err.status === 0) return { error: "Can't reach the server. Check your connection and try again." };
  }
  return { error: 'Something went wrong. Please try again.' };
}

/** One readable line for a form: the first field error if there is one. */
export function apiErrorMessage(err: unknown): string {
  const body = apiError(err);
  const first = body.details?.[0];
  return first ? `${first.field}: ${first.message}` : body.error;
}
