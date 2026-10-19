import { Injectable } from '@angular/core';
import { BehaviorSubject, interval, Subscription } from 'rxjs';
import { createClient, RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export class PinAuthError extends Error {
  constructor(
    message: string,
    readonly remainingAttempts: number,
    readonly retryAfterSeconds: number
  ) {
    super(message);
    this.name = 'PinAuthError';
  }
}

export interface SpinVaultProfile {
  id: string;
  username: string;
  role: 'player' | 'admin';
  custom_username?: string | null;
  admin_status?: 'none' | 'pending' | 'approved' | 'rejected';
  admin_requested_at?: string | null;
  is_super_admin?: boolean;
  last_seen?: string | null;
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
  request_status: 'pending' | 'approved' | 'denied' | 'loaded' | 'cashout_sent' | 'verification_required' | null;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_url?: string | null;
  created_at: string;
  delivery_status?: 'pending' | 'sent' | 'failed';
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

export interface SpinVaultAuditLog {
  id: string;
  user_id: string | null;
  username: string | null;
  event_type: 'login_failed' | 'system_error';
  error_message: string;
  created_at: string;
}

export interface SpinVaultAnnouncement {
  id: boolean;
  body: string;
  updated_by: string;
  updated_at: string;
}

@Injectable({ providedIn: 'root' })
export class SpinVaultService {
  private readonly identitySubject = new BehaviorSubject<SpinVaultIdentity | null>(null);
  private readonly profileErrorSubject = new BehaviorSubject<string | null>(null);
  private clientInstance: SupabaseClient | null = null;
  private heartbeatSubscription: Subscription | null = null;
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
    if (data.session) {
      await this.loadProfile(data.session.user);
      this.startHeartbeat();
    }
    this.client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        this.stopHeartbeat();
        this.identitySubject.next(null);
        this.profileErrorSubject.next(null);
        return;
      }
      setTimeout(() => {
        void this.loadProfile(session.user)
          .then(() => this.startHeartbeat())
          .catch((error: unknown) => this.profileErrorSubject.next(this.errorMessage(error)));
      }, 0);
    });
    this.initialized = true;
  }

  async signInWithPin(username: string, pin: string): Promise<void> {
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_-]{3,32}$/.test(normalizedUsername)) {
      throw new Error('Enter a username with 3-32 letters, numbers, underscores, or hyphens.');
    }
    if (!/^[a-zA-Z0-9]{6,32}$/.test(pin)) {
      throw new Error('PINs must contain 6-32 letters or numbers.');
    }
    const { data: validationData, error: validationError } = await this.client.rpc('login_with_pin', {
      p_username: normalizedUsername,
      p_pin: pin
    });
    if (validationError) throw validationError;
    const authResult = validationData as {
      success: boolean;
      remaining_attempts: number;
      retry_after_seconds: number;
    };
    if (!authResult.success) {
      const detail = authResult.retry_after_seconds > 0
        ? `Too many failed attempts. Try again in ${Math.ceil(authResult.retry_after_seconds / 60)} minute(s).`
        : `Incorrect username or PIN. ${authResult.remaining_attempts} attempt(s) remaining before a 10-minute lockout.`;
      throw new PinAuthError(detail, authResult.remaining_attempts, authResult.retry_after_seconds);
    }

    const { data: authData, error } = await this.client.auth.signInWithPassword({
      email: `${normalizedUsername}@spinvault.local`,
      password: pin
    });
    if (error) throw error;
    if (!authData.user) throw new Error('Sign-in succeeded without a user account.');
    await this.loadProfile(authData.user);
    this.startHeartbeat();
  }

  async recoverLoginPin(username: string, recoveryPin: string, newPin: string): Promise<void> {
    const { error } = await this.client.functions.invoke('recover-spinvault-pin', {
      body: { username, recoveryPin, newPin }
    });
    if (error) throw error;
  }

  async setRecoveryPin(recoveryPin: string): Promise<void> {
    this.requireIdentity();
    const { error } = await this.client.rpc('set_recovery_pin', {
      p_recovery_pin: recoveryPin
    });
    if (error) throw error;
  }

  async setPinnedAnnouncement(body: string): Promise<void> {
    const identity = this.requireAdmin();
    const value = body.trim();
    if (!value || value.length > 500) throw new Error('Announcement must be 1–500 characters.');
    const { error } = await this.client.from('spinvault_announcements').upsert({
      id: true,
      body: value,
      updated_by: identity.id,
      updated_at: new Date().toISOString()
    });
    if (error) throw error;
  }

  async clearPinnedAnnouncement(): Promise<void> {
    this.requireAdmin();
    const { error } = await this.client.from('spinvault_announcements').delete().eq('id', true);
    if (error) throw error;
  }

  async loadPinnedAnnouncement(): Promise<SpinVaultAnnouncement | null> {
    this.requireIdentity();
    const { data, error } = await this.client
      .from('spinvault_announcements')
      .select('id,body,updated_by,updated_at')
      .eq('id', true)
      .maybeSingle();
    if (error) throw error;
    return data as SpinVaultAnnouncement | null;
  }

  subscribeToPinnedAnnouncement(
    onAnnouncement: (announcement: SpinVaultAnnouncement | null) => void,
    onError: (message: string) => void
  ): () => void {
    this.requireIdentity();
    const channel = this.client
      .channel('spinvault-pinned-announcement')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spinvault_announcements' }, (payload) => {
        onAnnouncement(payload.eventType === 'DELETE' ? null : payload.new as SpinVaultAnnouncement);
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError(error?.message ?? 'Could not reconnect to pinned chat announcements.');
        }
      });
    return () => { void this.client.removeChannel(channel); };
  }

  subscribeToTyping(
    otherUserId: string,
    onTyping: (typing: boolean) => void,
    onError: (message: string) => void
  ): { setTyping: (typing: boolean) => void; unsubscribe: () => void } {
    const identity = this.requireIdentity();
    const participantIds = [identity.id, otherUserId].sort();
    const channel = this.client
      .channel(`spinvault-typing-${participantIds.join('-')}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload['user_id'] === otherUserId && typeof payload['typing'] === 'boolean') {
          onTyping(payload['typing']);
        }
      })
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError(error?.message ?? 'Typing indicators are temporarily unavailable.');
        }
      });
    return {
      setTyping: (typing: boolean) => {
        void channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { user_id: identity.id, typing }
        });
      },
      unsubscribe: () => { void this.client.removeChannel(channel); }
    };
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
    this.startHeartbeat();
    return true;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.stopHeartbeat();
    this.identitySubject.next(null);
  }

  async logSystemError(error: unknown): Promise<void> {
    const identity = this.currentIdentity;
    if (!identity) return;
    const detail = this.errorMessage(error).slice(0, 1000);
    const { error: insertError } = await this.client.from('system_audit_logs').insert({
      user_id: identity.id,
      username: identity.custom_username ?? identity.username,
      event_type: 'system_error',
      error_message: detail
    });
    if (insertError) throw insertError;
  }

  async loadPlayerProfiles(): Promise<SpinVaultProfile[]> {
    this.requireAdmin();
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,role,custom_username,admin_status,admin_requested_at,is_super_admin')
      .eq('role', 'player')
      .order('username');
    if (error) throw error;
    return data as SpinVaultProfile[];
  }

  async upsertPlayerCredentials(
    targetUserId: string | null,
    username: string,
    pin: string
  ): Promise<{ id: string; username: string }> {
    this.requireAdmin();
    const { data, error } = targetUserId
      ? await this.client.rpc('admin_upsert_player_credentials', {
          p_target_user_id: targetUserId,
          p_new_username: username,
          p_new_pin: pin
        })
      : await this.client.rpc('admin_upsert_player', {
          p_new_username: username,
          p_new_pin: pin
        });
    if (error) throw error;
    return data as { id: string; username: string };
  }

  async loadAdminRequests(): Promise<SpinVaultProfile[]> {
    this.requireSuperAdmin();
    const { data, error } = await this.client
      .from('profiles')
      .select('id,username,role,custom_username,admin_status,admin_requested_at,is_super_admin')
      .eq('admin_status', 'pending')
      .order('admin_requested_at', { ascending: true });
    if (error) throw error;
    return data as SpinVaultProfile[];
  }

  async reviewAdminRequest(userId: string, approve: boolean): Promise<void> {
    this.requireSuperAdmin();
    const { error } = await this.client.rpc('review_admin_request', {
      p_target_user_id: userId,
      p_approve: approve
    });
    if (error) throw error;
  }

  async requestAdminElevation(): Promise<void> {
    this.requireIdentity();
    const { error } = await this.client.rpc('request_admin_elevation');
    if (error) throw error;
    const identity = this.currentIdentity;
    if (identity) {
      this.identitySubject.next({ ...identity, admin_status: 'pending', admin_requested_at: new Date().toISOString() });
    }
  }

  async loadActiveUsers(): Promise<SpinVaultProfile[]> {
    this.requireSuperAdmin();
    const { data, error } = await this.client.rpc('get_super_admin_telemetry');
    if (error) throw error;
    return data as SpinVaultProfile[];
  }

  async loadAuditLogs(): Promise<SpinVaultAuditLog[]> {
    this.requireAdmin();
    const { data, error } = await this.client
      .from('system_audit_logs')
      .select('id,user_id,username,event_type,error_message,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return data as SpinVaultAuditLog[];
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
    action: 'approve' | 'deny' | 'loaded' | 'cashout_sent' | 'verification_required'
  ): Promise<SpinVaultMessage> {
    const { data, error } = await this.client.rpc('process_spinvault_request', {
      request_id: messageId,
      action
    });
    if (error) throw error;
    const result = data as { request: SpinVaultMessage; confirmation: SpinVaultMessage };
    return result.request;
  }

  async uploadChatImage(receiverId: string, file: File, zoom = 1): Promise<SpinVaultMessage> {
    this.validateImage(file);
    const identity = this.requireIdentity();
    const compressedFile = await this.cropAndCompressImage(file, zoom);
    const extension = 'jpg';
    const path = `${identity.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await this.client.storage
      .from('chat-attachments')
      .upload(path, compressedFile, { contentType: compressedFile.type, upsert: false });
    if (uploadError) throw uploadError;
    let message: SpinVaultMessage;
    try {
      message = await this.sendMessage(receiverId, 'Shared an image', null, null, {
        path,
        name: file.name.replace(/\.[^.]+$/, '') + '.jpg'
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

  private async cropAndCompressImage(file: File, zoom: number): Promise<File> {
    const bitmap = await createImageBitmap(file);
    try {
      const boundedZoom = Math.min(1.5, Math.max(1, zoom));
      const cropSize = Math.min(bitmap.width, bitmap.height) / boundedZoom;
      const sourceX = (bitmap.width - cropSize) / 2;
      const sourceY = (bitmap.height - cropSize) / 2;
      const outputSize = Math.min(1600, Math.round(cropSize));
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Your browser could not prepare this image for upload.');
      context.drawImage(bitmap, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error('Your image could not be compressed.')),
          'image/jpeg',
          0.82
        );
      });
      return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
    } finally {
      bitmap.close();
    }
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

  subscribeToAdminSignals(onChange: () => void, onError: (message: string) => void): () => void {
    this.requireAdmin();
    const channel = this.client
      .channel(`spinvault-admin-signals-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onChange)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_audit_logs' }, onChange)
      .subscribe((status, error) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          onError(error?.message ?? 'Unable to connect to live admin telemetry.');
        }
      });
    return () => { void this.client.removeChannel(channel); };
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
      .select('id,username,role,custom_username,admin_status,admin_requested_at,is_super_admin')
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

  private requireAdmin(): SpinVaultIdentity {
    const identity = this.requireIdentity();
    if (identity.role !== 'admin' && !identity.is_super_admin) {
      throw new Error('Only admins can access this feature.');
    }
    return identity;
  }

  private requireSuperAdmin(): SpinVaultIdentity {
    const identity = this.requireIdentity();
    if (!identity.is_super_admin) throw new Error('Only a super admin can access this feature.');
    return identity;
  }

  private startHeartbeat(): void {
    if (this.heartbeatSubscription) return;
    const sendHeartbeat = async (): Promise<void> => {
      const { data, error: sessionError } = await this.client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!data.session) return;
      const { error } = await this.client.rpc('update_user_heartbeat');
      if (error) throw error;
    };
    void sendHeartbeat().catch((error: unknown) => this.profileErrorSubject.next(this.errorMessage(error)));
    this.heartbeatSubscription = interval(60_000).subscribe(() => {
      void sendHeartbeat().catch((error: unknown) => this.profileErrorSubject.next(this.errorMessage(error)));
    });
  }

  private stopHeartbeat(): void {
    this.heartbeatSubscription?.unsubscribe();
    this.heartbeatSubscription = null;
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
