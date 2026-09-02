export type Role = 'operator' | 'node';
export type AuthMode = 'token' | 'password';
export type Phase = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'pairing-required' | 'auth-error' | 'incompatible' | 'error';
export type Failure = { code: string; message: string; requestId?: string };
export type LinkState = {
  phase: Phase;
  failure?: Failure;
  serverVersion?: string;
  protocol?: number;
  grantedScopes?: string[];
  connectedAt?: number;
};
export type ConnectionProfile = { url: string; authMode: AuthMode; tlsFingerprint?: string };
export type ConnectionInput = ConnectionProfile & { credential?: string };
export type GatewayState = {
  revision: number;
  profile: ConnectionProfile | null;
  hasCredential: boolean;
  deviceId: string | null;
  operator: LinkState;
  node: LinkState;
  nodeCommands: string[];
  requestedScopes: string[];
  appVersion: string;
  nodeVersion: string;
};
export type ChatSession = { key: string; title: string; agentId?: string };
export type ChatMessage = { role: string; text: string };
export type WorkspaceState = {
  revision: number; loading: boolean; agents: { id: string; name: string }[]; agentId: string;
  sessions: ChatSession[]; selected: string | null; messages: ChatMessage[];
  activeRun: string | null; stream: string; tool: string | null; hasMore: boolean; error: Failure | null;
};
export type MemoryFile = { agentId: string; content: string; hash: string; missing: boolean };
export type MemoryHealth = { provider: string | null; checked: boolean; ready: boolean; error: string | null };
export type MemorySearch = { text: string; semantic: boolean | null };
export type UpdateState = {
  revision: number; phase: 'idle' | 'checking' | 'available' | 'current' | 'downloading' | 'installing' | 'error' | 'development';
  currentVersion: string; version?: string; percent?: number; error?: string;
};
export type Result<T> = { ok: true; value: T } | { ok: false; error: Failure };
export type WindowAction = 'minimize' | 'maximize' | 'close' | 'quit';
export type MenuId = 'file' | 'edit' | 'view' | 'help';
export type PincerApi = {
  platform: string;
  chat: {
    snapshot(): Promise<WorkspaceState>;
    refresh(): Promise<Result<void>>;
    select(key: string): Promise<Result<void>>;
    create(agentId: string): Promise<Result<void>>;
    send(message: string, idempotencyKey: string): Promise<Result<void>>;
    abort(): Promise<Result<void>>;
    more(): Promise<Result<void>>;
    onState(listener: (state: WorkspaceState) => void): () => void;
  };
  memory: {
    read(agentId: string): Promise<Result<MemoryFile>>;
    save(agentId: string, content: string, hash: string): Promise<Result<MemoryFile>>;
    status(agentId: string, probe: boolean): Promise<Result<MemoryHealth>>;
    search(agentId: string, query: string): Promise<Result<MemorySearch>>;
  };
  updates: {
    snapshot(): Promise<UpdateState>;
    check(): Promise<void>;
    install(): Promise<void>;
    onState(listener: (state: UpdateState) => void): () => void;
  };
  gateway: {
    snapshot(): Promise<GatewayState>;
    connect(input: ConnectionInput): Promise<Result<GatewayState>>;
    disconnect(): Promise<GatewayState>;
    retry(): Promise<Result<GatewayState>>;
    onState(listener: (state: GatewayState) => void): () => void;
  };
  window: {
    action(action: WindowAction): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximized(listener: (maximized: boolean) => void): () => void;
    showMenu(menu: MenuId): Promise<void>;
  };
};
