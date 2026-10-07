import { httpResource } from '@angular/common/http';
import { Component, ElementRef, inject, OnDestroy, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiService, apiErrorMessage, ProductInput } from '../../core/api.service';
import { Category, Page, Product } from '../../core/models';
import { MoneyPipe } from '../../shared/money.pipe';
import { ProductImage } from '../../shared/product-image';

const PAGE_SIZE = 48;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-admin-products',
  imports: [ReactiveFormsModule, MoneyPipe, ProductImage],
  template: `
    <div class="mb-3 flex flex-wrap items-center gap-2">
      <label class="input input-sm w-full sm:max-w-xs">
        <span class="sr-only">Search products</span>
        <input type="search" placeholder="Search products" (input)="onSearch($any($event.target).value)" />
      </label>
      <button class="btn btn-primary btn-sm sm:ml-auto" (click)="openEditor(null)">New product</button>
    </div>

    @if (products.error()) {
      <div role="alert" class="alert alert-error">
        Couldn't load products.
        <button class="btn btn-sm" (click)="products.reload()">Try again</button>
      </div>
    } @else if (products.value(); as result) {
      <div class="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <table class="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th class="text-right">Price</th>
              <th class="text-right">Stock</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (p of result.items; track p.id) {
              <tr [class.opacity-50]="!p.isActive">
                <td>
                  <div class="flex items-center gap-3">
                    <app-product-image
                      class="size-10 shrink-0 rounded-md"
                      [name]="p.name"
                      [category]="p.category.slug"
                      [src]="p.imageUrl"
                    />
                    <div>
                      <div class="font-medium">{{ p.name }}</div>
                      <div class="text-xs text-base-content/50">{{ p.slug }}</div>
                    </div>
                  </div>
                </td>
                <td>{{ p.category.name }}</td>
                <td class="text-right">{{ p.priceCents | money }}</td>
                <td class="text-right" [class.text-warning]="p.stock <= 5">{{ p.stock }}</td>
                <td>
                  <span class="badge badge-sm" [class.badge-success]="p.isActive">{{ p.isActive ? 'Live' : 'Hidden' }}</span>
                </td>
                <td><button class="btn btn-ghost btn-xs" (click)="openEditor(p)">Edit</button></td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="py-8 text-center text-base-content/60">No products found.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="skeleton h-60"></div>
    }

    <dialog #editor class="modal" (close)="editing.set(undefined)">
      <form [formGroup]="form" (ngSubmit)="save()" class="modal-box" novalidate>
        <h2 class="text-lg font-bold">{{ editing() ? 'Edit product' : 'New product' }}</h2>
        <fieldset class="fieldset">
          <label class="label" for="p-name">Name</label>
          <input id="p-name" class="input w-full" formControlName="name" />

          @if (!editing()) {
            <label class="label mt-1" for="p-slug">URL slug</label>
            <input id="p-slug" class="input w-full" formControlName="slug" placeholder="e.g. travel-mug" />
          }

          <label class="label mt-1" for="p-category">Category</label>
          <select id="p-category" class="select w-full" formControlName="categorySlug">
            @for (c of categories.value() ?? []; track c.slug) {
              <option [value]="c.slug">{{ c.name }}</option>
            }
          </select>

          <div class="mt-1 grid grid-cols-2 gap-3">
            <div>
              <label class="label" for="p-price">Price (USD)</label>
              <input id="p-price" type="number" min="0" step="0.01" class="input w-full" formControlName="price" />
            </div>
            <div>
              <label class="label" for="p-stock">Stock</label>
              <input id="p-stock" type="number" min="0" step="1" class="input w-full" formControlName="stock" />
            </div>
          </div>

          <label class="label mt-1" for="p-description">Description</label>
          <textarea id="p-description" class="textarea w-full" rows="3" formControlName="description"></textarea>

          <label class="label mt-1" for="p-photo">Photo</label>
          <div class="flex items-center gap-3">
            <app-product-image
              class="size-20 shrink-0 rounded-lg"
              [name]="form.controls.name.value || 'New product'"
              [category]="form.controls.categorySlug.value"
              [src]="photoPreview() ?? (form.controls.imageUrl.value || null)"
            />
            <div class="min-w-0 flex-1 space-y-1">
              <input
                id="p-photo"
                type="file"
                class="file-input file-input-sm w-full"
                accept="image/jpeg,image/png,image/webp"
                (change)="onPhotoChosen($event)"
              />
              @if (form.controls.imageUrl.value && !photoPreview()) {
                <button type="button" class="btn btn-ghost btn-xs" [disabled]="saving()" (click)="removePhoto()">
                  Remove photo
                </button>
              }
              <p class="text-xs text-base-content/60">JPEG, PNG, or WebP, up to 5 MB. Large photos are resized.</p>
            </div>
          </div>

          <label class="label mt-1" for="p-image">Or an image URL</label>
          <input id="p-image" class="input w-full" formControlName="imageUrl" placeholder="https://" />

          <label class="label mt-2 cursor-pointer gap-2">
            <input type="checkbox" class="toggle toggle-primary toggle-sm" formControlName="isActive" />
            Visible in the store
          </label>
        </fieldset>

        @if (error()) {
          <div role="alert" class="alert alert-error mt-3 text-sm">{{ error() }}</div>
        }

        <div class="modal-action">
          <button type="button" class="btn btn-ghost" (click)="editorRef().nativeElement.close()">Cancel</button>
          <button class="btn btn-primary" [disabled]="saving()">Save</button>
        </div>
      </form>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    </dialog>
  `,
})
export class AdminProducts implements OnDestroy {
  private readonly api = inject(ApiService);

  protected readonly editorRef = viewChild.required<ElementRef<HTMLDialogElement>>('editor');
  /** undefined = closed, null = creating, Product = editing. */
  protected readonly editing = signal<Product | null | undefined>(undefined);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly search = signal('');
  /** A photo picked in the form but not uploaded yet, and a local preview of it. */
  private pendingPhoto: File | null = null;
  protected readonly photoPreview = signal<string | null>(null);

  protected readonly categories = httpResource<Category[]>(() => '/api/categories');
  protected readonly products = httpResource<Page<Product>>(() => ({
    url: '/api/admin/products',
    params: { q: this.search(), sort: 'name', pageSize: PAGE_SIZE },
  }));

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    slug: ['', [Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)]],
    categorySlug: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    stock: [0, [Validators.required, Validators.min(0)]],
    description: [''],
    imageUrl: [''],
    isActive: [true],
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  protected onSearch(value: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search.set(value.trim()), 300);
  }

  ngOnDestroy(): void {
    this.clearPhoto();
  }

  protected onPhotoChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.clearPhoto();
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      input.value = '';
      this.error.set('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      input.value = '';
      this.error.set('That photo is over 5 MB. Choose a smaller one.');
      return;
    }
    this.error.set(null);
    this.pendingPhoto = file;
    this.photoPreview.set(URL.createObjectURL(file));
  }

  private clearPhoto(): void {
    const preview = this.photoPreview();
    if (preview) URL.revokeObjectURL(preview);
    this.photoPreview.set(null);
    this.pendingPhoto = null;
  }

  protected async removePhoto(): Promise<void> {
    const editing = this.editing();
    if (!editing) {
      this.form.controls.imageUrl.setValue('');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.applySaved(await this.api.removeProductImage(editing.id));
      this.products.reload();
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }

  /** Keeps the open form in step with what the server now has, so the next Save doesn't undo it. */
  private applySaved(product: Product): void {
    this.editing.set(product);
    this.form.controls.imageUrl.setValue(product.imageUrl ?? '');
  }

  protected openEditor(product: Product | null): void {
    this.clearPhoto();
    this.error.set(null);
    this.editing.set(product);
    this.form.reset({
      name: product?.name ?? '',
      slug: product?.slug ?? '',
      categorySlug: product?.category.slug ?? this.categories.value()?.[0]?.slug ?? '',
      price: product ? product.priceCents / 100 : 0,
      stock: product?.stock ?? 0,
      description: product?.description ?? '',
      imageUrl: product?.imageUrl ?? '',
      isActive: product?.isActive ?? true,
    });
    this.editorRef().nativeElement.showModal();
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const editing = this.editing();
    if (this.form.invalid || (!editing && !value.slug)) {
      this.form.markAllAsTouched();
      this.error.set('Fill in a name, a lowercase-with-dashes slug, a category, and a non-negative price and stock.');
      return;
    }

    const input: ProductInput = {
      slug: value.slug,
      name: value.name.trim(),
      description: value.description.trim(),
      categorySlug: value.categorySlug,
      priceCents: Math.round(value.price * 100),
      stock: Math.floor(value.stock),
      imageUrl: value.imageUrl.trim() || null,
      isActive: value.isActive,
    };

    this.saving.set(true);
    this.error.set(null);
    try {
      let saved: Product;
      if (editing) {
        const { slug: _slug, ...changes } = input;
        saved = await this.api.updateProduct(editing.id, changes);
      } else {
        saved = await this.api.createProduct(input);
      }
      this.applySaved(saved); // from here on this is an existing product, so a retry updates it
      this.products.reload();

      if (this.pendingPhoto) {
        try {
          this.applySaved(await this.api.uploadProductImage(saved.id, this.pendingPhoto));
          this.products.reload();
        } catch (err) {
          this.error.set(`The product was saved, but the photo wasn't uploaded: ${apiErrorMessage(err)}`);
          return;
        }
      }
      this.editorRef().nativeElement.close();
    } catch (err) {
      this.error.set(apiErrorMessage(err));
    } finally {
      this.saving.set(false);
    }
  }
}
