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
export type ChatSession = { key: string; title: string; agentId?: string; pinned?: boolean; updatedAt?: number; model?: string; cwd?: string; activeRunId?: string; runStartedAt?: number; runPhase?: RunPhase };
export type Project = { id: string; name: string; path: string };
export type ChatLocation = { projectId?: string; cwd?: string };
export type ModelInfo = { id: string; name: string; provider: string; contextWindow?: number; reasoning?: boolean };
export type MessageFile = { name: string; mimeType: string; imageData?: string };
export type PermissionMode = 'read-only' | 'guarded' | 'workspace' | 'full';
export type TokenUsage = { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; totalTokens?: number };
export type ToolCall = { id: string; name: string; input: string; output: string; status: 'running' | 'completed' | 'failed' };
export type ActivityBlock = { kind: 'text'; text: string } | { kind: 'tool'; toolId: string } | { kind: 'compaction'; id: string; phase: 'running' | 'completed' | 'failed' };
export type ChatMessage = { role: string; text: string; files?: MessageFile[]; tools?: ToolCall[]; activity?: ActivityBlock[]; usage?: TokenUsage; model?: string; timestamp?: number; durationMs?: number; turnKey?: string; runId?: string };
export type RunPhase = 'starting' | 'responding' | 'working';
export type ChatAttachment = { fileName: string; mimeType: string; content: string };
export type WorkspaceState = {
  scope: string;
  revision: number; loading: boolean; agents: { id: string; name: string; thinkingOptions?: string[] }[]; agentId: string;
  sessions: ChatSession[]; selected: string | null; messages: ChatMessage[];
  activeRun: string | null; stream: string; tool: string | null; hasMore: boolean; error: Failure | null;
  models: ModelInfo[]; model: string | null; thinking: string | null;
  projects: Project[]; projectError: string | null;
  permissionMode?: PermissionMode | null; effectivePermissionMode?: PermissionMode;
  thinkingOptions?: string[]; spawnDepth?: number;
  runStartedAt?: number; runPhase?: RunPhase; liveTools?: ToolCall[]; contextTokens?: number; contextWindow?: number;
  liveActivity?: ActivityBlock[];
  compaction?: { id: string; phase: 'running' | 'completed' | 'failed' };
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
  settings: import('./settings').GatewaySettingsApi;
  gatewayAdmin: import('./gateway-admin').GatewayAdminApi;
  approvals: import('./approvals').ApprovalsApi;
  configuration: import('./configuration').ConfigurationApi;
  drafts: { read(scope: string): Promise<Result<Record<string, string>>>; write(scope: string, key: string, text: string): Promise<Result<void>> };
  files: import('./files').FilesApi;
  management: import('./management').ManagementApi;
  platform: string;
  desktop: {
    chooseDirectory(): Promise<Result<string | null>>;
    startup(): Promise<{ enabled: boolean; supported: boolean }>;
    setStartup(enabled: boolean): Promise<Result<boolean>>;
  };
  chat: {
    snapshot(): Promise<WorkspaceState>;
    refresh(): Promise<Result<void>>;
    select(key: string): Promise<Result<void>>;
    create(agentId: string, location?: ChatLocation): Promise<Result<void>>;
    registerProject(name: string, path: string): Promise<Result<void>>;
    removeProject(id: string): Promise<Result<void>>;
    send(message: string, idempotencyKey: string, attachments?: ChatAttachment[], targetAgentId?: string): Promise<Result<void>>;
    setPermission(mode: PermissionMode | null): Promise<Result<void>>;
    abort(): Promise<Result<void>>;
    more(): Promise<Result<void>>;
    rename(key: string, title: string): Promise<Result<void>>;
    pin(key: string, pinned: boolean): Promise<Result<void>>;
    remove(key: string): Promise<Result<void>>;
    setModel(model: string, thinking?: string): Promise<Result<void>>;
    setThinking(thinking: string): Promise<Result<void>>;
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
