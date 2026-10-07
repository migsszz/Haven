import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Product } from '../../core/models';
import { AdminProducts } from './admin-products';

const mat: Product = {
  id: 4,
  slug: 'yoga-mat',
  name: 'Non-Slip Yoga Mat',
  description: 'A mat.',
  priceCents: 3600,
  stock: 33,
  imageUrl: null,
  isActive: true,
  category: { slug: 'sports-outdoors', name: 'Sports & Outdoors' },
};

interface Internals {
  openEditor(p: Product | null): void;
  save(): Promise<void>;
  removePhoto(): Promise<void>;
  onPhotoChosen(e: Event): void;
  form: { patchValue(v: object): void; controls: { imageUrl: { value: string } } };
  error(): string | null;
}

describe('AdminProducts photos', () => {
  let http: HttpTestingController;
  let closed: boolean;

  beforeEach(() => {
    closed = false;
    // jsdom has no <dialog> support.
    HTMLDialogElement.prototype.showModal = () => undefined;
    HTMLDialogElement.prototype.close = () => {
      closed = true;
    };
    URL.createObjectURL = () => 'blob:preview';
    URL.revokeObjectURL = () => undefined;

    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  function setup() {
    const fixture = TestBed.createComponent(AdminProducts);
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/categories').flush([{ slug: 'sports-outdoors', name: 'Sports', productCount: 1 }]);
    http.expectOne((r) => r.url === '/api/admin/products').flush({ items: [mat], page: 1, pageSize: 48, total: 1 });
    return fixture.componentInstance as unknown as Internals;
  }

  function choose(page: Internals, file: File) {
    const input = { files: [file], value: 'x' } as unknown as HTMLInputElement;
    page.onPhotoChosen({ target: input } as unknown as Event);
  }

  const photo = () => new File([new Uint8Array(10)], 'mat.png', { type: 'image/png' });

  it('uploads the chosen photo after saving, then closes', async () => {
    const page = setup();
    page.openEditor(mat);
    choose(page, photo());

    const saving = page.save();
    http.expectOne({ method: 'PATCH', url: '/api/admin/products/4' }).flush(mat);
    await Promise.resolve();
    await Promise.resolve();
    const upload = http.expectOne({ method: 'POST', url: '/api/admin/products/4/image' });
    expect(upload.request.body instanceof FormData).toBe(true);
    expect((upload.request.body as FormData).get('file')).toBeInstanceOf(File);
    upload.flush({ ...mat, imageUrl: '/api/uploads/abc.webp' });
    await saving;

    expect(closed).toBe(true);
  });

  it('keeps the form open and says so when the upload fails after the product saved', async () => {
    const page = setup();
    page.openEditor(null);
    page.form.patchValue({ name: 'Mat', slug: 'yoga-mat', categorySlug: 'sports-outdoors', price: 36, stock: 3 });
    choose(page, photo());

    const saving = page.save();
    http.expectOne({ method: 'POST', url: '/api/admin/products' }).flush(mat, { status: 201, statusText: 'Created' });
    await Promise.resolve();
    await Promise.resolve();
    http
      .expectOne('/api/admin/products/4/image')
      .flush({ error: 'That file isn’t a readable image' }, { status: 422, statusText: 'Unprocessable' });
    await saving;

    expect(closed).toBe(false);
    expect(page.error()).toContain('The product was saved, but the photo wasn');
  });

  it('refuses a photo that is too big or the wrong type before sending anything', () => {
    const page = setup();
    page.openEditor(mat);

    choose(page, new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' }));
    expect(page.error()).toContain('over 5 MB');

    choose(page, new File(['<svg/>'], 'a.svg', { type: 'image/svg+xml' }));
    expect(page.error()).toContain('JPEG, PNG, or WebP');
    http.expectNone((r) => r.url.includes('/image'));
  });

  it('removes the photo right away', async () => {
    const page = setup();
    page.openEditor({ ...mat, imageUrl: '/api/uploads/abc.webp' });

    const removing = page.removePhoto();
    http.expectOne({ method: 'DELETE', url: '/api/admin/products/4/image' }).flush(mat);
    await removing;

    // The open form no longer holds the old URL, so the next Save can't put it back.
    expect(page.form.controls.imageUrl.value).toBe('');
    expect(page.error()).toBeNull();
  });
});
