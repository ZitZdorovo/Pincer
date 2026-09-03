import type { ModelInfo } from '../../shared/contract';
export type RuntimeProviderOption = { runtimeProviderKey: string; label: string; configuredModelId?: string };
export type ProviderView = RuntimeProviderOption & { models: ModelInfo[] };
export const splitModelRef = (value?: string | null) => { const index = value?.indexOf('/') ?? -1; return value && index > 0 ? { providerKey: value.slice(0, index), modelId: value.slice(index + 1) } : null; };
export const buildRuntimeProviderOptions = (accounts: ProviderView[], _statuses: unknown, _vendors: unknown, _default: unknown): RuntimeProviderOption[] => accounts;
export const buildGatewayModelOptions = (models: ModelInfo[]) => models.map((model) => ({ modelRef: model.id, label: model.name, runtimeProviderKey: model.provider || splitModelRef(model.id)?.providerKey || '' }));
export const buildConfiguredModelOptions = (accounts: ProviderView[], _statuses: unknown, _vendors: unknown, _default: unknown) => buildGatewayModelOptions(accounts.flatMap((provider) => provider.models));
