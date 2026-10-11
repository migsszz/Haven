import { httpResource } from '@angular/common/http';
import { computed, Injectable, signal } from '@angular/core';

/** Lets any page open the shopping assistant, optionally with a question already asked. */
@Injectable({ providedIn: 'root' })
export class AssistantService {
  /** Whether the server has the assistant switched on (it needs an API key). */
  private readonly status = httpResource<{ enabled: boolean }>(() => '/api/assistant/status');
  readonly enabled = computed(() => this.status.value()?.enabled === true);

  readonly open = signal(false);
  /** A question waiting to be sent as soon as the panel is ready. The panel clears it. */
  readonly pendingQuestion = signal<string | null>(null);

  toggle(): void {
    this.open.update((o) => !o);
  }

  close(): void {
    this.open.set(false);
  }

  ask(question: string): void {
    this.pendingQuestion.set(question);
    this.open.set(true);
  }
}
