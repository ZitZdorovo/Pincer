import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ChatAttachment, WorkspaceState } from '../../shared/contract';
import { usePreferences } from '../preferences';
import { groupConfiguredModels, parseModelVariant, resolveModelDisplayName, resolveGroupVariant, availableThinkingLevels, thinkingLevelLabel, type ConfiguredModelGroup } from './model-display';

export type ComposerProps = {
  input: string; setInput(value: string): void; files: ChatAttachment[]; attach(files: File[]): void; removeFile(index: number): void;
  send(): void; stop(): void; disabled: boolean; sending: boolean; state: WorkspaceState | null;
  agentId: string; targetAgentId?: string; onAgent(id: string | null): void; onModel(id: string, thinking?: string): Promise<void>;
  workspacePath: string; onWorkspace(path: string): void;
};
export type AgentSummary = { id: string; name: string; modelDisplay?: string };
export type QuickAccessSkill = { name: string; source: string; sourceLabel: string; description: string };
export type FileAttachment = { id: string; fileName: string; mimeType: string; fileSize: number; preview: string | null; status: 'ready' | 'staging' | 'error' };
export type ModelGroup = ConfiguredModelGroup;
type Preset = { id: string; name: string; modelRef: string; thinkingLevel: string };
function readAliases(): Record<string, string> {
  try { const value: unknown = JSON.parse(localStorage.getItem('pincer.model-aliases') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, name]) => typeof name === 'string')) : {}; } catch { return {}; }
}
function readPresets(): Preset[] {
  try { const value: unknown = JSON.parse(localStorage.getItem('pincer.model-presets') || '[]'); return Array.isArray(value) ? value.filter((p): p is Preset => p && ['id', 'name', 'modelRef', 'thinkingLevel'].every((key) => typeof p[key] === 'string')).slice(0,100) : []; } catch { return []; }
}
export function useComposer(props: ComposerProps) {
  const { t } = useTranslation('chat'); const prefs = usePreferences();
  const textareaRef = useRef<HTMLTextAreaElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null); const skillPickerRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null); const thinkingPickerRef = useRef<HTMLDivElement>(null); const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false); const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false); const [thinkingPickerOpen, setThinkingPickerOpen] = useState(false); const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState(''); const [skills, setSkills] = useState<QuickAccessSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false); const [skillsError, setSkillsError] = useState('');
  const [switchingModelRef, setSwitchingModelRef] = useState('');
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingModelKey, setEditingModelKey] = useState<string | null>(null); const [editingModelName, setEditingModelName] = useState('');
  const [modelAliases, setAliases] = useState(readAliases); const [modelPresets, setPresets] = useState(readPresets);
  const currentAgent = props.state?.agents.find((agent) => agent.id === props.agentId);
  const currentAgentName = currentAgent?.name || props.agentId || 'main';
  const modelOptions = (props.state?.models || []).map((model) => ({ modelRef: model.id, label: model.name }));
  const providerKey = (id: string) => props.state?.models.find((model) => model.id === id)?.provider || id.split('/')[0];
  const modelGroups = [...new Set(modelOptions.map((model) => providerKey(model.modelRef)))].flatMap((provider) => groupConfiguredModels(modelOptions.filter((model) => providerKey(model.modelRef) === provider)).map((group) => ({ ...group, baseKey: `${provider}::${group.baseKey}` })));
  const effectiveModelRef = props.state?.model || '';
  const parsedVariant = parseModelVariant(effectiveModelRef);
  const effectiveModelVariant = { ...parsedVariant, baseKey: `${providerKey(effectiveModelRef)}::${parsedVariant.baseKey}` };
  const currentModelGroup = modelGroups.find((group) => group.baseKey === effectiveModelVariant.baseKey);
  const variantLevels = availableThinkingLevels(currentModelGroup ?? null);
  const thinkingLevels = variantLevels.length > 1 ? variantLevels : props.state?.thinkingOptions?.length ? props.state.thinkingOptions : currentAgent?.thinkingOptions?.length ? currentAgent.thinkingOptions : props.state?.models.find((model) => model.id === effectiveModelRef)?.reasoning ? ['off', 'minimal', 'low', 'medium', 'high'] : variantLevels;
  const currentThinkingLevel = variantLevels.length > 1 ? effectiveModelVariant.level : props.state?.thinking || effectiveModelVariant.level;
  const currentModelLabel = effectiveModelRef ? resolveModelDisplayName(effectiveModelRef, modelAliases[effectiveModelVariant.baseKey] || modelAliases[effectiveModelRef], modelOptions.find((option) => option.modelRef === effectiveModelRef)?.label) : t('composer.pickModel');
  const close = () => { setPickerOpen(false); setSkillPickerOpen(false); setModelPickerOpen(false); setThinkingPickerOpen(false); setWorkspaceMenuOpen(false); };
  useEffect(() => {
    const dismiss = (event: globalThis.PointerEvent) => {
      if ([pickerRef, skillPickerRef, modelPickerRef, thinkingPickerRef, workspaceMenuRef].some((ref) => ref.current?.contains(event.target as Node))) return;
      close();
    };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } };
    window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => { close(); }, [props.state?.selected, props.state?.scope]);
  useEffect(() => { const el = textareaRef.current; if (el) { el.style.height = '48px'; el.style.height = Math.min(240, el.scrollHeight) + 'px'; } }, [props.input]);
  useEffect(() => { localStorage.setItem('pincer.model-aliases', JSON.stringify(modelAliases)); }, [modelAliases]);
  useEffect(() => { localStorage.setItem('pincer.model-presets', JSON.stringify(modelPresets)); }, [modelPresets]);
  useEffect(() => {
    if (!skillPickerOpen || !props.agentId || props.disabled) return;
    let current = true; setSkillsLoading(true); setSkillsError('');
    void window.pincer.management.list('skills', props.agentId).then((result) => {
      if (!current) return;
      if (!result.ok) { setSkillsError(result.error.message); return; }
      const rows = Array.isArray(result.value.skills) ? result.value.skills : [];
      setSkills(rows.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object')).filter((row) => row.disabled !== true && row.enabled !== false && row.eligible !== false).map((row) => ({ name: String(row.name || row.skillKey || ''), source: String(row.source || ''), sourceLabel: String(row.source || 'Gateway'), description: String(row.description || '') })).filter((skill) => skill.name.length > 0));
    }).catch((error) => { if (current) setSkillsError(String(error)); }).finally(() => { if (current) setSkillsLoading(false); });
    return () => { current = false; };
  }, [skillPickerOpen, props.agentId, props.disabled]);
  const chooseModel = async (modelRef: string, thinking?: string) => {
    setSwitchingModelRef(modelRef);
    try { await props.onModel(modelRef, thinking); setModelPickerOpen(false); setThinkingPickerOpen(false); } finally { setSwitchingModelRef(''); }
  };
  const displayThinkingLevel = (level: string) => thinkingLevelLabel(level as Parameters<typeof thinkingLevelLabel>[0]);
  const handleSelectWorkspace = (path: string) => { props.onWorkspace(path); setWorkspaceMenuOpen(false); };
  return {
    t, input: props.input, setInput: props.setInput, sending: props.sending, inputDisabled: props.disabled,
    textareaRef, fileRef, pickerRef, skillPickerRef, modelPickerRef, thinkingPickerRef, workspaceMenuRef, isComposingRef,
    pickerOpen, setPickerOpen, skillPickerOpen, setSkillPickerOpen, modelPickerOpen, setModelPickerOpen, thinkingPickerOpen, setThinkingPickerOpen, workspaceMenuOpen, setWorkspaceMenuOpen,
    skillQuery, setSkillQuery, skillsLoading, skillsError, filteredQuickSkills: skills.filter((skill) => (skill.name + ' ' + skill.description).toLowerCase().includes(skillQuery.toLowerCase())),
    currentAgent, currentAgentName, targetAgentId: props.targetAgentId, selectedTarget: props.state?.agents.find((agent) => agent.id === props.targetAgentId) || null,
    setTargetAgentId: props.onAgent, mentionableAgents: (props.state?.agents || []).filter((agent) => agent.id !== props.agentId), showAgentPicker: (props.state?.agents.length || 0) > 1,
    selectedSkill: null, setSelectedSkill: (_value: null) => {},
    modelOptions, modelGroups, effectiveModelRef, effectiveModelVariant, currentModelGroup, currentModelLabel, switchingModelRef,
    currentThinkingLevel, thinkingLevels, displayThinkingLevel, showModelPicker: modelGroups.length > 0, showThinkingPicker: thinkingLevels.length > 0,
    modelPresets, modelAliases, editingPresetId, setEditingPresetId, editingModelKey, setEditingModelKey, editingModelName,
    renameModelPreset: (id: string, name: string) => setPresets((all) => all.map((p) => p.id === id ? { ...p, name } : p)),
    deleteModelPreset: (id: string) => setPresets((all) => all.filter((p) => p.id !== id)),
    handleCreatePreset: () => { if (!effectiveModelRef) return; setPresets((all) => [...all, { id: crypto.randomUUID(), name: currentModelLabel, modelRef: effectiveModelRef, thinkingLevel: currentThinkingLevel }]); },
    handleSelectPreset: (preset: Preset) => void chooseModel(preset.modelRef, preset.thinkingLevel || undefined),
    startEditingModelName: (group: ModelGroup) => { setEditingModelKey(group.baseKey); setEditingModelName(resolveModelDisplayName(group.original.modelRef, modelAliases[group.baseKey], group.original.label)); },
    finishEditingModelName: (name: string) => { if (editingModelKey) setAliases((all) => ({ ...all, [editingModelKey]: name })); setEditingModelKey(null); },
    resetModelAlias: (id: string) => setAliases((all) => { const next = { ...all }; delete next[id]; return next; }),
    handleSelectModelGroup: (group: ModelGroup) => void chooseModel(resolveGroupVariant(group, currentThinkingLevel).modelRef),
    handleSelectThinkingLevel: async (level: string) => { if (variantLevels.length > 1 && currentModelGroup) { await chooseModel(resolveGroupVariant(currentModelGroup, level).modelRef); return; } if (effectiveModelRef) { await chooseModel(effectiveModelRef, level); return; } const result = await window.pincer.chat.setThinking(level); if (!result.ok) toast.error(result.error.message); else setThinkingPickerOpen(false); },
    attachments: props.files.map((file, index): FileAttachment => ({ id: String(index), fileName: file.fileName, mimeType: file.mimeType, fileSize: Math.floor(file.content.length * 0.75), preview: file.mimeType.startsWith('image/') ? `data:${file.mimeType};base64,${file.content}` : null, status: 'ready' })),
    removeAttachment: (id: string) => props.removeFile(Number(id)), pickFiles: () => fileRef.current?.click(),
    handleInputChange: props.setInput,
    handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => { const submit = prefs.sendShortcut === 'ctrl-enter' ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey; if (event.key === 'Enter' && submit && !event.shiftKey && !event.nativeEvent.isComposing && !isComposingRef.current) { event.preventDefault(); props.send(); } },
    handlePaste: (event: ClipboardEvent<HTMLTextAreaElement>) => { const files = Array.from(event.clipboardData.files); if (files.length) { event.preventDefault(); props.attach(files); } },
    canSubmit: !props.disabled && !props.sending && Boolean(props.input.trim() || props.files.length), canStop: !props.disabled && props.sending,
    handleSend: props.send, handleStop: props.stop,
    workspaceLabel: props.workspacePath ? props.workspacePath.split(/[\\/]/).filter(Boolean).at(-1) || props.workspacePath : t('composer.defaultWorkspaceOption'),
    workspacePath: props.workspacePath || '@gateway-default', workspaceSelectorDisabled: Boolean(props.state?.selected),
    workspaceOptions: (props.state?.projects || []).map((project) => ({ path: project.path, label: project.name })),
    handleWorkspaceKeyDown: (event: KeyboardEvent) => { if (event.key === 'Escape') setWorkspaceMenuOpen(false); },
    handleWorkspaceButtonClick: () => { setPickerOpen(false); setSkillPickerOpen(false); setModelPickerOpen(false); setThinkingPickerOpen(false); setWorkspaceMenuOpen((open) => !open); },
    handleSelectDefaultWorkspace: () => handleSelectWorkspace(''), handleSelectWorkspace,
    handleChooseOtherWorkspace: () => { setWorkspaceMenuOpen(false); return true; },
  };
}
