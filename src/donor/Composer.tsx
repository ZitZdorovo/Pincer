// Original OpenX composer JSX and presentation helpers; transport/state are Pincer's.
import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { SendHorizontal, Square, X, Paperclip, FileText, Film, Music, FileArchive, File, FolderOpen, Loader2, Search, ChevronDown, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog';
import { InlineNameEditor } from '../components/ui/InlineNameEditor';
import { Textarea } from '../components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { cn } from '../lib/utils';
import { resolveModelDisplayName, thinkingLevelLabel } from './model-display';
import { AccessPicker, RequestStats } from './RequestControls';
import { Approvals } from '../features/Approvals';
import { useComposer, type ComposerProps, type FileAttachment, type QuickAccessSkill } from './composer-controller';
const DIRECTORY_MIME_TYPE = 'application/x-directory';
const formatFileSize = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const getSkillPrefix = (name: string) => `/${name}  `;
const needsLeadingSkillSpace = (value: string, position: number) => position > 0 && !/\s/.test(value[position - 1] ?? '');
const isDefaultWorkspacePath = (path: string) => !path || path === '@gateway-default';
const normalizeWorkspacePath = (path: string) => path.trim();
const isConfiguredModelRefAvailable = (id: string, options: { modelRef: string }[]) => options.some((option) => option.modelRef === id);
function FileIcon({ mimeType, className }: { mimeType: string; className?: string }) {
  if (mimeType === DIRECTORY_MIME_TYPE) return <FolderOpen className={className} />;
  if (mimeType.startsWith('video/')) return <Film className={className} />;
  if (mimeType.startsWith('audio/')) return <Music className={className} />;
  if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') return <FileText className={className} />;
  if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive') || mimeType.includes('tar') || mimeType.includes('rar') || mimeType.includes('7z')) return <FileArchive className={className} />;
  if (mimeType === 'application/pdf') return <FileText className={className} />;
  return <File className={className} />;
}


export function DonorComposer(props: ComposerProps & { scrollToLatestAction?: ReactNode }) {
  const {
    t, input, setInput, sending, inputDisabled, textareaRef, fileRef, skillPickerRef, modelPickerRef, thinkingPickerRef, workspaceMenuRef, isComposingRef,
    setPickerOpen, skillPickerOpen, setSkillPickerOpen, modelPickerOpen, setModelPickerOpen, thinkingPickerOpen, setThinkingPickerOpen, workspaceMenuOpen, setWorkspaceMenuOpen,
    skillQuery, setSkillQuery, skillsLoading, skillsError, filteredQuickSkills, currentAgent, currentAgentName, selectedSkill, setSelectedSkill,
    modelOptions, modelGroups, effectiveModelRef, effectiveModelVariant, currentModelGroup, currentModelLabel, switchingModelRef, currentThinkingLevel, thinkingLevels, displayThinkingLevel, showModelPicker, showThinkingPicker,
    modelPresets, modelAliases, editingPresetId, setEditingPresetId, editingModelKey, setEditingModelKey, editingModelName, renameModelPreset, deleteModelPreset, handleCreatePreset, handleSelectPreset, startEditingModelName, finishEditingModelName, resetModelAlias, handleSelectModelGroup, handleSelectThinkingLevel,
    attachments, removeAttachment, pickFiles, handleInputChange, handleKeyDown, handlePaste, canSubmit, canStop, handleSend, handleStop, workspaceLabel, workspacePath, workspaceSelectorDisabled, workspaceOptions, handleWorkspaceKeyDown, handleWorkspaceButtonClick, handleSelectDefaultWorkspace, handleSelectWorkspace
  } = useComposer(props);
  const [dragOver, setDragOver] = useState(false);
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [workspaceDraft, setWorkspaceDraft] = useState('');
  const reduceMotion = useReducedMotion();
  const queueTray: ReactNode = null;
  const scrollToLatestAction = props.scrollToLatestAction;
  return (
    <div
      data-testid="chat-composer"
      onDragOver={(event) => { if (!inputDisabled && event.dataTransfer.types.includes('Files')) { event.preventDefault(); setDragOver(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
      onDrop={(event) => { event.preventDefault(); setDragOver(false); props.attach(Array.from(event.dataTransfer.files)); }}
        style={{ maxWidth: 'calc(var(--pincer-chat-width, 736px) + 32px)' }}
        className={cn(
          'relative mx-auto w-full shrink-0 px-4 pb-[15px] pt-[15px]',
      )}
    >
      <div className="relative z-40 mb-2 flex justify-end"><Approvals updateBusy={false} /></div>
      <input ref={fileRef} type="file" multiple hidden onChange={(event) => { props.attach(Array.from(event.target.files || [])); event.target.value = ''; }} />
      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}><DialogContent className="max-w-md rounded-2xl border border-border bg-surface-modal p-6 shadow-2xl"><DialogTitle className="text-xl font-semibold">{t('composer.chooseOtherWorkspaceOption')}</DialogTitle><DialogDescription className="mt-2 text-sm text-muted-foreground">{t('pincer.remoteWorkspace')}</DialogDescription><Input className="mt-4 font-mono" value={workspaceDraft} onChange={(event) => setWorkspaceDraft(event.target.value)} /><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setWorkspaceDialogOpen(false)}>{t('common:actions.cancel')}</Button><Button disabled={!workspaceDraft.trim()} onClick={() => { handleSelectWorkspace(workspaceDraft.trim()); setWorkspaceDialogOpen(false); }}>{t('common:actions.save')}</Button></div></DialogContent></Dialog>
      {dragOver && createPortal(
        <div
          data-testid="chat-drop-overlay"
          className="pointer-events-none fixed inset-3 z-[10000] grid place-items-center rounded-3xl border border-dashed border-primary/55 bg-background/80 text-foreground shadow-2xl backdrop-blur-sm"
        >
          <div className="flex items-center gap-3 rounded-2xl bg-surface-modal px-5 py-4 text-sm font-medium shadow-lg">
            <Paperclip className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('composer.dropOverlay')}
          </div>
        </div>,
        document.body,
      )}
      <div
        aria-hidden="true"
        data-testid="chat-composer-backdrop"
        className="pointer-events-none absolute -top-5 bottom-0 left-4 right-4 z-0"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, hsl(var(--surface-chat)) 20%, hsl(var(--surface-chat)) 100%)',
        }}
      />
      <div className="relative z-10 w-full">



        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {attachments.map((att) => (
              <AttachmentPreview
                key={att.id}
                attachment={att}
                onRemove={() => removeAttachment(att.id)}
              />
            ))}
          </div>
        )}

        {queueTray && (
          <div
            data-testid="chat-composer-queue"
            className={cn(
              'relative z-0 ml-4 -mb-[18px] max-h-[244px] overflow-y-auto rounded-xl border border-border/80 bg-surface-modal pb-[18px] shadow-sm transition-[margin] duration-200 ease-out motion-reduce:transition-none',
              scrollToLatestAction ? 'mr-[51px]' : 'mr-4',
            )}
          >
            {queueTray}
          </div>
        )}

        {/* Input Container */}
        <div
          data-testid="chat-composer-surface"
          className={`relative z-10 bg-surface-input rounded-2xl shadow-sm border px-3 pt-2.5 pb-[10px] transition-all ${dragOver ? 'border-primary ring-1 ring-primary' : 'border-black/10 dark:border-white/10'}`}
        >
          {scrollToLatestAction && (
            <div
              data-testid="chat-composer-scroll-action"
              className="absolute -top-[42px] right-0 z-20 animate-in fade-in-0 zoom-in-95 duration-200"
            >
              {scrollToLatestAction}
            </div>
          )}
          {/* Text Row — flush-left */}
          <div className="relative min-h-[48px]">

            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={() => {
                isComposingRef.current = false;
              }}
              onPaste={handlePaste}
              placeholder={inputDisabled ? t('composer.gatewayDisconnectedPlaceholder') : ''}
              disabled={inputDisabled}
              data-testid="chat-composer-input"
              className={cn(
                'relative z-10 min-h-[48px] max-h-[240px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none bg-transparent p-0 text-sm leading-relaxed placeholder:text-muted-foreground/60',
              )}
              rows={1}
            />
          </div>

          {/* Action Row — icons on their own line */}
          <div className="mt-1.5 flex items-center gap-1" data-testid="chat-composer-actions">
            {/* Attach Button */}
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 rounded-lg text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 hover:text-foreground transition-colors"
              onClick={pickFiles}
              disabled={inputDisabled}
              title={t('composer.attachFiles')}
            >
              <Paperclip className="h-3.5 w-3.5" />
            </Button>

            <AccessPicker state={props.state} disabled={inputDisabled || sending} />
            <div ref={skillPickerRef} className="relative shrink-0">
              <button
                type="button"
                data-testid="chat-composer-skill"
                className={cn(
                  'inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-meta font-medium text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50',
                  (skillPickerOpen || selectedSkill) && 'text-foreground',
                )}
                onClick={() => {
                  setPickerOpen(false);
                  setModelPickerOpen(false);
                  setThinkingPickerOpen(false);
                  setWorkspaceMenuOpen(false);
                  setSkillPickerOpen((open) => !open);
                }}
                disabled={inputDisabled || sending}
                title={t('composer.pickSkill')}
              >
                <span>{t('composer.skillButton')}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', skillPickerOpen && 'rotate-180')} />
              </button>
              {skillPickerOpen && (
                <div className="absolute left-0 bottom-full z-20 mb-2 w-80 overflow-hidden rounded-2xl border border-black/10 bg-surface-modal p-1.5 shadow-xl dark:border-white/10">
                  <div className="flex items-center gap-2 rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      value={skillQuery}
                      onChange={(event) => setSkillQuery(event.target.value)}
                      placeholder={t('composer.skillSearchPlaceholder')}
                      className="w-full bg-transparent text-meta outline-none placeholder:text-muted-foreground/70"
                      autoFocus
                    />
                  </div>
                  <div className="px-3 py-2 text-tiny font-medium text-muted-foreground/80">
                    {t('composer.skillPickerTitle', { agent: currentAgentName })}
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {skillsLoading ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground">
                        {t('composer.skillLoading')}
                      </div>
                    ) : skillsError ? (
                      <div className="px-3 py-4 text-xs text-destructive">
                        {skillsError}
                      </div>
                    ) : filteredQuickSkills.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-muted-foreground">
                        {t('composer.skillEmpty')}
                      </div>
                    ) : (
                      filteredQuickSkills.map((skill) => (
                        <SkillPickerItem
                          key={`${skill.source}:${skill.name}`}
                          skill={skill}
                          selected={false}
                          onSelect={() => {
                            const textarea = textareaRef.current;
                            const nextToken = getSkillPrefix(skill.name);
                            const selectionStart = textarea?.selectionStart ?? input.length;
                            const selectionEnd = textarea?.selectionEnd ?? input.length;
                            let nextValue = input;
                            let adjustedStart = selectionStart;
                            let adjustedEnd = selectionEnd;

                            const leadingSpace = needsLeadingSkillSpace(nextValue, adjustedStart) ? ' ' : '';
                            nextValue = `${nextValue.slice(0, adjustedStart)}${leadingSpace}${nextToken}${nextValue.slice(adjustedEnd)}`;
                            setSelectedSkill(null);
                            setInput(nextValue);
                            setSkillPickerOpen(false);
                            setSkillQuery('');
                            requestAnimationFrame(() => {
                              textareaRef.current?.focus();
                              const cursorPosition = adjustedStart + leadingSpace.length + nextToken.length;
                              textareaRef.current?.setSelectionRange(cursorPosition, cursorPosition);
                            });
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {showModelPicker && (
              <div ref={modelPickerRef} className="relative shrink-0">
                <button
                  type="button"
                  data-testid="chat-model-picker-button"
                  className={cn(
                    'inline-flex h-8 max-w-[220px] items-center gap-1 rounded-lg px-1.5 text-meta font-medium text-muted-foreground transition-colors hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:pointer-events-none disabled:opacity-50',
                    (modelPickerOpen || switchingModelRef) && 'text-foreground',
                  )}
                  onClick={() => {
                    setPickerOpen(false);
                    setSkillPickerOpen(false);
                    setThinkingPickerOpen(false);
                    setWorkspaceMenuOpen(false);
                    setModelPickerOpen((open) => !open);
                  }}
                  disabled={inputDisabled || sending || !currentAgent || !!switchingModelRef}
                  title={t('composer.pickModel')}
                >
                  {switchingModelRef ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : null}
                  <span className="truncate">{currentModelLabel}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', modelPickerOpen && 'rotate-180')} />
                </button>
                {modelPickerOpen && (
                  <div
                    className="absolute left-0 bottom-full z-20 mb-2 w-72 overflow-hidden rounded-2xl border border-black/10 bg-surface-modal p-1.5 shadow-xl dark:border-white/10"
                    data-testid="chat-model-picker-menu"
                  >
                    <div className="flex items-center justify-between px-3 py-2 text-tiny font-medium text-muted-foreground/80">
                      <span>{t('composer.modelPickerTitle')}</span>
                      <button
                        type="button"
                        className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
                        title={t('composer.savePreset')}
                        onClick={handleCreatePreset}
                      >
                        <Plus className="h-3 w-3" />
                        {t('composer.preset')}
                      </button>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {modelPresets.length > 0 && (
                        <div className="mb-1 border-b border-black/10 pb-1 dark:border-white/10" data-testid="chat-model-presets">
                          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                            {t('composer.presets')}
                          </div>
                          {modelPresets.map((preset) => {
                            const available = isConfiguredModelRefAvailable(preset.modelRef, modelOptions);
                            const active = preset.modelRef === effectiveModelRef && preset.thinkingLevel === currentThinkingLevel;
                            return (
                              <div key={preset.id} className={cn('group/preset flex min-h-9 items-center rounded-xl', active && 'bg-primary/10')}>
                                {editingPresetId === preset.id ? (
                                  <InlineNameEditor
                                    value={preset.name}
                                    ariaLabel={t('composer.editPresetName')}
                                    saveLabel={t('composer.saveModelName')}
                                    cancelLabel={t('composer.cancelModelName')}
                                    onSave={(name) => { renameModelPreset(preset.id, name); setEditingPresetId(null); }}
                                    onCancel={() => setEditingPresetId(null)}
                                  />
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      disabled={!available}
                                      title={available ? preset.modelRef : t('composer.presetModelUnavailable', { model: preset.modelRef })}
                                      className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45"
                                      onClick={() => handleSelectPreset(preset)}
                                    >
                                      <span className="min-w-0">
                                        <span className="block truncate text-sm font-medium">{preset.name}</span>
                                        <span className="block truncate text-[10px] text-muted-foreground">{thinkingLevelLabel(preset.thinkingLevel)}</span>
                                      </span>
                                      {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                                    </button>
                                    <button type="button" className="p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover/preset:opacity-100" title={t('composer.editPresetName')} onClick={() => setEditingPresetId(preset.id)}><Pencil className="h-3.5 w-3.5" /></button>
                                    <button type="button" className="mr-2 p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover/preset:opacity-100" title={t('composer.deletePreset')} onClick={() => deleteModelPreset(preset.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {modelGroups.map((group) => {
                        const isActive = group.baseKey === effectiveModelVariant.baseKey;
                        const displayName = resolveModelDisplayName(group.original.modelRef, modelAliases[group.baseKey], group.original.label);
                        const isEditing = editingModelKey === group.baseKey;
                        return (
                          <div
                            key={group.baseKey}
                            className={cn(
                              'group/model flex min-h-9 items-center rounded-xl transition-colors',
                              isActive ? 'bg-primary/10 text-foreground' : 'hover:bg-black/5 dark:hover:bg-white/5',
                            )}
                          >
                            {isEditing ? (
                              <InlineNameEditor
                                value={editingModelName}
                                ariaLabel={t('composer.editModelName')}
                                saveLabel={t('composer.saveModelName')}
                                cancelLabel={t('composer.cancelModelName')}
                                resetLabel={t('composer.resetModelName')}
                                onSave={finishEditingModelName}
                                onCancel={() => setEditingModelKey(null)}
                                onReset={() => { resetModelAlias(group.baseKey); setEditingModelKey(null); }}
                              />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleSelectModelGroup(group)}
                                  className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium"
                                  data-testid={`chat-model-picker-option-${group.baseKey}`}
                                  title={group.original.modelRef}
                                >
                                  <span className="truncate">{displayName}</span>
                                  {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                                </button>
                                <button
                                  type="button"
                                  className="mr-2 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-black/5 hover:text-foreground group-hover/model:opacity-100 dark:hover:bg-white/10"
                                  title={t('composer.editModelName')}
                                  aria-label={t('composer.editModelNameFor', { model: displayName })}
                                  onClick={() => startEditingModelName(group)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {showThinkingPicker && currentModelGroup && (
              <div ref={thinkingPickerRef} className="relative shrink-0">
                <button
                  type="button"
                  data-testid="chat-thinking-picker-button"
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-lg px-1.5 text-meta font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
                    thinkingPickerOpen && 'text-foreground',
                  )}
                  disabled={inputDisabled || sending || !!switchingModelRef}
                  onClick={() => {
                    setPickerOpen(false);
                    setSkillPickerOpen(false);
                    setModelPickerOpen(false);
                    setWorkspaceMenuOpen(false);
                    setThinkingPickerOpen((open) => !open);
                  }}
                  title={t('composer.thinkingEffort')}
                >
                  <span>{displayThinkingLevel(currentThinkingLevel)}</span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', thinkingPickerOpen && 'rotate-180')} />
                </button>
                {thinkingPickerOpen && (
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-2xl border border-black/10 bg-surface-modal p-1.5 shadow-xl dark:border-white/10" data-testid="chat-thinking-picker-menu">
                    <div className="px-3 py-2 text-tiny font-medium text-muted-foreground/80">{t('composer.thinkingEffort')}</div>
                    {thinkingLevels.map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => handleSelectThinkingLevel(level)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors',
                          currentThinkingLevel === level ? 'bg-primary/10 text-foreground' : 'hover:bg-black/5 dark:hover:bg-white/5',
                        )}
                      >
                        <span>{displayThinkingLevel(level)}</span>
                        {currentThinkingLevel === level && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Button
              onClick={sending && !canSubmit ? handleStop : handleSend}
              disabled={sending && !canSubmit ? !canStop : !canSubmit}
              size="icon"
              data-testid="chat-composer-send"
              className={`ml-auto shrink-0 h-8 w-8 rounded-lg transition-colors ${
                (sending || canSubmit)
                  ? 'bg-black/5 dark:bg-white/10 text-foreground hover:bg-black/10 dark:hover:bg-white/20'
                  : 'text-muted-foreground/50 hover:bg-transparent bg-transparent'
              }`}
              variant="ghost"
              title={sending && !canSubmit
                ? t('composer.stop')
                : sending
                  ? t('composer.addToQueue')
                  : t('composer.send')}
            >
              {sending && !canSubmit ? (
                <Square className="h-3.5 w-3.5" fill="currentColor" />
              ) : (
                <SendHorizontal className="h-4 w-4" strokeWidth={2} />
              )}
            </Button>
          </div>
        </div>
        <div
          className="mt-[15px] flex h-6 min-w-0 items-center justify-between gap-2 px-[5px] text-tiny text-muted-foreground/60"
          data-testid="chat-composer-footer"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {workspaceLabel && workspacePath && (
              <div ref={workspaceMenuRef} className="relative min-w-0 shrink" onKeyDown={handleWorkspaceKeyDown}>
                <button
                  type="button"
                  data-testid="chat-workspace-selector"
                  title={workspacePath}
                  aria-disabled={workspaceSelectorDisabled ? 'true' : undefined}
                  aria-expanded={!workspaceSelectorDisabled ? workspaceMenuOpen : undefined}
                  tabIndex={workspaceSelectorDisabled ? -1 : undefined}
                  onClick={workspaceSelectorDisabled ? undefined : handleWorkspaceButtonClick}
                  className={cn(
                    'inline-flex h-6 min-w-0 max-w-[260px] items-center gap-1 rounded-full border px-2',
                    'bg-black/[0.02] text-tiny font-medium text-foreground/75 transition-colors dark:bg-white/[0.04]',
                    workspaceSelectorDisabled
                      ? 'cursor-default border-transparent opacity-80'
                      : 'border-black/10 hover:bg-black/5 hover:text-foreground dark:border-white/10 dark:hover:bg-white/10',
                  )}
                >
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">
                    {t('composer.workspacePrefix', { workspace: workspaceLabel })}
                  </span>
                  {!workspaceSelectorDisabled && (
                    <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', workspaceMenuOpen && 'rotate-180')} />
                  )}
                </button>
                <AnimatePresence initial={false}>
                {workspaceMenuOpen && !workspaceSelectorDisabled && (
                  <motion.div
                    data-testid="chat-workspace-menu"
                    className="absolute bottom-full left-0 z-20 mb-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-black/10 bg-surface-modal p-1.5 shadow-xl dark:border-white/10"
                    initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: reduceMotion ? 0.01 : 0.16, ease: [0.22, 1, 0.36, 1] }}
                    style={{ transformOrigin: 'bottom left' }}
                  >
                    <button
                      type="button"
                      data-testid="chat-workspace-default"
                      aria-current={isDefaultWorkspacePath(workspacePath) ? 'true' : undefined}
                      onClick={handleSelectDefaultWorkspace}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10',
                        isDefaultWorkspacePath(workspacePath) && 'bg-black/5 dark:bg-white/10',
                      )}
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{t('composer.defaultWorkspaceOption')}</span>
                      {isDefaultWorkspacePath(workspacePath) && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                    {workspaceOptions.map((option) => {
                      const optionPath = normalizeWorkspacePath(option.path);
                      if (!optionPath || isDefaultWorkspacePath(optionPath)) return null;
                      const selected = optionPath === normalizeWorkspacePath(workspacePath);
                      return (
                        <button
                          key={optionPath}
                          type="button"
                          data-testid={`chat-workspace-option-${encodeURIComponent(optionPath)}`}
                          title={optionPath}
                          aria-current={selected ? 'true' : undefined}
                          onClick={() => handleSelectWorkspace(optionPath)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10',
                            selected && 'bg-black/5 dark:bg-white/10',
                          )}
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{option.label}</span>
                          {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                    <div className="my-1 border-t border-black/5 dark:border-white/10" />
                    <button
                      type="button"
                      data-testid="chat-workspace-choose-other"
                      onClick={() => setWorkspaceDialogOpen(true)}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{t('composer.chooseOtherWorkspaceOption')}</span>
                    </button>
                  </motion.div>
                )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
            <RequestStats state={props.state} />



          </div>
        </div>
      </div>
    </div>
  );
}

// ── Attachment Preview ───────────────────────────────────────────

function AttachmentPreview({
  attachment,
  onRemove,
}: {
  attachment: FileAttachment;
  onRemove: () => void;
}) {
  const { t } = useTranslation('chat');
  const isImage = attachment.mimeType.startsWith('image/') && attachment.preview;

  return (
    <div data-testid="chat-attachment-preview" className="relative group rounded-lg overflow-hidden border border-border">
      {isImage ? (
        // Image thumbnail
        <div className="w-16 h-16">
          <img
            src={attachment.preview!}
            alt={attachment.fileName}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        // Generic file card
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-input/50 max-w-[200px]">
          <FileIcon mimeType={attachment.mimeType} className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 overflow-hidden">
            <p className="text-xs font-medium truncate">{attachment.fileName}</p>
            <p className="text-2xs text-muted-foreground">
              {attachment.mimeType === DIRECTORY_MIME_TYPE
                ? t('composer.folderAttachment')
                : attachment.fileSize > 0
                  ? formatFileSize(attachment.fileSize)
                  : '...'}
            </p>
          </div>
        </div>
      )}

      {/* Staging overlay */}
      {attachment.status === 'staging' && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <Loader2 className="h-4 w-4 text-white animate-spin" />
        </div>
      )}

      {/* Error overlay */}
      {attachment.status === 'error' && (
        <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center">
          <span className="text-2xs text-destructive font-medium px-1">{t('common:status.error')}</span>
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`${t('common:actions.delete')}: ${attachment.fileName}`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SkillPickerItem({
  skill,
  selected,
  onSelect,
}: {
  skill: QuickAccessSkill;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={`chat-composer-skill-option-${skill.name}`}
          onClick={onSelect}
          className={cn(
            'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors',
            selected ? 'bg-primary/10 text-foreground' : 'hover:bg-black/5 dark:hover:bg-white/5',
          )}
        >
          <div className="min-w-0">
            <div className="truncate text-meta font-semibold text-foreground">
              <span className="font-mono">/{skill.name}</span>
            </div>
            <div className="truncate text-tiny text-muted-foreground">
              {skill.sourceLabel}
            </div>
          </div>
          <span className="rounded-full border border-black/10 bg-black/[0.03] px-2 py-0.5 text-2xs font-medium text-muted-foreground dark:border-white/10 dark:bg-white/[0.04]">
            {skill.sourceLabel}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
        {skill.description}
      </TooltipContent>
    </Tooltip>
  );
}
