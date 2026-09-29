import { Routes } from '@angular/router';

import { adminGuard, authGuard } from './core/guards';

export const routes: Routes = [
  { path: '', title: 'Haven', loadComponent: () => import('./pages/catalog').then((m) => m.CatalogPage) },
  {
    path: 'products/:slug',
    title: 'Product · Haven',
    loadComponent: () => import('./pages/product-detail').then((m) => m.ProductDetailPage),
  },
  { path: 'cart', title: 'Cart · Haven', loadComponent: () => import('./pages/cart').then((m) => m.CartPage) },
  {
    path: 'checkout',
    title: 'Checkout · Haven',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/checkout').then((m) => m.CheckoutPage),
  },
  {
    path: 'orders',
    title: 'Orders · Haven',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/orders').then((m) => m.OrdersPage),
  },
  {
    path: 'orders/:id',
    title: 'Order · Haven',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/order-detail').then((m) => m.OrderDetailPage),
  },
  { path: 'login', title: 'Sign in · Haven', loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  {
    path: 'register',
    title: 'Create account · Haven',
    loadComponent: () => import('./pages/register').then((m) => m.RegisterPage),
  },
  {
    path: 'admin',
    title: 'Admin · Haven',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminPage),
  },
  { path: '**', title: 'Not found · Haven', loadComponent: () => import('./pages/not-found').then((m) => m.NotFoundPage) },
];
