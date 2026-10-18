import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';

interface AiMessage {
  role: 'user' | 'assistant';
  text: string;
}

const SUGGESTIONS = [
  'Summarize this chat',
  'Give me 3 creative captions',
  'Help me reply to the last message'
];

/**
 * ✨ AI Workspace Companion — a floating assistant that opens into a sub-window.
 * Users can bounce ideas, request a summary of the active conversation, or
 * generate creative snippets. This build ships with a deterministic mock engine
 * (no external API key); swapping {@link AiCompanionComponent.respond} for a
 * real LLM call is a drop-in change.
 */
@Component({
  selector: 'app-ai-companion',
  standalone: true,
  imports: [FormsModule],
  template: `
    <!-- Floating action button -->
    <button
      type="button"
      class="floaty fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-messenger-blue via-indigo-500 to-purple-600 text-2xl text-white shadow-pane transition-all duration-300 hover:scale-110"
      (click)="toggle()"
      [class.ring-4]="open()"
      [class.ring-blue-200]="open()"
      aria-label="Open AI Workspace Companion"
      title="AI Workspace Companion"
    >
      @if (open()) { ✕ } @else { ✨ }
    </button>

    <!-- Sub-window -->
    @if (open()) {
      <div
        class="rise-in fixed bottom-24 right-6 z-40 flex h-[520px] w-[360px] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-pane backdrop-blur-xl"
      >
        <header class="flex items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-messenger-blue to-indigo-600 px-4 py-3 text-white">
          <span class="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">✨</span>
          <div class="flex-1">
            <h3 class="text-sm font-bold">AI Workspace Companion</h3>
            <p class="text-[11px] text-white/80">Bounce ideas · summarize · create</p>
          </div>
        </header>

        <div class="flex-1 space-y-3 overflow-y-auto p-4">
          @for (msg of messages(); track $index) {
            <div class="flex" [class.justify-end]="msg.role === 'user'">
              <div
                class="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm shadow-sm"
                [class.bg-messenger-blue]="msg.role === 'user'"
                [class.text-white]="msg.role === 'user'"
                [class.rounded-br-md]="msg.role === 'user'"
                [class.bg-gray-100]="msg.role === 'assistant'"
                [class.text-messenger-ink]="msg.role === 'assistant'"
                [class.rounded-bl-md]="msg.role === 'assistant'"
              >
                {{ msg.text }}
              </div>
            </div>
          }
          @if (thinking()) {
            <div class="flex items-center gap-2 text-xs text-messenger-muted">
              <span class="flex gap-1 rounded-full bg-gray-100 px-3 py-2">
                <span class="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                <span class="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400"></span>
                <span class="typing-dot h-1.5 w-1.5 rounded-full bg-gray-400"></span>
              </span>
            </div>
          }
        </div>

        @if (messages().length <= 1) {
          <div class="flex flex-wrap gap-2 px-4 pb-2">
            @for (s of suggestions; track s) {
              <button
                type="button"
                class="rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-medium text-messenger-muted transition-all duration-300 hover:border-messenger-blue hover:text-messenger-blue"
                (click)="quickAsk(s)"
              >
                {{ s }}
              </button>
            }
          </div>
        }

        <form class="flex items-center gap-2 border-t border-gray-100 px-3 py-3" (ngSubmit)="submit()">
          <input
            class="flex-1 rounded-full bg-gray-100 px-4 py-2 text-sm outline-none ring-messenger-blue focus:bg-white focus:ring-2"
            placeholder="Ask the companion…"
            [(ngModel)]="draft"
            name="aiDraft"
            autocomplete="off"
          />
          <button
            type="submit"
            class="flex h-9 w-9 items-center justify-center rounded-full bg-messenger-blue text-white transition-all duration-300 hover:bg-messenger-blue-dark disabled:opacity-40"
            [disabled]="!draft.trim() || thinking()"
            aria-label="Send"
          >
            ➤
          </button>
        </form>
      </div>
    }
  `
})
export class AiCompanionComponent implements OnInit, OnDestroy {
  private readonly chat = inject(ChatService);

  readonly open = signal(false);
  readonly thinking = signal(false);
  readonly messages = signal<AiMessage[]>([
    { role: 'assistant', text: "Hi! I'm your Workspace Companion ✨ Ask me to summarize a chat, brainstorm ideas, or draft a reply." }
  ]);
  readonly suggestions = SUGGESTIONS;
  draft = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    // State is driven by user interaction and the injected ChatService.
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  quickAsk(text: string): void {
    this.draft = text;
    this.submit();
  }

  submit(): void {
    const prompt = this.draft.trim();
    if (!prompt || this.thinking()) {
      return;
    }
    this.messages.update((m) => [...m, { role: 'user', text: prompt }]);
    this.draft = '';
    this.thinking.set(true);

    this.timer = setTimeout(() => {
      const reply = this.respond(prompt);
      this.messages.update((m) => [...m, { role: 'assistant', text: reply }]);
      this.thinking.set(false);
    }, 650);
  }

  /** Deterministic mock "AI". Replace with a real LLM call in production. */
  private respond(prompt: string): string {
    const q = prompt.toLowerCase();

    if (q.includes('summar')) {
      const convo = this.chat.activeConversation();
      const msgs = this.chat.currentMessages() ?? [];
      const recent = msgs.slice(-5);
      if (!convo || recent.length === 0) {
        return "Open a conversation and I'll summarize the latest messages for you.";
      }
      const lines = recent.map((m) => `• ${m.senderName}: ${m.content ?? '[media]'}`).join('\n');
      return `Here's a quick summary of “${convo.title}”:\n${lines}\n\nLooks like an active thread — want me to draft a reply?`;
    }

    if (q.includes('caption') || q.includes('creative')) {
      return 'Here are a few creative caption ideas:\n1. "Chasing sunsets & deadlines."\n2. "Little moments, big memories."\n3. "Making ordinary days feel cinematic."';
    }

    if (q.includes('reply') || q.includes('respond')) {
      return 'Try this friendly reply:\n"Thanks for the update! That works perfectly for me — let\'s lock it in and I\'ll circle back with the details."';
    }

    if (q.includes('idea') || q.includes('brainstorm')) {
      return 'Brainstorm spark ⚡\n• What if we turned this into a weekly ritual?\n• Who else could add a fresh perspective?\n• What\'s the smallest first step we can ship today?';
    }

    return `Great question! Here's my take on “${prompt}”:\nBreak it into a tiny first step, ship it, then iterate. If you share more context I can get specific — try "summarize this chat" while a conversation is open.`;
  }
}
