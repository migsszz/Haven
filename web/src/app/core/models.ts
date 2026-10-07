export interface Category {
  slug: string;
  name: string;
  productCount: number;
}

export interface Product {
  id: number;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
  category: { slug: string; name: string };
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface User {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type OrderStatus = 'placed' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  productId: number;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  id: number;
  status: OrderStatus;
  totalCents: number;
  shippingName: string;
  shippingAddress: string;
  createdAt: string;
  customerEmail: string | null;
  items: OrderItem[];
}

export interface StockProblem {
  productId: number;
  message: string;
  available?: number;
}

export type AssistantAction =
  | { type: 'add_to_cart'; product: Product; quantity: number }
  | { type: 'confirm_cancel_order'; orderId: number };

export interface AssistantReply {
  reply: string;
  products: Product[];
  actions: AssistantAction[];
}

/** Body of every error response from the API. */
export interface ApiErrorBody {
  error: string;
  details?: { field: string; message: string }[];
  problems?: StockProblem[];
}
