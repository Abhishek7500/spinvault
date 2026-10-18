import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { createClient, RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export interface SpinVaultProfile {
  id: string;
  username: string;
  role: 'player' | 'admin';
}

export interface SpinVaultIdentity extends SpinVaultProfile {
  email: string;
}

export interface SpinVaultGame {
  id: string;
  title: string;
  logo_url: string | null;
  download_url: string | null;
}

export interface SpinVaultMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  request_type: 'load' | 'cashout' | null;
  amount: number | null;
  request_status: 'pending' | 'approved' | 'denied' | 'loaded' | 'cashout_sent' | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_url?: string | null;
  created_at: string;
}

export interface SpinVaultPaymentMethod {
  id: string;
  name: string;
  instructions: string;
  qr_code_path: string | null;
  enabled: boolean;
  sort_order: number;
  qr_code_url?: string | null;
}

export interface SpinVaultThread {
  profile: SpinVaultProfile;
  latestMessage: SpinVaultMessage;
}

@Injectable({ providedIn: 'root' })
export class SpinVaultService {
  private readonly identitySubject = new BehaviorSubject<SpinVaultIdentity | null>(null);
  private readonly profileErrorSubject = new BehaviorSubject<string | null>(null);
  private clientInstance: SupabaseClient | null = null;
  private initialized = false;

  readonly identity$ = this.identitySubject.asObservable();
  readonly profileError$ = this.profileErrorSubject.asObservable();

  get isConfigured(): boolean {
    return Boolean(environment.supabaseUrl && environment.supabaseAnonKey);
  }

  get currentIdentity(): SpinVaultIdentity | null {
    return this.identitySubject.value;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (data.session) await this.loadProfile(data.session.user);
    this.client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        this.identitySubject.next(null);
        this.profileErrorSubject.next(null);
        return;
      }
      setTimeout(() => {
        void this.loadProfile(session.user).catch((error: unknown) => {
          this.profileErrorSubject.next(this.errorMessage(error));
        });
      }, 0);
    });
    this.initialized = true;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error('Sign-in succeeded without a user account.');
    await this.loadProfile(data.user);
  }

  async signUp(email: string, username: string, password: string): Promise<boolean> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) throw error;
    if (!data.user) throw new Error('Sign-up succeeded without a user account.');
    if (!data.session) return false;
    await this.loadProfile(data.user);
    return true;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.identitySubject.next(null);
  }

  async loadGames(): Promise<SpinVaultGame[]> {
    const { data, error } = await this.client
      .from('games')
      .select('id,title,logo_url,download_url')
      .order('title');
    if (error) throw error;
    return data as SpinVaultGame[];
  }

  async sendMessage(
    receiverId: string,
    content: string,
    requestType: 'load' | 'cashout' | null = null,
    amount: number | null = null,
    attachment?: { path: string; name: string }
  ): Promise<SpinVaultMessage> {
    const identity = this.requireIdentity();
    const { data, error } = await this.client
      .from('chat_messages')
      .insert({
        sender_id: identity.id,
        receiver_id: receiverId,
        content,
        request_type: requestType,
        amount,
        request_status: requestType ? 'pending' : null,
        attachment_path: attachment?.path ?? null,
        attachment_name: attachment?.name ?? null
      })
      .select('id,sender_id,receiver_id,content,request_type,amount,request_status,attachment_path,attachment_name,created_at')
      .single();
    if (error) throw error;
    return data as SpinVaultMessage;
  }

  async loadConversation(otherUserId: string): Promise<SpinVaultMessage[]> {
    const identity = this.requireIdentity();
    const { data, error } = await this.client
      .from('chat_messages')
      .select('id,sender_id,receiver_id,content,request_type,amount,request_status,attachment_path,attachment_name,created_at')
      .or(
        `and(sender_id.eq.${identity.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${identity.id})`
      )
      .order('created_at', { ascending: true });
    if (error) throw error;
    return this.resolveMessageAttachments(data as SpinVaultMessage[]);
  }

  async loadAdminInbox(): Promise<SpinVaultThread[]> {
    const identity = this.requireIdentity();
    const { data: messages, error: messagesError } = await this.client
      .from('chat_messages')
      .select('id,sender_id,receiver_id,content,request_type,amount,request_status,attachment_path,attachment_name,created_at')
      .order('created_at', { ascending: false });
    if (messagesError) throw messagesError;

    const latestByPlayer = new Map<string, SpinVaultMessage>();
    for (const message of messages as SpinVaultMessage[]) {
      const playerId = message.sender_id === identity.id ? message.receiver_id : message.sender_id;
      if (playerId !== identity.id && !latestByPlayer.has(playerId)) {
        latestByPlayer.set(playerId, message);
      }
    }
    if (!latestByPlayer.size) return [];

    const { data: profiles, error: profilesError } = await this.client
      .from('profiles')
      .select('id,username,role')
      .in('id', [...latestByPlayer.keys()])
      .eq('role', 'player');
    if (profilesError) throw profilesError;

    return (profiles as SpinVaultProfile[])
      .flatMap((profile) => {
        const latestMessage = latestByPlayer.get(profile.id);
        return latestMessage ? [{ profile, latestMessage }] : [];
      })
      .sort(
        (first, second) =>
          Date.parse(second.latestMessage.created_at) - Date.parse(first.latestMessage.created_at)
      );
  }

  findAdmin(): Promise<SpinVaultProfile> {
    return this.findAdminProfile();
  }

  async processRequest(
    messageId: string,
    action: 'approve' | 'deny' | 'loaded' | 'cashout_sent'
  ): Promise<SpinVaultMessage> {
    const { data, error } = await this.client.rpc('process_spinvault_request', {
      request_id: messageId,
      action
    });
    if (error) throw error;
    const result = data as { request: SpinVaultMessage; confirmation: SpinVaultMessage };
    return result.request;
  }

  async uploadChatImage(receiverId: string, file: File): Promise<SpinVaultMessage> {
    this.validateImage(file);
    const identity = this.requireIdentity();
    const extension = file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'img';
    const path = `${identity.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await this.client.storage
      .from('chat-attachments')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    let message: SpinVaultMessage;
    try {
      message = await this.sendMessage(receiverId, 'Shared an image', null, null, {
        path,
        name: file.name
      });
    } catch (error) {
      const { error: cleanupError } = await this.client.storage.from('chat-attachments').remove([path]);
      if (cleanupError) {
        const original = this.errorMessage(error);
        throw new Error(`${original} The uploaded image could not be cleaned up: ${cleanupError.message}`);
      }
      throw error;
    }
    return this.resolveMessageAttachment(message);
  }

  async loadPaymentMethods(adminView = false): Promise<SpinVaultPaymentMethod[]> {
    let query = this.client
      .from('payment_methods')
      .select('id,name,instructions,qr_code_path,enabled,sort_order')
      .order('sort_order')
      .order('name');
    if (!adminView) query = query.eq('enabled', true);
    const { data, error } = await query;
    if (error) throw error;
    return Promise.all(
      (data as SpinVaultPaymentMethod[]).map(async (method) => ({
        ...method,
        qr_code_url: method.qr_code_path
          ? await this.signedUrl('payment-qr', method.qr_code_path)
          : null
      }))
    );
  }

  async savePaymentMethod(
    input: Pick<SpinVaultPaymentMethod, 'name' | 'instructions' | 'enabled' | 'sort_order'> & {
      id?: string;
      qrFile?: File | null;
    }
  ): Promise<void> {
    const identity = this.requireIdentity();
    if (identity.role !== 'admin') throw new Error('Only admins can manage payment methods.');
    if (input.qrFile) this.validateImage(input.qrFile, false);
    const current = input.id
      ? (await this.client.from('payment_methods').select('qr_code_path').eq('id', input.id).single())
      : { data: null, error: null };
    if (current.error) throw current.error;

    let qrPath = current.data?.qr_code_path ?? null;
    let uploadedPath: string | null = null;
    if (input.qrFile) {
      const extension = input.qrFile.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'img';
      uploadedPath = `${identity.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await this.client.storage.from('payment-qr').upload(uploadedPath, input.qrFile, {
        contentType: input.qrFile.type,
        upsert: false
      });
      if (error) throw error;
      qrPath = uploadedPath;
    }

    const method = {
      ...(input.id ? { id: input.id } : {}),
      name: input.name.trim(),
      instructions: input.instructions.trim(),
      qr_code_path: qrPath,
      enabled: input.enabled,
      sort_order: input.sort_order
    };
    const { error } = await this.client.from('payment_methods').upsert(method).select('id').single();
    if (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await this.client.storage.from('payment-qr').remove([uploadedPath]);
        if (cleanupError) {
          throw new Error(`${error.message} The uploaded QR image could not be cleaned up: ${cleanupError.message}`);
        }
      }
      throw error;
    }
    if (uploadedPath && current.data?.qr_code_path) {
      const { error: cleanupError } = await this.client.storage
        .from('payment-qr')
        .remove([current.data.qr_code_path]);
      if (cleanupError) throw cleanupError;
    }
  }

  subscribeToMessages(
    onMessage: (message: SpinVaultMessage) => void,
    onError: (message: string) => void
  ): () => void {
    const channel: RealtimeChannel = this.client
      .channel(`spinvault-chat-${this.requireIdentity().id}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) =>
        onMessage(payload.new as SpinVaultMessage)
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) =>
        onMessage(payload.new as SpinVaultMessage)
      )
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          const message =
            error?.message ?? 'Unable to connect to the live chat. Check Supabase Realtime configuration.';
          this.profileErrorSubject.next(message);
          onError(message);
        }
      });

    return () => {
      void this.client.removeChannel(channel);
    };
  }

  private async findAdminProfile(): Promise<SpinVaultProfile> {
    this.requireIdentity();
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,role')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No SpinVault admin account is configured yet.');
    return data as SpinVaultProfile;
  }

  private async loadProfile(user: User): Promise<void> {
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,role')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    this.identitySubject.next({
      ...(data as SpinVaultProfile),
      email: user.email ?? ''
    });
    this.profileErrorSubject.next(null);
  }

  private async resolveMessageAttachments(messages: SpinVaultMessage[]): Promise<SpinVaultMessage[]> {
    return Promise.all(messages.map((message) => this.resolveMessageAttachment(message)));
  }

  async resolveMessageAttachment(message: SpinVaultMessage): Promise<SpinVaultMessage> {
    return {
      ...message,
      attachment_url: message.attachment_path
        ? await this.signedUrl('chat-attachments', message.attachment_path)
        : null
    };
  }

  private async signedUrl(bucket: string, path: string): Promise<string> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }

  private validateImage(file: File, allowGif = true): void {
    const allowedTypes = allowGif
      ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      : ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Choose a ${allowGif ? 'JPEG, PNG, WebP, or GIF' : 'JPEG, PNG, or WebP'} image.`);
    }
    if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
  }

  private requireIdentity(): SpinVaultIdentity {
    const identity = this.identitySubject.value;
    if (!identity) throw new Error('Sign in to use SpinVault chat.');
    return identity;
  }

  private get client(): SupabaseClient {
    if (!this.isConfigured) {
      throw new Error('Supabase is not configured. Set supabaseUrl and supabaseAnonKey in the environment files.');
    }
    if (!this.clientInstance) {
      this.clientInstance = createClient(environment.supabaseUrl, environment.supabaseAnonKey);
    }
    return this.clientInstance;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to load your SpinVault profile.';
  }
}
