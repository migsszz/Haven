import { httpResource } from '@angular/common/http';
import { Component, ElementRef, inject, OnDestroy, output, signal, viewChild } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { ApiService, apiErrorMessage, ProductInput } from '../../core/api.service';
import { Category, Page, Product } from '../../core/models';
import { Icon } from '../../shared/icon';
import { MoneyPipe } from '../../shared/money.pipe';
import { ProductImage } from '../../shared/product-image';

const PAGE_SIZE = 48;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-admin-products',
  imports: [ReactiveFormsModule, MoneyPipe, ProductImage, Icon],
  template: `
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <label class="input w-full sm:max-w-xs">
        <app-icon name="search" />
        <span class="sr-only">Search products</span>
        <input type="search" placeholder="Search products" (input)="onSearch($any($event.target).value)" />
      </label>
      <button class="btn btn-primary sm:ml-auto" (click)="openEditor(null)">New product</button>
    </div>

    @if (rowError()) {
      <div role="alert" class="alert alert-error alert-soft mb-4">{{ rowError() }}</div>
    }

    @if (products.error()) {
      <div role="alert" class="alert alert-error alert-soft">
        Couldn't load products.
        <button class="btn btn-sm" (click)="products.reload()">Try again</button>
      </div>
    } @else if (products.value(); as result) {
      <div class="overflow-x-auto border-t border-base-300">
        <table class="table">
          <thead>
            <tr class="eyebrow border-base-300">
              <th class="font-medium">Product</th>
              <th class="font-medium">Category</th>
              <th class="text-right font-medium">Price</th>
              <th class="text-right font-medium">Stock</th>
              <th class="font-medium">Status</th>
              <th><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (p of result.items; track p.id) {
              <tr class="border-base-300">
                <td [class.opacity-55]="!p.isActive">
                  <div class="flex items-center gap-3">
                    <app-product-image class="size-12 shrink-0 rounded-sm" [name]="p.name" [category]="p.category.slug" [src]="p.imageUrl" />
                    <div>
                      <div class="font-medium">{{ p.name }}</div>
                      <div class="text-xs text-muted">{{ p.slug }}</div>
                    </div>
                  </div>
                </td>
                <td class="text-muted">{{ p.category.name }}</td>
                <td class="tabular text-right">{{ p.priceCents | money }}</td>
                <td class="text-right">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    class="input input-sm tabular w-20 text-right"
                    [class.text-accent]="p.stock <= 5"
                    [value]="p.stock"
                    [disabled]="stockBusy() === p.id"
                    [attr.aria-label]="'Stock for ' + p.name"
                    (change)="saveStock(p, $event)"
                  />
                </td>
                <td>
                  <span
                    class="badge whitespace-nowrap"
                    [class.badge-success]="p.isActive"
                    [class.badge-soft]="p.isActive"
                    [class.badge-ghost]="!p.isActive"
                  >
                    {{ p.isActive ? 'Live' : 'Hidden' }}
                  </span>
                </td>
                <td class="text-right"><button class="btn btn-ghost btn-sm" (click)="openEditor(p)">Edit</button></td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="py-12 text-center text-muted">No products found.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    } @else {
      <div class="skeleton h-60"></div>
    }

    <dialog #editor class="modal" (close)="editing.set(undefined)">
      <form [formGroup]="form" (ngSubmit)="save()" class="modal-box max-w-xl" novalidate>
        <h2 class="text-3xl">{{ editing() ? 'Edit product' : 'New product' }}</h2>
        <fieldset class="fieldset mt-4">
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

          <span class="label mt-1">Photo</span>
          <label
            for="p-photo"
            class="flex cursor-pointer items-center gap-4 border border-dashed p-3 focus-within:outline-2 focus-within:outline-accent"
            [class]="dragging() ? 'border-primary bg-base-200' : 'border-base-300'"
            (dragover)="onDragOver($event)"
            (dragleave)="dragging.set(false)"
            (drop)="onDrop($event)"
          >
            <app-product-image
              class="size-20 shrink-0 rounded-sm"
              [name]="form.controls.name.value || 'New product'"
              [category]="form.controls.categorySlug.value"
              [src]="photoPreview() ?? (form.controls.imageUrl.value || null)"
            />
            <span class="min-w-0 flex-1 text-sm">
              <span class="flex items-center gap-2 font-medium">
                <app-icon name="upload" /> Drop a photo here or <span class="underline underline-offset-2">browse</span>
              </span>
              <span class="mt-1 block text-xs text-muted">JPEG, PNG, or WebP, up to 5 MB. Large photos are resized.</span>
              @if (photoName()) {
                <span class="mt-1 block truncate text-xs text-success">{{ photoName() }} will upload when you save.</span>
              }
            </span>
            <input id="p-photo" type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" (change)="onPhotoChosen($event)" />
          </label>
          @if (form.controls.imageUrl.value && !photoPreview()) {
            <button type="button" class="link-quiet mt-2 self-start text-sm text-muted" [disabled]="saving()" (click)="removePhoto()">
              Remove photo
            </button>
          }

          <label class="label mt-3" for="p-image">Or an image URL</label>
          <input id="p-image" class="input w-full" formControlName="imageUrl" placeholder="https://" />

          <label class="label mt-4 cursor-pointer gap-3">
            <input type="checkbox" class="toggle toggle-primary toggle-sm" formControlName="isActive" />
            Visible in the store
          </label>
        </fieldset>

        @if (error()) {
          <div role="alert" class="alert alert-error alert-soft mt-4 text-sm">{{ error() }}</div>
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
  protected readonly photoName = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly rowError = signal<string | null>(null);
  protected readonly stockBusy = signal<number | null>(null);

  /** Fires after anything that changes the catalog, so the dashboard numbers can refresh. */
  readonly changed = output<void>();

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
    this.choosePhoto(input.files?.[0] ?? null, input);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault(); // allow dropping
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.choosePhoto(event.dataTransfer?.files?.[0] ?? null);
  }

  private choosePhoto(file: File | null, input?: HTMLInputElement): void {
    this.clearPhoto();
    if (!file) return;
    if (!PHOTO_TYPES.includes(file.type)) {
      if (input) input.value = '';
      this.error.set('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      if (input) input.value = '';
      this.error.set('That photo is over 5 MB. Choose a smaller one.');
      return;
    }
    this.error.set(null);
    this.pendingPhoto = file;
    this.photoName.set(file.name);
    this.photoPreview.set(URL.createObjectURL(file));
  }

  protected async saveStock(product: Product, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const stock = Number(input.value);
    if (input.value === '' || !Number.isInteger(stock) || stock < 0 || stock > 1_000_000) {
      input.value = String(product.stock);
      this.rowError.set('Stock must be a whole number from 0 to 1,000,000.');
      return;
    }
    if (stock === product.stock) return;
    this.stockBusy.set(product.id);
    this.rowError.set(null);
    try {
      await this.api.updateProduct(product.id, { stock });
      this.products.reload();
      this.changed.emit();
    } catch (err) {
      input.value = String(product.stock);
      this.rowError.set(apiErrorMessage(err));
    } finally {
      this.stockBusy.set(null);
    }
  }

  private clearPhoto(): void {
    const preview = this.photoPreview();
    if (preview) URL.revokeObjectURL(preview);
    this.photoPreview.set(null);
    this.photoName.set(null);
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
      this.changed.emit();
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
      this.changed.emit();

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
